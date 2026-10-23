import type { JobData, UpdatedSyncOrder } from "@myakiba/contracts/sync/schema";
import { advanceOrderReleaseDatesForCollectionItems } from "@myakiba/db/order-release-date";
import { collection, order } from "@myakiba/db/schema/figure";
import type { Tx } from "@myakiba/db/tx";
import { buildRetryJobData } from "./retry";
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
  return retryRows(buildRetryJobData(payload, new Set([item.externalId]), [item]));
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
