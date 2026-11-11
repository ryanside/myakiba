import { and, asc, desc, eq, sql } from "drizzle-orm";
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
import type { ReadTx } from "@myakiba/db/tx";
import { mfcItemId } from "@myakiba/mfc/page";
import { Result } from "better-result";
import { command, query } from "@/domain/kernel";
import type { Viewer } from "@/domain/viewer";
import { ItemNotFound } from "@/lib/errors/item-not-found";
import { MfcPageRejected } from "@/lib/errors/mfc-page-rejected";
import { StoreItemPictureFailed } from "@/lib/errors/store-item-picture-failed";
import { findMfcItem, refreshItem } from "@/lib/item-database";
import { pictureLog, readMfcItemPage } from "@/lib/mfc-item-ingest";
import type { EntriesWithRoles } from "./model";

async function findResyncItem(tx: ReadTx, viewer: Viewer, externalId: number) {
  const id = mfcItemId(externalId);
  if (id === null) return;
  const itemId = await findMfcItem(tx, viewer, id);
  return itemId === undefined ? undefined : { id, itemId };
}

export const Items = {
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
        .innerJoin(item, eq(item.id, item_release.itemId))
        .where(and(eq(item.ownerId, scope.viewer.userId), eq(item_release.itemId, input.id)))
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
        .where(
          and(
            eq(item.ownerId, scope.viewer.userId),
            eq(item.source, "mfc"),
            eq(item.externalId, input.id),
          ),
        );

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

  resync: command(
    {
      action: "item.requestResync",
      failure: "Failed to request item refresh",
      operational: [StoreItemPictureFailed],
      before: async (scope, input: { readonly id: number } & ItemRefresh) => {
        scope.log.set({ item: { externalId: input.id } });
        const found = await findResyncItem(scope.tx, scope.viewer, input.id);
        if (!found) return Result.err(new ItemNotFound());
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
      const refreshed = await refreshItem(scope.tx, scope.viewer, itemId, page, stored);
      if (refreshed.isErr()) return refreshed;
      const outcome = refreshed.value;
      scope.log.set({
        mfc: {
          itemId: page.mfcItemId,
          contentLabel: page.contentLabel,
          outcome,
          picture: pictureLog(stored),
          warnings: page.warnings,
        },
      });
      return Result.ok({ saved: outcome === "unchanged" ? "unchanged" : "refreshed" } as const);
    },
  ),
};
