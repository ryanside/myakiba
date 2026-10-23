import type { JobData, QueuedCollectionItem } from "@myakiba/contracts/sync/schema";
import type { ExistingItemWithLatestRelease } from "./model";
import { SYNC_STATUS_MESSAGES } from "@myakiba/contracts/sync/messages";
import type { SyncSessionCreation } from "./service";
import type { ItemRows } from "./item-rows";
import { idsToFetch } from "./item-rows";

export type PlannedSync = {
  readonly session: SyncSessionCreation;
  readonly requestPayload: JobData;
  readonly rows: ItemRows;
};

export function plannedSync({
  session,
  requestPayload,
  rows,
  completeOrders = rows.orders,
}: PlannedSync & { readonly completeOrders?: ItemRows["orders"] }) {
  const jobId = session.itemExternalIds.length > 0 ? session.id : null;
  const status: string = jobId
    ? SYNC_STATUS_MESSAGES.queued
    : SYNC_STATUS_MESSAGES.insertedFromExisting;
  return {
    session,
    requestPayload,
    rows,
    complete: {
      session,
      collectionItems: [...rows.collectionItems],
      orderItems: [...completeOrders],
      requestPayload,
    },
    response: {
      status,
      isFinished: !jobId,
      existingItemsToInsert: rows.collectionItems.length,
      newItems: session.itemExternalIds.length,
      jobId,
      syncSessionId: session.id,
      missingMfcItemIds: idsToFetch(requestPayload),
    },
  };
}

export function splitItems<
  T extends { readonly itemExternalId: number; readonly collectionId: string },
>({
  items,
  existingItems,
  userId,
}: {
  readonly items: readonly T[];
  readonly existingItems: readonly ExistingItemWithLatestRelease[];
  readonly userId: string;
}) {
  const existingByExternalId = new Map(existingItems.map((item) => [item.externalId, item]));
  const itemsToFetch: (T & { userId: string; itemId: null; releaseId: null })[] = [];
  const itemsToInsert: (T & { userId: string; itemId: string; releaseId: string | null })[] = [];
  const releaseDates: string[] = [];
  for (const item of items) {
    const existing = existingByExternalId.get(item.itemExternalId);
    if (existing) {
      itemsToInsert.push({ ...item, userId, itemId: existing.id, releaseId: existing.releaseId });
      if (existing.releaseDate) releaseDates.push(existing.releaseDate);
    } else {
      itemsToFetch.push({ ...item, userId, itemId: null, releaseId: null });
    }
  }
  return { itemsToFetch, itemsToInsert, releaseDates };
}

export function collectionRows(
  items: readonly (Omit<QueuedCollectionItem, "id"> & { readonly collectionId: string })[],
): QueuedCollectionItem[] {
  return items.map((item) => ({
    id: item.collectionId,
    userId: item.userId,
    itemId: item.itemId,
    orderId: item.orderId,
    status: item.status,
    count: item.count,
    score: item.score,
    price: item.price,
    shop: item.shop,
    orderDate: item.orderDate,
    paymentDate: item.paymentDate,
    shippingDate: item.shippingDate,
    collectionDate: item.collectionDate,
    shippingMethod: item.shippingMethod,
    condition: item.condition,
    notes: item.notes,
    tags: item.tags,
    releaseId: item.releaseId,
  }));
}
