import type { ShippingMethod } from "@myakiba/contracts/shared/types";
import type {
  FinalizeCsvSyncParams,
  FinalizePersistenceSummary,
  FinalizeSyncResult,
} from "../types";
import { parseMoneyToMinorUnits } from "@myakiba/utils/currency";
import { tryCatch } from "@myakiba/utils/result";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@myakiba/db/client";
import { assembleScrapedData } from "../assemble-scraped-data";
import {
  markPersistFailedSyncSessionItemStatuses,
  publishJobStatus,
  resolveTerminalState,
} from "../utils";
import { sessionStatusToPhase, sessionStatusToTerminalState } from "@myakiba/contracts/sync/schema";
import {
  item,
  item_release,
  entry,
  entry_to_item,
  order,
  collection,
  syncSession,
} from "@myakiba/db/schema/figure";

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
  const { items, entries, entryToItems, itemReleases, latestReleaseIdByExternalId } =
    assembleScrapedData(successfulResults);
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
