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
import { normalizeScale } from "@myakiba/contracts/shared/scale";
import { command, fail, ok, query } from "@/domain/kernel";
import type { CustomItemInput, EntriesWithRoles } from "./model";

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
        throw new Error("FAILED_TO_CREATE_CUSTOM_ITEM");
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
        return fail("not_found", "Entry not found");
      }

      for (const entryLink of entryLinks) {
        if (!entryLink.entryId) {
          continue;
        }
        const matchedEntry = existingEntriesById.get(entryLink.entryId);
        if (!matchedEntry) {
          return fail("not_found", "Entry not found");
        }
        if (matchedEntry.category !== entryLink.category) {
          return fail("bad_request", "Entry category mismatch");
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

      const entryToItemLinks = entryLinks
        .map((entryLink) => {
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
            return null;
          }
          return {
            entryId: matchedEntry.id,
            role: entryLink.role ?? "",
            category: matchedEntry.category,
            name: matchedEntry.name,
          };
        })
        .filter(
          (
            entryLink,
          ): entryLink is {
            entryId: string;
            role: string;
            category: string;
            name: string;
          } => entryLink !== null,
        );

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
      return ok(result);
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
      return ok(result);
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

      if (!itemData) return fail("not_found", "Item not found");

      const { isWishlisted, ...itemRecord } = itemData;
      const result = {
        item: {
          ...itemRecord,
          scale: normalizeScale(itemRecord.scale),
        },
        isWishlisted,
      };
      return ok(result);
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
      return ok(result);
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
      return ok(result);
    },
  ),
};
