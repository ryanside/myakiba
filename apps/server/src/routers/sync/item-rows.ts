import type { JobData, UpdatedSyncOrder } from "@myakiba/contracts/sync/schema";
import { advanceOrderReleaseDatesForCollectionItems } from "@myakiba/db/order-release-date";
import { collection, order } from "@myakiba/db/schema/figure";
import type { Tx } from "@myakiba/db/tx";
import { parseMoneyToMinorUnits } from "@myakiba/utils/currency";
import type { ExistingItemWithLatestRelease } from "./model";

export type ItemRows = {
  readonly collectionItems: readonly (typeof collection.$inferInsert)[];
  readonly orders: readonly UpdatedSyncOrder[];
};

export function idsToFetch(payload: JobData): number[] {
  let ids: readonly number[];
  switch (payload.type) {
    case "item":
      ids = payload.itemExternalIds;
      break;
    case "csv":
      ids = payload.items.map((row) => row.itemExternalId);
      break;
    case "collection":
      ids = payload.collection.itemsToScrape.map((row) => row.itemExternalId);
      break;
    case "order":
    case "order-item":
      ids = payload.order.itemsToScrape.map((row) => row.itemExternalId);
      break;
  }
  return [...new Set(ids)];
}

export function fetchedItemRows(payload: JobData, item: ExistingItemWithLatestRelease): ItemRows {
  const releaseId = item.releaseId;
  switch (payload.type) {
    case "item":
      return { collectionItems: [], orders: [] };
    case "collection":
      return {
        orders: [],
        collectionItems: payload.collection.itemsToScrape
          .filter((row) => row.itemExternalId === item.externalId)
          .map((row) => ({
            id: row.collectionId,
            userId: row.userId,
            itemId: item.id,
            orderId: null,
            status: "Owned" as const,
            count: row.count,
            releaseId,
            score: row.score,
            price: row.price,
            shop: row.shop,
            orderDate: row.orderDate,
            paymentDate: row.paymentDate,
            shippingDate: row.shippingDate,
            collectionDate: row.collectionDate,
            shippingMethod: row.shippingMethod,
            tags: row.tags,
            condition: row.condition,
            notes: row.notes,
          })),
      };
    case "order":
    case "order-item": {
      const { details } = payload.order;
      return {
        orders: [],
        collectionItems: payload.order.itemsToScrape
          .filter((row) => row.itemExternalId === item.externalId)
          .map((row) => ({
            id: row.collectionId,
            userId: row.userId,
            itemId: item.id,
            orderId: row.orderId,
            status: row.status,
            count: row.count,
            releaseId,
            score: "0.0",
            price: row.price,
            shop: details.shop,
            orderDate: row.orderDate,
            paymentDate: row.paymentDate,
            shippingDate: row.shippingDate,
            collectionDate: row.collectionDate,
            shippingMethod: row.shippingMethod,
            tags: [],
            condition: row.condition,
            notes: "",
          })),
      };
    }
    case "csv": {
      const rows = payload.items.filter((row) => row.itemExternalId === item.externalId);
      return {
        collectionItems: rows.map((row) => ({
          id: row.collectionId,
          userId: payload.userId,
          itemId: item.id,
          orderId: row.orderId,
          status: row.status,
          count: row.count,
          score: row.score.trim() === "" ? "0.0" : row.score,
          paymentDate: row.payment_date,
          shippingDate: row.shipping_date,
          collectionDate: row.collecting_date,
          price: parseMoneyToMinorUnits(row.price),
          shop: row.shop,
          shippingMethod: row.shipping_method,
          notes: row.note,
          releaseId,
          orderDate: row.orderDate,
        })),
        orders: rows.flatMap((row) =>
          row.orderId === null
            ? []
            : [
                {
                  id: row.orderId,
                  userId: payload.userId,
                  title: item.title,
                  shop: row.shop,
                  orderDate: row.orderDate,
                  paymentDate: row.payment_date,
                  shippingDate: row.shipping_date,
                  collectionDate: row.collecting_date,
                  shippingMethod: row.shipping_method,
                  releaseDate: item.releaseDate,
                  status: "Ordered" as const,
                  shippingFee: 0,
                  taxes: 0,
                  duties: 0,
                  tariffs: 0,
                  miscFees: 0,
                  notes: "",
                },
              ],
        ),
      };
    }
  }
}

export async function insertItemRows(
  tx: Tx,
  syncType: JobData["type"],
  { collectionItems, orders }: ItemRows,
): Promise<void> {
  if (orders.length > 0) await tx.insert(order).values([...orders]);
  if (collectionItems.length === 0) return;
  const inserted = await tx
    .insert(collection)
    .values([...collectionItems])
    .returning({ id: collection.id });
  if (syncType !== "collection") {
    await advanceOrderReleaseDatesForCollectionItems(
      tx,
      inserted.map(({ id }) => id),
    );
  }
}
