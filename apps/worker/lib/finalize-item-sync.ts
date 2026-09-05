import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@myakiba/db/client";
import { item as itemTable, syncSession, syncSessionItem } from "@myakiba/db/schema/figure";
import { sessionStatusToPhase, sessionStatusToTerminalState } from "@myakiba/contracts/sync/schema";
import type { SyncJobError } from "@myakiba/contracts/sync/schema";
import { SYNC_STATUS_MESSAGES } from "@myakiba/contracts/sync/messages";
import { assembleScrapedData } from "./assemble-scraped-data";
import { persistScrapedItemData } from "./persist-scraped-item-data";
import { publishJobStatus, resolveTerminalState } from "./utils";
import type {
  FinalizePersistenceSummary,
  FinalizeSyncResult,
  ScrapedItem,
  SyncJobStatusState,
  WorkerJobLogger,
} from "./types";
import type Redis from "ioredis";

export async function finalizeItemSync({
  successfulResults,
  itemExternalIds,
  existingCount,
  syncSessionId,
  redis,
  state,
  log,
  workerError,
}: {
  readonly successfulResults: readonly ScrapedItem[];
  readonly itemExternalIds: readonly number[];
  readonly existingCount: number;
  readonly syncSessionId: string;
  readonly redis: Redis;
  readonly state: SyncJobStatusState;
  readonly log: WorkerJobLogger;
  readonly workerError?: Error;
}): Promise<FinalizeSyncResult> {
  const persistenceFailedIds = new Set<number>();
  let persistence: FinalizePersistenceSummary = {
    items: 0,
    itemReleases: 0,
    entries: 0,
    entryToItems: 0,
    collectionItems: 0,
    orders: 0,
  };
  for (const scrapedItem of successfulResults) {
    const assembled = assembleScrapedData([scrapedItem]);
    try {
      const { insertedItemExternalIds } = await db.transaction((tx) =>
        persistScrapedItemData(tx, assembled),
      );
      if (insertedItemExternalIds.has(scrapedItem.id)) {
        persistence = {
          items: persistence.items + 1,
          itemReleases: persistence.itemReleases + assembled.itemReleases.length,
          entries: persistence.entries + assembled.entries.length,
          entryToItems: persistence.entryToItems + assembled.entryToItems.length,
          collectionItems: 0,
          orders: 0,
        };
      }
    } catch (error) {
      persistenceFailedIds.add(scrapedItem.id);
      log.error(error instanceof Error ? error : new Error("Failed to save Item"));
    }
  }

  // Another request may have added an Item even when this request's scrape or
  // persistence failed. Resolve those Items from the database before finishing.
  const result = await db.transaction(async (tx) => {
    const availableItems = await tx
      .select({ externalId: itemTable.externalId })
      .from(itemTable)
      .where(and(eq(itemTable.source, "mfc"), inArray(itemTable.externalId, [...itemExternalIds])));
    const availableIds = availableItems.flatMap((item) =>
      item.externalId === null ? [] : [item.externalId],
    );
    const available = new Set(availableIds);
    for (const availableId of availableIds) persistenceFailedIds.delete(availableId);
    const failedIds = itemExternalIds.filter((id) => !available.has(id));
    if (availableIds.length > 0) {
      await tx
        .update(syncSessionItem)
        .set({ status: "scraped", errorReason: null, updatedAt: new Date() })
        .where(
          and(
            eq(syncSessionItem.syncSessionId, syncSessionId),
            inArray(syncSessionItem.itemExternalId, availableIds),
          ),
        );
    }
    for (const failedId of failedIds) {
      const persistenceErrorReason = persistenceFailedIds.has(failedId)
        ? "Persistence failed while saving scraped items"
        : undefined;
      await tx
        .update(syncSessionItem)
        .set({
          status: "failed",
          errorReason: workerError
            ? sql`COALESCE(${syncSessionItem.errorReason}, ${workerError.message})`
            : persistenceErrorReason,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(syncSessionItem.syncSessionId, syncSessionId),
            eq(syncSessionItem.itemExternalId, failedId),
          ),
        );
    }
    const successCount = existingCount + availableIds.length;
    const failCount = failedIds.length;
    const terminal = resolveTerminalState({
      successCount,
      failCount,
      totalRowCount: existingCount + itemExternalIds.length,
    });
    let statusMessage = terminal.statusMessage;
    if (terminal.sessionStatus === "failed" && persistenceFailedIds.size === 0) {
      statusMessage = SYNC_STATUS_MESSAGES.failedScrape;
    }
    if (successCount > 0) {
      statusMessage = `${successCount}/${existingCount + itemExternalIds.length} items in the item database`;
      if (failCount > 0) statusMessage += `. ${failCount} failed.`;
    }
    if (workerError && failCount > 0) {
      statusMessage =
        successCount > 0 ? `${statusMessage} ${workerError.message}` : workerError.message;
    }
    await tx
      .update(syncSession)
      .set({
        statusMessage,
        status: terminal.sessionStatus,
        successCount,
        failCount,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(syncSession.id, syncSessionId));
    return {
      ...terminal,
      statusMessage,
      successCount,
      failCount,
      scrapedPersistedRowCount: availableIds.length,
    };
  });

  state.phase = sessionStatusToPhase(result.sessionStatus);
  state.statusMessage = result.statusMessage;
  state.progress = {
    processed: result.successCount + result.failCount,
    total: existingCount + itemExternalIds.length,
    succeeded: result.successCount,
    failed: result.failCount,
  };
  let error: SyncJobError | null = null;
  if (result.failCount > 0) {
    if (workerError) {
      error = { code: "unknown", message: result.statusMessage };
    } else if (persistenceFailedIds.size > 0) {
      error = { code: "persistence_failed", message: SYNC_STATUS_MESSAGES.failedPersist };
    }
  }
  await publishJobStatus({
    redis,
    state,
    syncSessionId,
    sessionStatus: result.sessionStatus,
    skipDurableUpdate: true,
    terminalState: sessionStatusToTerminalState(result.sessionStatus),
    error,
  });
  return {
    ...result,
    processedAt: new Date().toISOString(),
    persistence,
  };
}
