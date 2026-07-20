import type {
  FinalizeCollectionSyncParams,
  FinalizePersistenceSummary,
  FinalizeSyncResult,
} from "../types";
import type { UpdatedSyncCollection } from "@myakiba/contracts/sync/schema";
import { tryCatch } from "@myakiba/utils/result";
import { eq } from "drizzle-orm";
import { db } from "@myakiba/db/client";
import { assembleScrapedData } from "../assemble-scraped-data";
import { persistScrapedCatalog } from "../persist-scraped-catalog";
import {
  markPersistFailedSyncSessionItemStatuses,
  publishJobStatus,
  resolveTerminalState,
} from "../utils";
import { sessionStatusToPhase, sessionStatusToTerminalState } from "@myakiba/contracts/sync/schema";
import { collection, syncSession } from "@myakiba/db/schema/figure";

export async function finalizeCollectionSync({
  successfulResults,
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
  let scrapedPersistedRowCount = 0;

  const persistence: FinalizePersistenceSummary = {
    items: items.length,
    itemReleases: itemReleases.length,
    entries: entries.length,
    entryToItems: entryToItems.length,
    collectionItems: itemsToInsert.length + successfulCollectionItems.length,
    orders: 0,
  };

  log.set({ persistence });

  // assign latest release id to successfulCollectionItems
  const { error } = await tryCatch(
    db.transaction(async (tx) => {
      const { externalIdToInternalId, latestReleaseIdByInternalId } = await persistScrapedCatalog(
        tx,
        assembledData,
      );

      successfulCollectionItems.forEach((collectionItem) => {
        const internalItemId = externalIdToInternalId.get(collectionItem.itemExternalId);
        if (!internalItemId) {
          return;
        }
        collectionItem.itemId = internalItemId;
        collectionItem.releaseId = latestReleaseIdByInternalId.get(internalItemId)?.releaseId ?? "";
      });

      const scrapedCollectionItems = successfulCollectionItems
        .filter(
          (collectionItem): collectionItem is UpdatedSyncCollection & { itemId: string } =>
            collectionItem.itemId !== null,
        )
        .map((collectionItem) => ({
          id: collectionItem.collectionId,
          userId: collectionItem.userId,
          itemId: collectionItem.itemId,
          orderId: null,
          status: "Owned" as const,
          count: collectionItem.count,
          releaseId:
            collectionItem.releaseId && collectionItem.releaseId !== ""
              ? collectionItem.releaseId
              : null,
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
        }));

      scrapedPersistedRowCount = scrapedCollectionItems.length;

      const collectionRows = [...itemsToInsert, ...scrapedCollectionItems];
      if (collectionRows.length > 0) {
        await tx
          .insert(collection)
          .values(collectionRows)
          .onConflictDoNothing({ target: collection.id });
      }

      const successCount = existingCount + scrapedPersistedRowCount;
      const failCount = scrapeRowCount - scrapedPersistedRowCount;
      const { sessionStatus, statusMessage } = resolveTerminalState({
        successCount,
        failCount,
        totalRowCount,
      });
      await tx
        .update(syncSession)
        .set({
          status: sessionStatus,
          statusMessage,
          successCount,
          failCount,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(syncSession.id, syncSessionId));
    }),
  );

  if (error) {
    const scrapedItemIds = successfulResults.map((result) => result.id);
    const successCount = itemsToInsert.length > 0 ? 0 : existingCount;
    const failCount = itemsToInsert.length > 0 ? totalRowCount : scrapeRowCount;
    const persistenceError = error instanceof Error ? error : null;
    const { sessionStatus, statusMessage } = resolveTerminalState({
      successCount,
      failCount,
      totalRowCount,
      error: persistenceError,
    });

    await markPersistFailedSyncSessionItemStatuses({
      syncSessionId,
      scrapedItemIds,
      errorReason: "Persistence failed while saving scraped items",
    });
    state.phase = sessionStatusToPhase(sessionStatus);
    state.statusMessage = statusMessage;
    await publishJobStatus({
      redis,
      state,
      syncSessionId,
      sessionStatus,
      successCount,
      failCount,
      forceDurableUpdate: true,
      terminalState: sessionStatusToTerminalState(sessionStatus),
      error: {
        code: "persistence_failed",
        message: persistenceError?.message ?? statusMessage,
      },
    });

    if (error instanceof Error) {
      log.set({
        outcome: "error",
        sync: { sessionStatus, statusMessage },
      });
      log.error(error);
    }

    return {
      processedAt: new Date().toISOString(),
      successCount,
      failCount,
      scrapedPersistedRowCount: 0,
      sessionStatus,
      statusMessage,
      persistence,
    };
  }

  const successCount = existingCount + scrapedPersistedRowCount;
  const failCount = scrapeRowCount - scrapedPersistedRowCount;
  const { sessionStatus, statusMessage } = resolveTerminalState({
    successCount,
    failCount,
    totalRowCount,
  });
  state.phase = sessionStatusToPhase(sessionStatus);
  state.statusMessage = statusMessage;
  await publishJobStatus({
    redis,
    state,
    syncSessionId,
    sessionStatus,
    skipDurableUpdate: true,
    terminalState: sessionStatusToTerminalState(sessionStatus),
    error: null,
  });

  return {
    processedAt: new Date().toISOString(),
    successCount,
    failCount,
    scrapedPersistedRowCount,
    sessionStatus,
    statusMessage,
    persistence,
  };
}
