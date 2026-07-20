import type {
  FinalizeOrderSyncParams,
  FinalizePersistenceSummary,
  FinalizeSyncResult,
} from "../types";
import type { UpdatedSyncOrderItem } from "@myakiba/contracts/sync/schema";
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
import { order, collection, syncSession } from "@myakiba/db/schema/figure";

export async function finalizeOrderSync({
  successfulResults,
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
  let scrapedPersistedRowCount = 0;

  let latestReleaseDate: string | null = null;
  for (const releaseInfo of latestReleaseIdByExternalId.values()) {
    if (releaseInfo.date && (!latestReleaseDate || releaseInfo.date > latestReleaseDate)) {
      latestReleaseDate = releaseInfo.date;
    }
  }

  const shouldUpdateReleaseDate =
    latestReleaseDate !== undefined &&
    latestReleaseDate !== null &&
    (!details.releaseDate || latestReleaseDate > details.releaseDate);

  if (shouldUpdateReleaseDate) {
    details.releaseDate = latestReleaseDate;
  }

  // `create` mirrors the original order sync behavior and persists the order header. `append`
  // only adds collection rows to an existing order, so we avoid rewriting the full order record
  // unless scraped items reveal a newer release date worth preserving.
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

  const { error } = await tryCatch(
    db.transaction(async (tx) => {
      const { externalIdToInternalId, latestReleaseIdByInternalId } = await persistScrapedCatalog(
        tx,
        assembledData,
      );

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
          id: orderItem.collectionId,
          userId: orderItem.userId,
          itemId: orderItem.itemId,
          orderId: orderItem.orderId,
          status: orderItem.status,
          count: orderItem.count,
          releaseId: orderItem.releaseId && orderItem.releaseId !== "" ? orderItem.releaseId : null,
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
        }));

      scrapedPersistedRowCount = scrapedOrderItems.length;

      if (shouldPersistOrderRecord) {
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
          orderId: details.id,
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
      orderId: details.id,
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
