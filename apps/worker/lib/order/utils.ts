import type {
  FinalizeOrderSyncParams,
  FinalizePersistenceSummary,
  FinalizeSyncResult,
} from "../types";
import { and, eq } from "drizzle-orm";
import { assembleScrapedData } from "../assemble-scraped-data";
import { persistScrapedItemData } from "../persist-scraped-item-data";
import { finalizeSync } from "../utils";
import { advanceOrderReleaseDatesForCollectionItems } from "@myakiba/db/order-release-date";
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
  initialSuccessCount,
  syncSessionId,
  createOrder,
}: FinalizeOrderSyncParams): Promise<FinalizeSyncResult> {
  const assembledData = assembleScrapedData(successfulResults);
  const { items, entries, entryToItems, itemReleases } = assembledData;
  const successfulIds = new Set(successfulResults.map((result) => result.id));
  const successfulOrderItems = itemsToScrape.filter((orderItem) =>
    successfulIds.has(orderItem.itemExternalId),
  );
  const scrapeRowCount = itemsToScrape.length;
  const totalRowCount = initialSuccessCount + scrapeRowCount;

  // Adding items can move the release date later. Keep the other saved order details.
  const shouldUpdateExistingOrder =
    itemReleases.length > 0 || itemsToInsert.some((item) => item.releaseId !== null);
  const shouldCreateOrder = createOrder && itemsToInsert.length + successfulOrderItems.length > 0;

  const persistence: FinalizePersistenceSummary = {
    items: items.length,
    itemReleases: itemReleases.length,
    entries: entries.length,
    entryToItems: entryToItems.length,
    collectionItems: itemsToInsert.length + successfulOrderItems.length,
    orders: shouldCreateOrder || shouldUpdateExistingOrder ? 1 : 0,
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
      if (!createOrder) {
        const [existingOrder] = await tx
          .select({ id: order.id })
          .from(order)
          .where(and(eq(order.id, details.id), eq(order.userId, details.userId)))
          .for("update");
        if (!existingOrder) throw new Error("ORDER_NOT_FOUND");
      }

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

      const collectionRows = [...itemsToInsert, ...scrapedOrderItems];

      if (shouldCreateOrder) {
        await tx.insert(order).values(details);
      }

      if (collectionRows.length > 0) {
        const insertedCollectionItems = await tx
          .insert(collection)
          .values(collectionRows)
          .returning({ id: collection.id });
        await advanceOrderReleaseDatesForCollectionItems(
          tx,
          insertedCollectionItems.map(({ id }) => id),
        );
      }

      const result = {
        successCount: initialSuccessCount + scrapedOrderItems.length,
        failCount: scrapeRowCount - scrapedOrderItems.length,
      };
      if (createOrder && !shouldCreateOrder) return result;

      return { ...result, orderId: details.id };
    },
  });
}
