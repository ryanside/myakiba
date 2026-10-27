import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import {
  collection,
  entry,
  entry_to_item,
  item,
  item_release,
  order,
  wishlistItem,
} from "@myakiba/db/schema/figure";
import type { ItemRelease, ItemReleasesResponse } from "@myakiba/contracts/item/schema";
import type { ItemRefresh } from "@myakiba/contracts/mfc-items/schema";
import { normalizeScale } from "@myakiba/contracts/shared/scale";
import type { ReadTx, Tx } from "@myakiba/db/tx";
import { mfcItemId } from "@myakiba/mfc/page";
import { redis } from "@myakiba/redis/client";
import { getResyncCooldown, setResyncCooldown } from "@myakiba/redis/item-resync";
import type { ItemResyncState } from "@myakiba/redis/item-resync";
import { ResyncCooldownUnavailable } from "@myakiba/redis/errors/resync-cooldown-unavailable";
import type { RequestLogger } from "evlog";
import { Result, panic } from "better-result";
import { command, query } from "@/domain/kernel";
import { EntryCategoryMismatch } from "./errors/entry-category-mismatch";
import { EntryNotFound } from "./errors/entry-not-found";
import { ItemNotFound } from "./errors/item-not-found";
import { MfcPageRejected } from "@/lib/errors/mfc-page-rejected";
import { StoreItemPictureFailed } from "@/lib/errors/store-item-picture-failed";
import { ResyncCooldownActive } from "./errors/resync-cooldown-active";
import { findMfcItem, pictureLog, readMfcItemPage } from "@/lib/mfc-item-ingest";
import type { CustomItemInput, EntriesWithRoles } from "./model";
import { lockItem, refreshItem } from "./refresh-item";

type ResyncResult = ItemResyncState & { readonly saved: "refreshed" | "unchanged" };

async function findResyncItem(tx: ReadTx, externalId: number) {
  const id = mfcItemId(externalId);
  if (id === null) return;
  const itemId = await findMfcItem(tx, id);
  return itemId === undefined ? undefined : { id, itemId };
}

// The cooldown is written before the refresh commits, so it holds only while the
// transaction that wrote it has not aborted. A transaction Postgres can no longer look up,
// or one newer than this database after a restore, counts as committed.
async function cooldownHeldUntil(
  tx: ReadTx,
  itemId: string,
): Promise<Result<string | null, ResyncCooldownUnavailable>> {
  const read = await getResyncCooldown(redis, itemId);
  if (read.isErr()) return read;
  const cooldown = read.value;
  if (!cooldown) return Result.ok(null);
  if (cooldown.transactionId === null) return Result.ok(cooldown.expiresAt);
  const xid = sql`${cooldown.transactionId}::xid8`;
  const [writer] = await tx
    .select({
      status: sql<
        string | null
      >`case when ${xid} < pg_snapshot_xmax(pg_current_snapshot()) then pg_xact_status(${xid}) end`,
    })
    .from(item)
    .where(eq(item.id, itemId));
  return Result.ok(writer?.status === "aborted" ? null : cooldown.expiresAt);
}

async function currentTransactionId(tx: Tx): Promise<string> {
  const [row] = await tx.execute<{ id: string }>(sql`select pg_current_xact_id()::text as id`);
  if (!row)
    panic(
      "select pg_current_xact_id() returned no row, so item.resync cannot name its transaction",
    );
  return row.id;
}

async function resyncState(
  tx: ReadTx,
  itemId: string,
  log: RequestLogger,
): Promise<ItemResyncState> {
  const held =
    redis.status === "ready"
      ? await cooldownHeldUntil(tx, itemId)
      : Result.err(
          new ResyncCooldownUnavailable({
            itemId,
            cause: new Error(`Redis is ${redis.status}`),
          }),
        );
  if (held.isErr()) {
    log.set({ cooldown: { itemId, operation: "read", outcome: "unavailable" } });
    log.warn(held.error.message, { failure: held.error });
    return { status: "idle", cooldownExpiresAt: null };
  }
  if (held.value) return { status: "cooldown", cooldownExpiresAt: held.value };
  return { status: "idle", cooldownExpiresAt: null };
}

