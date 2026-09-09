import type { JobData, QueuedCollectionItem } from "@myakiba/contracts/sync/schema";
import type { ExistingItemWithLatestRelease } from "./model";
import { prepareCsvItems } from "./csv";

export function buildRetryJobData(
  requestPayload: JobData,
  failedItemExternalIds: ReadonlySet<number>,
  existingItems: readonly ExistingItemWithLatestRelease[],
): JobData {
  if (requestPayload.type === "item") {
    const itemExternalIds = requestPayload.itemExternalIds.filter((id) =>
      failedItemExternalIds.has(id),
    );
    return { ...requestPayload, itemExternalIds };
  }

  const existingItemsByExternalId = new Map(existingItems.map((item) => [item.externalId, item]));
  const latestReleaseIdByItemId = new Map(
    existingItems
      .filter((item) => failedItemExternalIds.has(item.externalId))
      .map((item) => [item.id, item.releaseId]),
  );
  let originalItemsToInsert: QueuedCollectionItem[];
  if (requestPayload.type === "csv") {
    originalItemsToInsert = requestPayload.itemsToInsert;
  } else if (requestPayload.type === "collection") {
    originalItemsToInsert = requestPayload.collection.itemsToInsert;
  } else {
    originalItemsToInsert = requestPayload.order.itemsToInsert;
  }

  // Restore only failed results from this import.
  // Resolve releases again because Item Refresh may have removed the saved selections.
  const itemsToInsert = originalItemsToInsert
    .filter((item) => latestReleaseIdByItemId.has(item.itemId))
    .map((item) => ({
      ...item,
      releaseId: latestReleaseIdByItemId.get(item.itemId) ?? null,
    }));

  if (requestPayload.type === "csv") {
    const failedItems = requestPayload.items.filter((item) =>
      failedItemExternalIds.has(item.itemExternalId),
    );
    const { collectionItems, orderItems, csvItemsToScrape } = prepareCsvItems(
      failedItems,
      existingItems,
      requestPayload.userId,
    );
    const orderIds = new Set(
      itemsToInsert.flatMap((item) => (item.orderId === null ? [] : [item.orderId])),
    );

    const ordersToInsert = [
      ...requestPayload.ordersToInsert.filter((order) => orderIds.has(order.id)),
      ...orderItems,
    ];
    const retryItemsToInsert = [...itemsToInsert, ...collectionItems];

    return {
      ...requestPayload,
      items: csvItemsToScrape,
      itemsToInsert: retryItemsToInsert,
      ordersToInsert,
    };
  }

  if (requestPayload.type === "order" || requestPayload.type === "order-item") {
    const failedItems = requestPayload.order.itemsToScrape.filter((item) =>
      failedItemExternalIds.has(item.itemExternalId),
    );
    const itemsToScrape: typeof requestPayload.order.itemsToScrape = [];

    for (const item of failedItems) {
      const { collectionId, itemExternalId, ...details } = item;
      const existingItem = existingItemsByExternalId.get(itemExternalId);
      if (!existingItem) {
        itemsToScrape.push(item);
        continue;
      }

      itemsToInsert.push({
        ...details,
        id: collectionId,
        itemId: existingItem.id,
        releaseId: existingItem.releaseId,
        shop: requestPayload.order.details.shop,
        score: "0.0",
        notes: "",
        tags: [],
      });
    }

    return {
      ...requestPayload,
      order: {
        details: requestPayload.order.details,
        itemsToScrape,
        itemsToInsert,
      },
    };
  }

  const failedItems = requestPayload.collection.itemsToScrape.filter((item) =>
    failedItemExternalIds.has(item.itemExternalId),
  );
  const itemsToScrape: typeof requestPayload.collection.itemsToScrape = [];

  for (const item of failedItems) {
    const { collectionId, itemExternalId, ...details } = item;
    const existingItem = existingItemsByExternalId.get(itemExternalId);
    if (!existingItem) {
      itemsToScrape.push(item);
      continue;
    }

    itemsToInsert.push({
      ...details,
      id: collectionId,
      itemId: existingItem.id,
      releaseId: existingItem.releaseId,
      orderId: null,
      status: "Owned",
    });
  }

  return {
    ...requestPayload,
    collection: { itemsToScrape, itemsToInsert },
  };
}
