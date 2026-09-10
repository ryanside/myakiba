import { and, eq, inArray } from "drizzle-orm";
import { db } from "@myakiba/db/client";
import { item as itemTable, syncSession } from "@myakiba/db/schema/figure";
import { tryCatch } from "@myakiba/utils/result";
import { sessionStatusToPhase, sessionStatusToTerminalState } from "@myakiba/contracts/sync/schema";
import type { SyncJobError } from "@myakiba/contracts/sync/schema";
import { SYNC_STATUS_MESSAGES } from "@myakiba/contracts/sync/messages";
import { assembleScrapedData } from "./assemble-scraped-data";
import { persistScrapedItemData } from "./persist-scraped-item-data";
import { persistSyncSessionItemResults, publishJobStatus, resolveTerminalState } from "./utils";
import type {
  FinalizePersistenceSummary,
  FinalizeSyncResult,
  ScrapedItem,
  SyncSessionItemFailure,
  SyncJobStatusState,
  WorkerJobLogger,
} from "./types";
import type Redis from "ioredis";

export async function finalizeItemSync({
  successfulResults,
  failures,
  itemExternalIds,
  initialSuccessCount,
  syncSessionId,
  redis,
  state,
  log,
  workerError,
}: {
  readonly successfulResults: readonly ScrapedItem[];
  readonly failures: readonly SyncSessionItemFailure[];
  readonly itemExternalIds: readonly number[];
  readonly initialSuccessCount: number;
  readonly syncSessionId: string;
  readonly redis: Redis;
  readonly state: SyncJobStatusState;
  readonly log: WorkerJobLogger;
  readonly workerError?: Error;
}): Promise<FinalizeSyncResult> {
  const assembledData = assembleScrapedData(successfulResults);
  const totalRowCount = initialSuccessCount + itemExternalIds.length;
  const persistence: FinalizePersistenceSummary = {
    items: assembledData.items.length,
    itemReleases: assembledData.itemReleases.length,
    entries: assembledData.entries.length,
    entryToItems: assembledData.entryToItems.length,
    collectionItems: 0,
    orders: 0,
  };
  log.set({ persistence });

  const result = await db.transaction(async (tx) => {
    const [session] = await tx
      .select()
      .from(syncSession)
      .where(eq(syncSession.id, syncSessionId))
      .for("update");
    if (!session) throw new Error("SYNC_SESSION_NOT_FOUND");
    if (session.jobId !== state.jobId || sessionStatusToTerminalState(session.status) !== null) {
      return {
        jobId: session.jobId,
        sessionStatus: session.status,
        statusMessage: session.statusMessage,
        successCount: session.successCount,
        failCount: session.failCount,
        persistenceError: null,
      };
    }

    // Keep one bad scraped item from rolling back the rest of the batch.
    let persistenceError: Error | null = null;
    for (const successfulResult of successfulResults) {
      const { error } = await tryCatch(
        tx.transaction((savepoint) =>
          persistScrapedItemData(savepoint, assembleScrapedData([successfulResult])),
        ),
      );
      if (error && !persistenceError) persistenceError = error;
    }

    const availableItems = await tx
      .select({ externalId: itemTable.externalId })
      .from(itemTable)
      .where(and(eq(itemTable.source, "mfc"), inArray(itemTable.externalId, [...itemExternalIds])));
    const availableIds = new Set(availableItems.map((item) => item.externalId));
    const failureReasons = new Map(failures.map(({ id, errorReason }) => [id, errorReason]));
    const remainingFailures = itemExternalIds
      .filter((id) => !availableIds.has(id))
      .map((id) => ({
        id,
        errorReason: failureReasons.get(id) ?? SYNC_STATUS_MESSAGES.failedPersist,
      }));

    await persistSyncSessionItemResults({
      tx,
      syncSessionId,
      failures: remainingFailures,
    });

    const successCount = initialSuccessCount + availableIds.size;
    const failCount = remainingFailures.length;
    const terminal = resolveTerminalState({
      successCount,
      failCount,
      totalRowCount,
      scrapedCount: successfulResults.length,
      error: failCount > 0 ? persistenceError : null,
    });
    let statusMessage = terminal.statusMessage;
    if (successCount > 0) {
      statusMessage = `${successCount}/${totalRowCount} items in the item database`;
      if (failCount > 0) statusMessage += `. ${failCount} failed.`;
    }
    if (workerError && failCount > 0 && successCount === 0) {
      statusMessage = SYNC_STATUS_MESSAGES.failedDuringProcessing;
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
      jobId: session.jobId,
      statusMessage,
      successCount,
      failCount,
      persistenceError,
    };
  });

  state.phase = sessionStatusToPhase(result.sessionStatus);
  state.statusMessage = result.statusMessage;
  state.progress = {
    processed: result.successCount + result.failCount,
    total: result.successCount + result.failCount,
    succeeded: result.successCount,
    failed: result.failCount,
  };
  let error: SyncJobError | null = null;
  if (result.failCount > 0) {
    if (workerError) {
      error = { code: "unknown", message: result.statusMessage };
    } else if (result.persistenceError) {
      error = { code: "persistence_failed", message: SYNC_STATUS_MESSAGES.failedPersist };
    } else if (result.sessionStatus === "failed") {
      error = { code: "scrape_failed", message: result.statusMessage };
    }
  }
  if (result.jobId === state.jobId) {
    await publishJobStatus({
      redis,
      state,
      syncSessionId,
      terminalState: sessionStatusToTerminalState(result.sessionStatus),
      error,
    });
  }
  if (result.persistenceError) log.error(result.persistenceError);

  return {
    processedAt: new Date().toISOString(),
    successCount: result.successCount,
    failCount: result.failCount,
    sessionStatus: result.sessionStatus,
    statusMessage: result.statusMessage,
    persistence,
  };
}