export const Items = {
  createCustom: command(
    { action: "item.createCustom", failure: "Failed to create custom item" },
    async (scope, input: CustomItemInput) => {
      const [createdItem] = await scope.tx
        .insert(item)
        .values({
          title: input.title,
          category: input.category,
          version: input.version ?? [],
          scale: normalizeScale(input.scale),
          height: input.height ?? null,
          width: input.width ?? null,
          depth: input.depth ?? null,
          image: input.image ?? null,
          source: "custom",
          externalId: null,
        })
        .returning({
          id: item.id,
          externalId: item.externalId,
          source: item.source,
          title: item.title,
          category: item.category,
          version: item.version,
          scale: item.scale,
          height: item.height,
          width: item.width,
          depth: item.depth,
          image: item.image,
        });

      if (!createdItem) {
        panic(
          "Inserting the custom item returned no row, so item.createCustom has nothing to link",
        );
      }

      const entryLinks = input.entries ?? [];
      const entryIds = [
        ...new Set(
          entryLinks.flatMap((entryLink) => (entryLink.entryId ? [entryLink.entryId] : [])),
        ),
      ];

      const existingEntries =
        entryIds.length > 0
          ? await scope.tx
              .select({
                id: entry.id,
                name: entry.name,
                category: entry.category,
              })
              .from(entry)
              .where(inArray(entry.id, entryIds))
          : [];

      const existingEntriesById = new Map(
        existingEntries.map((existingEntry) => [existingEntry.id, existingEntry]),
      );

      if (entryIds.length > existingEntries.length) {
        return Result.err(new EntryNotFound());
      }

      for (const entryLink of entryLinks) {
        if (!entryLink.entryId) {
          continue;
        }
        const matchedEntry = existingEntriesById.get(entryLink.entryId);
        if (!matchedEntry) {
          return Result.err(new EntryNotFound());
        }
        if (matchedEntry.category !== entryLink.category) {
          return Result.err(new EntryCategoryMismatch());
        }
      }

      const namedEntryLinks = entryLinks.filter(
        (entryLink) => !entryLink.entryId && entryLink.name,
      );
      const uniqueNamedEntries = [
        ...new Map(
          namedEntryLinks.map((entryLink) => [
            `${entryLink.name}|${entryLink.category}`,
            entryLink,
          ]),
        ).values(),
      ];

      const existingNamedEntries =
        uniqueNamedEntries.length > 0
          ? await scope.tx
              .select({
                id: entry.id,
                name: entry.name,
                category: entry.category,
              })
              .from(entry)
              .where(
                or(
                  ...uniqueNamedEntries.map((entryLink) =>
                    and(
                      eq(entry.name, entryLink.name ?? ""),
                      eq(entry.category, entryLink.category),
                    ),
                  ),
                ),
              )
          : [];

      const existingNamedEntriesByKey = new Map(
        existingNamedEntries.map((existingEntry) => [
          `${existingEntry.name}|${existingEntry.category}`,
          existingEntry,
        ]),
      );

      const entriesToCreate = uniqueNamedEntries.filter(
        (entryLink) => !existingNamedEntriesByKey.has(`${entryLink.name}|${entryLink.category}`),
      );

      const entriesToInsert: (typeof entry.$inferInsert)[] = entriesToCreate.map((entryLink) => ({
        name: entryLink.name ?? "",
        category: entryLink.category,
        source: "custom",
        externalId: null,
      }));

      const createdEntries =
        entriesToInsert.length > 0
          ? await scope.tx.insert(entry).values(entriesToInsert).returning({
              id: entry.id,
              name: entry.name,
              category: entry.category,
            })
          : [];

      const entriesByNameCategory = new Map(
        [...existingNamedEntries, ...createdEntries].map((entryRecord) => [
          `${entryRecord.name}|${entryRecord.category}`,
          entryRecord,
        ]),
      );

      const entryToItemLinks = entryLinks.map((entryLink) => {
        if (entryLink.entryId) {
          return {
            entryId: entryLink.entryId,
            role: entryLink.role ?? "",
            category: entryLink.category,
            name: existingEntriesById.get(entryLink.entryId)?.name ?? "",
          };
        }

        const lookupKey = `${entryLink.name}|${entryLink.category}`;
        const matchedEntry = entriesByNameCategory.get(lookupKey);
        if (!matchedEntry) {
          panic(
            `item.createCustom could not link named Entry ${lookupKey} after reading and inserting its Entries`,
          );
        }
        return {
          entryId: matchedEntry.id,
          role: entryLink.role ?? "",
          category: matchedEntry.category,
          name: matchedEntry.name,
        };
      });

      if (entryToItemLinks.length > 0) {
        await scope.tx
          .insert(entry_to_item)
          .values(
            entryToItemLinks.map((entryLink) => ({
              entryId: entryLink.entryId,
              itemId: createdItem.id,
              role: entryLink.role,
              roles: entryLink.role ? [entryLink.role] : [],
            })),
          )
          .onConflictDoNothing({
            target: [entry_to_item.entryId, entry_to_item.itemId],
          });
      }

      const releasesToInsert = (input.releases ?? []).map((release) => ({
        itemId: createdItem.id,
        date: release.date,
        type: release.type ?? null,
        price: release.price ?? null,
        priceCurrency: release.priceCurrency ?? null,
        barcode: release.barcode ?? null,
      }));

      const createdReleases =
        releasesToInsert.length > 0
          ? await scope.tx.insert(item_release).values(releasesToInsert).returning({
              id: item_release.id,
              itemId: item_release.itemId,
              date: item_release.date,
              type: item_release.type,
              price: item_release.price,
              priceCurrency: item_release.priceCurrency,
              barcode: item_release.barcode,
            })
          : [];

      const entrySummary = entryToItemLinks.map((entryLink) => ({
        id: entryLink.entryId,
        category: entryLink.category,
        name: entryLink.name,
        role: entryLink.role,
        roles: entryLink.role ? [entryLink.role] : [],
        sourceLabel: null,
        materialPercentage: null,
      }));

      const result = {
        item: {
          ...createdItem,
          releases: createdReleases,
          entries: entrySummary,
        },
      };
      return Result.ok(result);
    },
  ),

  releases: query(
    { action: "item.getReleases", failure: "Failed to get item releases" },
    async (scope, input: { readonly id: string }) => {
      scope.log.set({ item: { id: input.id } });
      const releases = await scope.tx
        .select({
          id: item_release.id,
          itemId: item_release.itemId,
          date: item_release.date,
          type: item_release.type,
          price: item_release.price,
          priceCurrency: item_release.priceCurrency,
          barcode: item_release.barcode,
        })
        .from(item_release)
        .where(eq(item_release.itemId, input.id))
        .orderBy(asc(item_release.date), asc(item_release.createdAt), asc(item_release.id));

      const result: ItemReleasesResponse = { releases };
      scope.log.set({ result: { count: result.releases.length } });
      return Result.ok(result);
    },
  ),

  get: query(
    { action: "item.get", failure: "Failed to get item" },
    async (scope, input: { readonly id: number }) => {
      scope.log.set({ item: { externalId: input.id } });
      const [itemData] = await scope.tx
        .select({
          id: item.id,
          externalId: item.externalId,
          source: item.source,
          title: item.title,
          mfcTitle: item.mfcTitle,
          numbering: item.numbering,
          category: item.category,
          version: item.version,
          scale: item.scale,
          height: item.height,
          width: item.width,
          depth: item.depth,
          image: item.image,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          isWishlisted: sql<boolean>`${wishlistItem.id} IS NOT NULL`,
          releases: sql<ItemRelease[]>`
            COALESCE(
              (
                SELECT JSON_AGG(
                  JSON_BUILD_OBJECT(
                    'id', ir.id,
                    'itemId', ir.item_id,
                    'date', ir.date,
                    'type', ir.type,
                    'price', ir.price,
                    'priceCurrency', ir.price_currency,
                    'barcode', ir.barcode
                  )
                  ORDER BY ir.date DESC, ir.created_at DESC, ir.id DESC
                )
                FROM ${item_release} ir
                WHERE ir.item_id = ${item}.id
              ),
              '[]'::json
            )
          `,
          entries: sql<EntriesWithRoles[]>`
            COALESCE(
              (
                SELECT JSON_AGG(
                  JSON_BUILD_OBJECT(
                    'id', e.id,
                    'category', e.category,
                    'name', e.name,
                    'role', eti.role,
                    'roles', CASE
                      WHEN CARDINALITY(eti.roles) > 0 THEN eti.roles
                      WHEN NULLIF(eti.role, '') IS NOT NULL THEN ARRAY[eti.role]
                      ELSE ARRAY[]::text[]
                    END,
                    'sourceLabel', eti.source_label,
                    'materialPercentage', eti.material_percentage
                  )
                  ORDER BY e.category, LOWER(COALESCE(eti.source_label, e.name)), e.name, e.id
                )
                FROM ${entry_to_item} eti
                LEFT JOIN ${entry} e ON eti.entry_id = e.id
                WHERE eti.item_id = ${item}.id
              ),
              '[]'::json
            )
          `,
        })
        .from(item)
        .leftJoin(
          wishlistItem,
          and(eq(wishlistItem.userId, scope.viewer.userId), eq(wishlistItem.itemId, item.id)),
        )
        .where(and(eq(item.source, "mfc"), eq(item.externalId, input.id)));

      if (!itemData) return Result.err(new ItemNotFound());

      const { isWishlisted, ...itemRecord } = itemData;
      const result = {
        item: {
          ...itemRecord,
          scale: normalizeScale(itemRecord.scale),
        },
        isWishlisted,
      };
      return Result.ok(result);
    },
  ),

  relatedOrders: query(
    { action: "item.getRelatedOrders", failure: "Failed to get item related orders" },
    async (scope, input: { readonly id: number }) => {
      scope.log.set({ item: { externalId: input.id } });
      const orders = await scope.tx
        .select({
          id: order.id,
          title: order.title,
          shop: order.shop,
          releaseDate: order.releaseDate,
          shippingFee: order.shippingFee,
          taxes: order.taxes,
          duties: order.duties,
          tariffs: order.tariffs,
          miscFees: order.miscFees,
        })
        .from(order)
        .innerJoin(collection, eq(order.id, collection.orderId))
        .innerJoin(item, eq(collection.itemId, item.id))
        .where(
          and(
            eq(item.source, "mfc"),
            eq(item.externalId, input.id),
            eq(order.userId, scope.viewer.userId),
          ),
        )
        .groupBy(order.id)
        .orderBy(desc(order.releaseDate), desc(order.createdAt), desc(order.id));

      const result = { orders };
      return Result.ok(result);
    },
  ),

  relatedCollection: query(
    { action: "item.getRelatedCollection", failure: "Failed to get item related collections" },
    async (scope, input: { readonly id: number }) => {
      scope.log.set({ item: { externalId: input.id } });
      const collectionItems = await scope.tx
        .select({
          id: collection.id,
          itemId: collection.itemId,
          orderId: collection.orderId,
          status: collection.status,
          count: collection.count,
          releaseId: collection.releaseId,
          score: collection.score,
          price: collection.price,
          shop: collection.shop,
          orderDate: collection.orderDate,
          paymentDate: collection.paymentDate,
          shippingDate: collection.shippingDate,
          collectionDate: collection.collectionDate,
          shippingMethod: collection.shippingMethod,
          tags: collection.tags,
          condition: collection.condition,
          notes: collection.notes,
          createdAt: collection.createdAt,
          updatedAt: collection.updatedAt,
        })
        .from(collection)
        .innerJoin(item, eq(collection.itemId, item.id))
        .where(
          and(
            eq(item.source, "mfc"),
            eq(item.externalId, input.id),
            eq(collection.userId, scope.viewer.userId),
          ),
        )
        .groupBy(collection.id)
        .orderBy(desc(collection.createdAt), desc(collection.id));

      const result = { collection: collectionItems };
      return Result.ok(result);
    },
  ),

  resyncStatus: query(
    { action: "item.resyncStatus", failure: "Failed to check item refresh status" },
    async (scope, input: { readonly id: number }) => {
      scope.log.set({ item: { externalId: input.id } });
      const found = await findResyncItem(scope.tx, input.id);
      if (!found) return Result.err(new ItemNotFound());
      const state = await resyncState(scope.tx, found.itemId, scope.log);
      scope.log.set({ resyncStatus: state.status });
      return Result.ok(state);
    },
  ),

  resync: command(
    {
      action: "item.requestResync",
      failure: "Failed to request item refresh",
      // Cooldown reads that guard a refresh and picture storage still fail closed: each
      // answers the logged 500 after the rollback has dropped the refresh.
      operational: [ResyncCooldownUnavailable, StoreItemPictureFailed],
      before: async (scope, input: { readonly id: number } & ItemRefresh) => {
        scope.log.set({ item: { externalId: input.id } });
        const found = await findResyncItem(scope.tx, input.id);
        if (!found) return Result.err(new ItemNotFound());
        const held = await cooldownHeldUntil(scope.tx, found.itemId);
        if (held.isErr()) return held;
        if (held.value) return Result.err(new ResyncCooldownActive());
        const read = await readMfcItemPage(found.id, input);
        if (read.isErr()) {
          const failure = read.error;
          if (failure._tag === "StoreItemPictureFailed") return Result.err(failure);
          scope.log.set({ mfc: { itemId: found.id, outcome: failure.problem.kind } });
          return Result.err(new MfcPageRejected({ problem: failure.problem.kind }));
        }
        const { page, stored } = read.value;
        return scope.proceed({ itemId: found.itemId, page, stored });
      },
    },
    async (scope, { itemId, page, stored }) => {
      const locked = await lockItem(scope.tx, itemId);
      if (!locked) return Result.err(new ItemNotFound());
      const held = await cooldownHeldUntil(scope.tx, itemId);
      if (held.isErr()) return held;
      if (held.value) return Result.err(new ResyncCooldownActive());
      const image = stored?.kind === "stored" ? stored.url : locked.image;
      const outcome = await refreshItem(scope.tx, locked, page, image);
      scope.log.set({
        mfc: {
          itemId: page.mfcItemId,
          contentLabel: page.contentLabel,
          outcome,
          picture: pictureLog(stored),
          warnings: page.warnings,
        },
      });
      const cooldown =
        redis.status === "ready"
          ? await setResyncCooldown(redis, itemId, await currentTransactionId(scope.tx))
          : Result.err(
              new ResyncCooldownUnavailable({
                itemId,
                cause: new Error(`Redis is ${redis.status}`),
              }),
            );
      if (cooldown.isErr()) {
        scope.log.set({ cooldown: { itemId, operation: "write", outcome: "unavailable" } });
        scope.log.warn(cooldown.error.message, { failure: cooldown.error });
        return Result.ok({
          status: "idle",
          cooldownExpiresAt: null,
          saved: outcome === "unchanged" ? "unchanged" : "refreshed",
        } satisfies ResyncResult);
      }
      return cooldown.map((cooldownExpiresAt): ResyncResult => ({
        status: "cooldown",
        cooldownExpiresAt,
        saved: outcome === "unchanged" ? "unchanged" : "refreshed",
      }));
    },
  ),
};
