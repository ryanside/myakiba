import { Result } from "better-result";
import { inArray } from "drizzle-orm";
import type { JobData, UpdatedSyncOrder } from "@myakiba/contracts/sync/schema";
import { advanceOrderReleaseDatesForCollectionItems } from "@myakiba/db/order-release-date";
import { collection, order } from "@myakiba/db/schema/figure";
import type { Tx } from "@myakiba/db/tx";
import { buildRetryJobData } from "./retry";
import type { ExistingItemWithLatestRelease } from "./model";
import { SyncOrderUnowned } from "./errors/sync-order-unowned";

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
      ids = payload.collection.itemsToFetch.map((row) => row.itemExternalId);
      break;
    case "order":
    case "order-item":
      ids = payload.order.itemsToFetch.map((row) => row.itemExternalId);
      break;
  }
  return [...new Set(ids)];
}

export function fetchedItemRows(payload: JobData, item: ExistingItemWithLatestRelease): ItemRows {
  if (payload.type !== "csv") {
    return retryRows(buildRetryJobData(payload, new Set([item.externalId]), [item]));
  }
  const rows = payload.items.filter((row) => row.itemExternalId === item.externalId);
  return {
    collectionItems: rows.map((row) => ({
      id: row.collectionId,
      userId: payload.userId,
      itemId: item.id,
      releaseId: item.releaseId,
      orderId: row.orderId,
      status: row.status,
      count: row.count,
      score: row.score.trim() === "" ? "0.0" : row.score,
      price: row.priceMinorUnits,
      shop: row.shop,
      orderDate: row.orderDate,
      paymentDate: row.payment_date,
      shippingDate: row.shipping_date,
      collectionDate: row.collecting_date,
      shippingMethod: row.shipping_method,
      notes: row.note,
    })),
    orders: rows.flatMap((row) =>
      row.orderId === null
        ? []
        : [
            {
              id: row.orderId,
              userId: payload.userId,
              title: item.title ?? `Order ${row.orderId}`,
              shop: row.shop,
              orderDate: row.orderDate,
              releaseDate: item.releaseDate,
              paymentDate: row.payment_date,
              shippingDate: row.shipping_date,
              collectionDate: row.collecting_date,
              shippingMethod: row.shipping_method,
              status: "Ordered",
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

export function retryRows(retry: JobData): ItemRows {
  switch (retry.type) {
    case "item":
      return { collectionItems: [], orders: [] };
    case "csv":
      return { collectionItems: retry.itemsToInsert, orders: retry.ordersToInsert };
    case "collection":
      return { collectionItems: retry.collection.itemsToInsert, orders: [] };
    case "order":
    case "order-item":
      return { collectionItems: retry.order.itemsToInsert, orders: [] };
  }
}

export async function insertItemRows(
  tx: Tx,
  syncType: JobData["type"],
  { collectionItems, orders }: ItemRows,
): Promise<Result<void, SyncOrderUnowned>> {
  if (orders.length > 0) {
    const uniqueOrders = [...new Map(orders.map((row) => [row.id, row])).values()];
    await tx.insert(order).values(uniqueOrders).onConflictDoNothing({ target: order.id });
  }
  const references = [
    ...orders.map(({ id, userId }) => ({ id, userId })),
    ...collectionItems.flatMap(({ orderId, userId }) => (orderId ? [{ id: orderId, userId }] : [])),
  ];
  if (references.length > 0) {
    const owners = await tx
      .select({ id: order.id, userId: order.userId })
      .from(order)
      .where(inArray(order.id, [...new Set(references.map(({ id }) => id))]))
      .orderBy(order.id)
      .for("update");
    const userByOrderId = new Map(owners.map((row) => [row.id, row.userId]));
    const unowned = references.filter((row) => userByOrderId.get(row.id) !== row.userId);
    if (unowned.length > 0) {
      return Result.err(
        new SyncOrderUnowned({ orderIds: [...new Set(unowned.map(({ id }) => id))] }),
      );
    }
  }
  if (collectionItems.length === 0) return Result.ok();
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
  return Result.ok();
}
