import type { FinalizeOrderSyncParams } from "../types";
import type { UpdatedSyncOrderItem } from "@myakiba/schemas";
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
  syncSession,
} from "@myakiba/db/schema/figure";

export async function finalizeOrderSync({
  successfulResults,
  job,
  redis,
  details,
  itemsToScrape,
  existingCount,
  syncSessionId,
}: FinalizeOrderSyncParams) {
  const { items, entries, entryToItems, itemReleases, latestReleaseIdByExternalId } =
    assembleScrapedData(successfulResults);
  const successfulOrderItems = itemsToScrape.filter((orderItem) =>
    successfulResults.some((result) => result.id === orderItem.itemExternalId),
  );
  const scrapeRowCount = itemsToScrape.length;
  const totalRowCount = existingCount + scrapeRowCount;
  let scrapedPersistedRowCount = 0;

  // assign latest release id to successfulOrderItems
  // determine the latest release date from scraped items
  const latestReleaseDate = [...latestReleaseIdByExternalId.values()].sort(
    (a, b) => a.date?.localeCompare(b.date ?? "") ?? 0,
  )[latestReleaseIdByExternalId.size - 1]?.date;

  // compare current order.releaseDate with latestReleaseDate
  // if latestReleaseDate is after order.releaseDate, update order.releaseDate
  if (latestReleaseDate && (!details.releaseDate || latestReleaseDate > details.releaseDate)) {
    details.releaseDate = latestReleaseDate;
  }

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

      successfulOrderItems.forEach((orderItem) => {
        const internalItemId = externalIdToInternalId.get(orderItem.itemExternalId);
        if (!internalItemId) {
          return;
        }
        orderItem.itemId = internalItemId;
        orderItem.releaseId = latestReleaseIdByInternalId.get(internalItemId)?.releaseId ?? "";
      });

      const scrapedOrderItems = successfulOrderItems
        .filter(
          (orderItem): orderItem is UpdatedSyncOrderItem & { itemId: string } =>
            orderItem.itemId !== null,
        )
        .map((orderItem) => ({
          ...orderItem,
          itemId: orderItem.itemId,
          releaseId: orderItem.releaseId && orderItem.releaseId !== "" ? orderItem.releaseId : null,
        }));

      scrapedPersistedRowCount = scrapedOrderItems.length;

      await tx
        .insert(order)
        .values(details)
        .onConflictDoUpdate({
          target: [order.id],
          set: {
            title: details.title,
            shop: details.shop,
            orderDate: details.orderDate,
            releaseDate: details.releaseDate,
            paymentDate: details.paymentDate,
            shippingDate: details.shippingDate,
            collectionDate: details.collectionDate,
            shippingMethod: details.shippingMethod,
            status: details.status,
            shippingFee: details.shippingFee,
            taxes: details.taxes,
            duties: details.duties,
            tariffs: details.tariffs,
            miscFees: details.miscFees,
            notes: details.notes,
            updatedAt: new Date(),
          },
        });

      if (scrapedOrderItems.length > 0) {
        await tx.insert(collection).values(scrapedOrderItems);
      }

      await tx
        .update(syncSession)
        .set({ orderId: details.id, updatedAt: new Date() })
        .where(eq(syncSession.id, syncSessionId));
    });
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
