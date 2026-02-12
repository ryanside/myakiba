import type { ShippingMethod } from "@myakiba/types";
import type { FinalizeCsvSyncParams } from "../types";
import { parseMoneyToMinorUnits } from "@myakiba/utils";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@myakiba/db";
import { assembleScrapedData } from "../assemble-scraped-data";
import {
  markPersistFailedSyncSessionItemStatuses,
  setJobStatus,
  updateSyncSessionCounts,
} from "../utils";
import {
  item,
  item_release,
  entry,
  entry_to_item,
  order,
  collection,
} from "@myakiba/db/schema/figure";

export async function finalizeCsvSync({
  successfulResults,
  job,
  userId,
  redis,
  csvItems,
  existingCount,
  syncSessionId,
}: FinalizeCsvSyncParams) {
  const { items, entries, entryToItems, itemReleases, latestReleaseIdByExternalId } =
    assembleScrapedData(successfulResults);
  const successfulCollectionItems = csvItems.filter((i) =>
    successfulResults.some((result) => result.id === i.itemExternalId),
  );
  const scrapeRowCount = csvItems.length;
  const totalRowCount = existingCount + scrapeRowCount;
  let scrapedPersistedRowCount = 0;
  let collectionItems: Array<{
    userId: string;
    itemId: string | null;
    itemExternalId: number;
    status: "Owned" | "Ordered";
    count: number;
    score: string;
    paymentDate: string | null;
    shippingDate: string | null;
    collectionDate: string | null;
    price: number;
    shop: string;
    shippingMethod: ShippingMethod;
    notes: string;
    releaseId: string | null;
    orderId: string | null;
    orderDate: string | null;
  }> = [];
  let orders: Array<{
    id: string;
    userId: string;
    title: string;
    shop: string;
    orderDate: string | null;
    paymentDate: string | null;
    shippingDate: string | null;
    collectionDate: string | null;
    shippingMethod: ShippingMethod;
    releaseDate: string | null;
  }> = [];

  collectionItems = successfulCollectionItems.map((ci) => ({
    userId: userId,
    itemId: null,
    itemExternalId: ci.itemExternalId,
    status: ci.status as "Owned" | "Ordered",
    count: ci.count,
    score: ci.score && ci.score.trim() !== "" ? ci.score.toString() : "0.0",
    paymentDate: ci.payment_date,
    shippingDate: ci.shipping_date,
    collectionDate: ci.collecting_date,
    price: ci.price && ci.price.trim() !== "" ? parseMoneyToMinorUnits(ci.price) : 0,
    shop: ci.shop,
    shippingMethod: ci.shipping_method,
    notes: ci.note,
    releaseId: null,
    orderId: ci.orderId,
    orderDate: ci.orderDate,
  }));

  orders = successfulCollectionItems
    .filter((ci) => ci.orderId !== null)
    .map((ci) => ({
      id: ci.orderId!,
      userId: userId,
      title:
        successfulResults.find((result) => result.id === ci.itemExternalId)?.title ??
        `Order ${ci.orderId}`,
      shop: ci.shop,
      orderDate: ci.orderDate,
      paymentDate: ci.payment_date,
      shippingDate: ci.shipping_date,
      collectionDate: ci.collecting_date,
      shippingMethod: ci.shipping_method,
      releaseDate: latestReleaseIdByExternalId.get(ci.itemExternalId)?.date ?? null,
    }));

  console.log("Items to be inserted:", items);
  console.log("Releases to be inserted:", itemReleases);
  console.log("Entries to be inserted:", entries);
  console.log("Entry to Items to be inserted:", entryToItems);
  console.log("Collection Items to be inserted:", collectionItems);
  console.log("Orders to be inserted:", orders);

  try {
    await db.transaction(async (tx) => {
      if (items.length > 0) {
        await tx
          .insert(item)
          .values(items)
          .onConflictDoNothing({ target: [item.source, item.externalId] });
      }

      const itemExternalIds = items
        .map((dbItem) => dbItem.externalId)
        .filter((externalId): externalId is number => externalId !== null);
      const dbItems =
        itemExternalIds.length > 0
          ? await tx
              .select({ id: item.id, externalId: item.externalId })
              .from(item)
              .where(and(eq(item.source, "mfc"), inArray(item.externalId, itemExternalIds)))
          : [];
      const externalIdToInternalId = new Map(
        dbItems.map((dbItem) => [dbItem.externalId, dbItem.id]),
      );

      if (entries.length > 0) {
        await tx
          .insert(entry)
          .values(entries)
          .onConflictDoNothing({ target: [entry.source, entry.externalId] });
      }

      const entryExternalIds = entries
        .map((dbEntry) => dbEntry.externalId)
        .filter((externalId): externalId is number => externalId !== null);
      const dbEntries =
        entryExternalIds.length > 0
          ? await tx
              .select({ id: entry.id, externalId: entry.externalId })
              .from(entry)
              .where(and(eq(entry.source, "mfc"), inArray(entry.externalId, entryExternalIds)))
          : [];
      const externalIdToEntryId = new Map(
        dbEntries.map((dbEntry) => [dbEntry.externalId, dbEntry.id]),
      );

      const itemReleasesToInsert = itemReleases
        .map((release) => {
          const internalItemId = externalIdToInternalId.get(release.itemExternalId);
          if (!internalItemId) {
            return null;
          }
          return {
            id: release.id,
            itemId: internalItemId,
            date: release.date,
            type: release.type,
            price: release.price,
            priceCurrency: release.priceCurrency,
            barcode: release.barcode,
          };
        })
        .filter(
          (
            release,
          ): release is {
            id: string;
            itemId: string;
            date: string;
            type: string;
            price: number;
            priceCurrency: string;
            barcode: string;
          } => release !== null,
        );

      if (itemReleasesToInsert.length > 0) {
        await tx
          .insert(item_release)
          .values(itemReleasesToInsert)
          .onConflictDoNothing({ target: [item_release.id] });
      }

      const entryToItemsToInsert = entryToItems
        .map((link) => {
          const entryId = externalIdToEntryId.get(link.entryExternalId);
          const itemId = externalIdToInternalId.get(link.itemExternalId);
          if (!entryId || !itemId) {
            return null;
          }
          return {
            entryId,
            itemId,
            role: link.role,
          };
        })
        .filter(
          (
            link,
          ): link is {
            entryId: string;
            itemId: string;
            role: string;
          } => link !== null,
        );

      if (entryToItemsToInsert.length > 0) {
        await tx
          .insert(entry_to_item)
          .values(entryToItemsToInsert)
          .onConflictDoNothing({
            target: [entry_to_item.entryId, entry_to_item.itemId],
          });
      }

      const latestReleaseIdByInternalId = new Map<
        string,
        { releaseId: string | null; date: string | null }
      >();
      for (const [externalId, releaseInfo] of latestReleaseIdByExternalId) {
        const internalItemId = externalIdToInternalId.get(externalId);
        if (internalItemId) {
          latestReleaseIdByInternalId.set(internalItemId, releaseInfo);
        }
      }

      const collectionItemsToInsert: Array<typeof collection.$inferInsert> =
        collectionItems.flatMap((collectionItem) => {
          const internalItemId = externalIdToInternalId.get(collectionItem.itemExternalId);
          if (!internalItemId) {
            return [];
          }
          return [
            {
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
            },
          ];
        });

      scrapedPersistedRowCount = collectionItemsToInsert.length;

      if (orders.length > 0) {
        await tx.insert(order).values(orders);
      }
      if (collectionItemsToInsert.length > 0) {
        await tx.insert(collection).values(collectionItemsToInsert);
      }
    });

    console.log("Successfully inserted data to database.");
  } catch (error) {
    const scrapedItemIds = successfulResults.map((result) => result.id);
    const successCount = existingCount;
    const failCount = scrapeRowCount;
    const sessionStatus =
      failCount === 0
        ? ("completed" as const)
        : successCount > 0
          ? ("partial" as const)
          : ("failed" as const);
    const statusMessage =
      sessionStatus === "partial"
        ? "Sync partially completed: Failed to persist scraped items."
        : "Sync failed: Failed to persist scraped items.";

    await markPersistFailedSyncSessionItemStatuses({
      syncSessionId,
      scrapedItemIds,
      errorReason: "Persistence failed while saving scraped items",
    });
    await setJobStatus({
      redis,
      jobId: job.id!,
      statusMessage,
      finished: true,
      syncSessionId,
      sessionStatus,
    });
    await updateSyncSessionCounts({
      syncSessionId,
      successCount,
      failCount,
    });
    console.error("Failed to insert data to database.", error);
    return {
      status: "Sync Job completed",
      processedAt: new Date().toISOString(),
    };
  }

  const successCount = existingCount + scrapedPersistedRowCount;
  const failCount = scrapeRowCount - scrapedPersistedRowCount;
  const sessionStatus =
    failCount === 0
      ? ("completed" as const)
      : successCount > 0
        ? ("partial" as const)
        : ("failed" as const);
  const statusLabel =
    sessionStatus === "completed"
      ? "completed"
      : sessionStatus === "partial"
        ? "partially completed"
        : "failed";

  await setJobStatus({
    redis,
    jobId: job.id!,
    statusMessage: `Sync ${statusLabel}: Synced ${successCount} out of ${totalRowCount} items`,
    finished: true,
    syncSessionId,
    sessionStatus,
  });
  await updateSyncSessionCounts({
    syncSessionId,
    successCount,
    failCount,
  });

  return {
    status: "Sync Job completed",
    processedAt: new Date().toISOString(),
  };
}
