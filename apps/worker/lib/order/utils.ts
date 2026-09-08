import type {
  FinalizeOrderSyncParams,
  FinalizePersistenceSummary,
  FinalizeSyncResult,
} from "../types";
import { eq } from "drizzle-orm";
import { assembleScrapedData } from "../assemble-scraped-data";
import { persistScrapedItemData } from "../persist-scraped-item-data";
import { finalizeSync } from "../utils";
import { order, collection } from "@myakiba/db/schema/figure";

export async function finalizeOrderSync({
  successfulResults,
  failures,
  log,
  redis,
  state,
  details,
  itemsToScrape,
  itemsToInsert,
  existingCount,
  syncSessionId,
  syncMode,
}: FinalizeOrderSyncParams): Promise<FinalizeSyncResult> {
  const assembledData = assembleScrapedData(successfulResults);
  const { items, entries, entryToItems, itemReleases, latestReleaseIdByExternalId } = assembledData;
  const successfulIds = new Set(successfulResults.map((result) => result.id));
  const successfulOrderItems = itemsToScrape.filter((orderItem) =>
    successfulIds.has(orderItem.itemExternalId),
  );
  const scrapeRowCount = itemsToScrape.length;
  const totalRowCount = existingCount + scrapeRowCount;

  let latestReleaseDate: string | null = null;
  for (const releaseInfo of latestReleaseIdByExternalId.values()) {
    if (releaseInfo.date && (!latestReleaseDate || releaseInfo.date > latestReleaseDate)) {
      latestReleaseDate = releaseInfo.date;
    }
  }

  const shouldUpdateReleaseDate =
    latestReleaseDate !== null && (!details.releaseDate || latestReleaseDate > details.releaseDate);

  if (shouldUpdateReleaseDate) {
    details.releaseDate = latestReleaseDate;
  }

  // Adding items can move the release date later. Keep the other saved order details.
  const shouldPersistOrderRecord = syncMode === "create";
  const shouldUpdateExistingOrder = syncMode === "append" && shouldUpdateReleaseDate;

  const persistence: FinalizePersistenceSummary = {
    items: items.length,
    itemReleases: itemReleases.length,
    entries: entries.length,
    entryToItems: entryToItems.length,
    collectionItems: itemsToInsert.length + successfulOrderItems.length,
    orders: shouldPersistOrderRecord || shouldUpdateExistingOrder ? 1 : 0,
  };

  log.set({
    order: {
      id: details.id,
      shop: details.shop,
      status: details.status,
    },
    persistence,
  });

  return finalizeSync({
    syncSessionId,
    failures,
    totalRowCount,
    scrapedCount: successfulResults.length,
    persistence,
    log,
    redis,
    state,
    persist: async (tx) => {
      const { externalIdToInternalId, latestReleaseIdByInternalId } = await persistScrapedItemData(
        tx,
        assembledData,
      );

      const scrapedOrderItems = successfulOrderItems.map((orderItem) => {
        const itemId = externalIdToInternalId.get(orderItem.itemExternalId);
        if (!itemId) throw new Error(`Missing persisted Item ${orderItem.itemExternalId}`);

        return {
          id: orderItem.collectionId,
          userId: orderItem.userId,
          itemId,
          orderId: orderItem.orderId,
          status: orderItem.status,
          count: orderItem.count,
          releaseId: latestReleaseIdByInternalId.get(itemId)?.releaseId ?? null,
          score: "0.0",
          price: orderItem.price,
          shop: details.shop,
          orderDate: orderItem.orderDate,
          paymentDate: orderItem.paymentDate,
          shippingDate: orderItem.shippingDate,
          collectionDate: orderItem.collectionDate,
          shippingMethod: orderItem.shippingMethod,
          tags: [],
          condition: orderItem.condition,
          notes: "",
        };
      });

      if (shouldPersistOrderRecord) {
        await tx.insert(order).values(details);
      } else if (shouldUpdateExistingOrder) {
        await tx
          .update(order)
          .set({
            releaseDate: details.releaseDate,
            updatedAt: new Date(),
          })
          .where(eq(order.id, details.id));
      }

      const collectionRows = [...itemsToInsert, ...scrapedOrderItems];
      if (collectionRows.length > 0) {
        await tx.insert(collection).values(collectionRows);
      }

      return {
        successCount: existingCount + scrapedOrderItems.length,
        failCount: scrapeRowCount - scrapedOrderItems.length,
        orderId: details.id,
      };
    },
  });
}
