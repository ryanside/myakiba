import type {
  FinalizeCollectionSyncParams,
  FinalizePersistenceSummary,
  FinalizeSyncResult,
} from "../types";
import { assembleScrapedData } from "../assemble-scraped-data";
import { persistScrapedItemData } from "../persist-scraped-item-data";
import { finalizeSync } from "../utils";
import { collection } from "@myakiba/db/schema/figure";

export async function finalizeCollectionSync({
  successfulResults,
  failures,
  log,
  redis,
  state,
  itemsToScrape,
  itemsToInsert,
  existingCount,
  syncSessionId,
}: FinalizeCollectionSyncParams): Promise<FinalizeSyncResult> {
  const assembledData = assembleScrapedData(successfulResults);
  const { items, entries, entryToItems, itemReleases } = assembledData;
  const successfulIds = new Set(successfulResults.map((result) => result.id));
  const successfulCollectionItems = itemsToScrape.filter((collectionItem) =>
    successfulIds.has(collectionItem.itemExternalId),
  );
  const scrapeRowCount = itemsToScrape.length;
  const totalRowCount = existingCount + scrapeRowCount;

  const persistence: FinalizePersistenceSummary = {
    items: items.length,
    itemReleases: itemReleases.length,
    entries: entries.length,
    entryToItems: entryToItems.length,
    collectionItems: itemsToInsert.length + successfulCollectionItems.length,
    orders: 0,
  };

  log.set({ persistence });

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

      const scrapedCollectionItems = successfulCollectionItems.map((collectionItem) => {
        const itemId = externalIdToInternalId.get(collectionItem.itemExternalId);
        if (!itemId) throw new Error(`Missing persisted Item ${collectionItem.itemExternalId}`);

        return {
          id: collectionItem.collectionId,
          userId: collectionItem.userId,
          itemId,
          orderId: null,
          status: "Owned" as const,
          count: collectionItem.count,
          releaseId: latestReleaseIdByInternalId.get(itemId)?.releaseId ?? null,
          score: collectionItem.score,
          price: collectionItem.price,
          shop: collectionItem.shop,
          orderDate: collectionItem.orderDate,
          paymentDate: collectionItem.paymentDate,
          shippingDate: collectionItem.shippingDate,
          collectionDate: collectionItem.collectionDate,
          shippingMethod: collectionItem.shippingMethod,
          tags: collectionItem.tags,
          condition: collectionItem.condition,
          notes: collectionItem.notes,
        };
      });

      const collectionRows = [...itemsToInsert, ...scrapedCollectionItems];
      if (collectionRows.length > 0) {
        await tx.insert(collection).values(collectionRows);
      }

      return {
        successCount: existingCount + scrapedCollectionItems.length,
        failCount: scrapeRowCount - scrapedCollectionItems.length,
      };
    },
  });
}
