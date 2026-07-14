import type { ShippingMethod } from "@myakiba/contracts/shared/types";
import type {
  FinalizeCsvSyncParams,
  FinalizePersistenceSummary,
  FinalizeSyncResult,
} from "../types";
import { parseMoneyToMinorUnits } from "@myakiba/utils/currency";
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

export async function finalizeCsvSync({
  successfulResults,
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
  let scrapedPersistedRowCount = 0;
  let collectionItems: {
    id: string;
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
  }[] = [];
  let orders: {
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
    status: "Ordered";
    shippingFee: number;
    taxes: number;
    duties: number;
    tariffs: number;
    miscFees: number;
    notes: string;
  }[] = [];

  collectionItems = successfulCollectionItems.map((ci) => ({
    id: ci.collectionId,
    userId,
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

  orders = successfulCollectionItems.flatMap((ci) => {
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

  const { error } = await tryCatch(
    db.transaction(async (tx) => {
      const { externalIdToInternalId, latestReleaseIdByInternalId } = await persistScrapedCatalog(
        tx,
        assembledData,
      );

      const collectionItemsToInsert: (typeof collection.$inferInsert)[] = collectionItems.flatMap(
        (collectionItem) => {
          const internalItemId = externalIdToInternalId.get(collectionItem.itemExternalId);
          if (!internalItemId) {
            return [];
          }
          return [
            {
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
            },
          ];
        },
      );

      scrapedPersistedRowCount = collectionItemsToInsert.length;

      const dedupedOrders = [
        ...new Map(
          [...ordersToInsert, ...orders].map((orderRow) => [orderRow.id, orderRow] as const),
        ).values(),
      ];
      if (dedupedOrders.length > 0) {
        await tx.insert(order).values(dedupedOrders).onConflictDoNothing({ target: order.id });
      }
      const collectionRows = [...itemsToInsert, ...collectionItemsToInsert];
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
