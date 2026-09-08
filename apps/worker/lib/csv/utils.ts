import type {
  FinalizeCsvSyncParams,
  FinalizePersistenceSummary,
  FinalizeSyncResult,
} from "../types";
import { parseMoneyToMinorUnits } from "@myakiba/utils/currency";
import { assembleScrapedData } from "../assemble-scraped-data";
import { persistScrapedItemData } from "../persist-scraped-item-data";
import { finalizeSync } from "../utils";
import { order, collection } from "@myakiba/db/schema/figure";

export async function finalizeCsvSync({
  successfulResults,
  failures,
  log,
  userId,
  redis,
  state,
  csvItems,
  itemsToInsert,
  ordersToInsert,
  existingCount,
  syncSessionId,
}: FinalizeCsvSyncParams): Promise<FinalizeSyncResult> {
  const assembledData = assembleScrapedData(successfulResults);
  const { items, entries, entryToItems, itemReleases, latestReleaseIdByExternalId } = assembledData;
  const successfulResultsById = new Map(
    successfulResults.map((result) => [result.id, result] as const),
  );
  const successfulCollectionItems = csvItems.filter((csvItem) =>
    successfulResultsById.has(csvItem.itemExternalId),
  );
  const scrapeRowCount = csvItems.length;
  const totalRowCount = existingCount + scrapeRowCount;

  const collectionItems = successfulCollectionItems.map((ci) => ({
    id: ci.collectionId,
    userId,
    itemExternalId: ci.itemExternalId,
    status: ci.status,
    count: ci.count,
    score: ci.score.trim() === "" ? "0.0" : ci.score,
    paymentDate: ci.payment_date,
    shippingDate: ci.shipping_date,
    collectionDate: ci.collecting_date,
    price: ci.price.trim() === "" ? 0 : parseMoneyToMinorUnits(ci.price),
    shop: ci.shop,
    shippingMethod: ci.shipping_method,
    notes: ci.note,
    orderId: ci.orderId,
    orderDate: ci.orderDate,
  }));

  const orders = successfulCollectionItems.flatMap((ci) => {
    if (ci.orderId === null) return [];
    return [
      {
        id: ci.orderId,
        userId,
        title: successfulResultsById.get(ci.itemExternalId)?.title ?? `Order ${ci.orderId}`,
        shop: ci.shop,
        orderDate: ci.orderDate,
        paymentDate: ci.payment_date,
        shippingDate: ci.shipping_date,
        collectionDate: ci.collecting_date,
        shippingMethod: ci.shipping_method,
        releaseDate: latestReleaseIdByExternalId.get(ci.itemExternalId)?.date ?? null,
        status: "Ordered" as const,
        shippingFee: 0,
        taxes: 0,
        duties: 0,
        tariffs: 0,
        miscFees: 0,
        notes: "",
      },
    ];
  });

  const persistence: FinalizePersistenceSummary = {
    items: items.length,
    itemReleases: itemReleases.length,
    entries: entries.length,
    entryToItems: entryToItems.length,
    collectionItems: itemsToInsert.length + collectionItems.length,
    orders: new Set([...ordersToInsert, ...orders].map((orderRow) => orderRow.id)).size,
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

      const collectionItemsToInsert: (typeof collection.$inferInsert)[] = collectionItems.map(
        (collectionItem) => {
          const internalItemId = externalIdToInternalId.get(collectionItem.itemExternalId);
          if (!internalItemId) {
            throw new Error(`Missing persisted Item ${collectionItem.itemExternalId}`);
          }
          return {
            id: collectionItem.id,
            userId: collectionItem.userId,
            itemId: internalItemId,
            orderId: collectionItem.orderId,
            status: collectionItem.status,
            count: collectionItem.count,
            score: collectionItem.score,
            paymentDate: collectionItem.paymentDate,
            shippingDate: collectionItem.shippingDate,
            collectionDate: collectionItem.collectionDate,
            price: collectionItem.price,
            shop: collectionItem.shop,
            shippingMethod: collectionItem.shippingMethod,
            notes: collectionItem.notes,
            releaseId: latestReleaseIdByInternalId.get(internalItemId)?.releaseId ?? null,
            orderDate: collectionItem.orderDate,
          };
        },
      );

      const dedupedOrders = [
        ...new Map(
          [...ordersToInsert, ...orders].map((orderRow) => [orderRow.id, orderRow] as const),
        ).values(),
      ];
      if (dedupedOrders.length > 0) {
        await tx.insert(order).values(dedupedOrders);
      }
      const collectionRows = [...itemsToInsert, ...collectionItemsToInsert];
      if (collectionRows.length > 0) {
        await tx.insert(collection).values(collectionRows);
      }

      return {
        successCount: existingCount + collectionItemsToInsert.length,
        failCount: scrapeRowCount - collectionItemsToInsert.length,
      };
    },
  });
}
