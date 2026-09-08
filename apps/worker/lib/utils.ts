import { db } from "@myakiba/db/client";
import { syncSession, syncSessionItem } from "@myakiba/db/schema/figure";
import type { DbSyncSessionRow } from "@myakiba/db/schema/figure";
import { and, eq, inArray, sql } from "drizzle-orm";
import type {
  FinalizeSyncResult,
  PublishJobStatusParams,
  SyncSessionItemFailure,
  SyncJobStatusState,
  WorkerJobLogger,
} from "./types";
import { env } from "@myakiba/env/worker";
import { writeJobStatusSnapshotAndPublish } from "@myakiba/redis/job-status";
import type { SyncJobError, SyncJobStatus } from "@myakiba/contracts/sync/schema";
import { sessionStatusToPhase, sessionStatusToTerminalState } from "@myakiba/contracts/sync/schema";
import { ACTIVE_SYNC_SESSION_STATUSES } from "@myakiba/contracts/sync/constants";
import { SYNC_STATUS_MESSAGES } from "@myakiba/contracts/sync/messages";
import type { SyncSessionStatus } from "@myakiba/contracts/shared/types";
import { createLogger } from "evlog";
import { tryCatch } from "@myakiba/utils/result";
import type Redis from "ioredis";

const RECENT_ITEMS_LIMIT = 5;
type SyncTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type ResolveTerminalStateParams = {
  readonly successCount: number;
  readonly failCount: number;
  readonly totalRowCount: number;
  readonly scrapedCount: number;
  readonly error?: Error | null;
};

type ResolvedTerminalState = {
  readonly sessionStatus: SyncSessionStatus;
  readonly statusMessage: string;
};

export const createFetchOptions = (image = false) => ({
  proxy: env.WORKER_PROXY_URL,
  tls: {
    rejectUnauthorized: false,
  },
  headers: {
    ...(!image && { "Accept-Encoding": "gzip, deflate, br" }),
  },
  signal: AbortSignal.timeout(10_000),
});

/**
 * Create the worker's job status when a sync starts, before sending the first update.
 * Update it with helpers like `recordItemOutcome()` and send it with `publishJobStatus()`.
 *
 * Use this only in the worker. The UI reads the `SyncJobStatus` it receives.
 *
 * @example
 * const state = createJobStatusState({
 *   jobId: "job_123",
 *   totalItems: 10,
 *   phase: "scraping",
 *   statusMessage: SYNC_STATUS_MESSAGES.starting(10),
 * });
 */
export const createJobStatusState = ({
  jobId,
  totalItems,
  phase,
  statusMessage,
}: {
  readonly jobId: string;
  readonly totalItems: number;
  readonly phase: SyncJobStatusState["phase"];
  readonly statusMessage: string;
}): SyncJobStatusState => ({
  jobId,
  startedAt: new Date().toISOString(),
  phase,
  progress: totalItems > 0 ? { processed: 0, total: totalItems, succeeded: 0, failed: 0 } : null,
  recentItems: [],
  statusMessage,
});

/**
 * Choose the final status and shared message from the success and failure counts.
 * Call after scraping and saving finish. Pass `error` when saving failed.
 *
 * For live progress, set `state.phase` and `state.statusMessage` directly.
 *
 * @example
 * resolveTerminalState({ successCount: 10, failCount: 0, totalRowCount: 10, scrapedCount: 10 })
 * // { sessionStatus: "completed", statusMessage: "Added 10/10 items" }
 *
 * @example
 * resolveTerminalState({
 *   successCount: 3,
 *   failCount: 2,
 *   totalRowCount: 5,
 *   scrapedCount: 2,
 *   error: new Error("duplicate key value violates unique constraint"),
 * })
 * // {
 * //   sessionStatus: "partial",
 * //   statusMessage: "Failed to save items"
 * // }
 */
export const resolveTerminalState = ({
  successCount,
  failCount,
  totalRowCount,
  scrapedCount,
  error = null,
}: ResolveTerminalStateParams): ResolvedTerminalState => {
  const getSessionStatus = (): "completed" | "partial" | "failed" => {
    if (failCount === 0) return "completed";
    if (successCount > 0) return "partial";
    return "failed";
  };
  const sessionStatus = getSessionStatus();

  if (error) {
    return {
      sessionStatus,
      statusMessage: SYNC_STATUS_MESSAGES.failedPersist,
    };
  }

  switch (sessionStatus) {
    case "completed":
      return {
        sessionStatus,
        statusMessage: SYNC_STATUS_MESSAGES.completed(successCount, totalRowCount),
      };
    case "partial":
      return {
        sessionStatus,
        statusMessage: SYNC_STATUS_MESSAGES.partial(successCount, totalRowCount, failCount),
      };
    case "failed":
      return {
        sessionStatus,
        statusMessage:
          scrapedCount === 0
            ? SYNC_STATUS_MESSAGES.failedScrape
            : SYNC_STATUS_MESSAGES.failedPersist,
      };
  }
};

type RecordItemParams =
  | {
      readonly outcome: "succeeded";
      readonly externalId: number;
      readonly title: string | null;
    }
  | {
      readonly outcome: "failed";
      readonly externalId: number;
      readonly title?: string | null;
      readonly failureReason: string;
    };

/**
 * Update `state` with the item's result and progress counts.
 * Put it first in the recent items list and keep at most `RECENT_ITEMS_LIMIT` entries.
 */
export const recordItemOutcome = (state: SyncJobStatusState, item: RecordItemParams): void => {
  if (state.progress) {
    state.progress = {
      ...state.progress,
      processed: state.progress.processed + 1,
      succeeded: state.progress.succeeded + (item.outcome === "succeeded" ? 1 : 0),
      failed: state.progress.failed + (item.outcome === "failed" ? 1 : 0),
    };
  }
  state.recentItems = [
    {
      externalId: item.externalId,
      title: item.title ?? null,
      outcome: item.outcome,
      failureReason: item.outcome === "failed" ? item.failureReason : null,
      completedAt: new Date().toISOString(),
    },
    ...state.recentItems,
  ].slice(0, RECENT_ITEMS_LIMIT);
};

/**
 * Pass `sessionStatus` to save the active session's status before sending progress.
 * When finishing a sync, save its result and data together, then omit `sessionStatus` here.
 * Redis errors are logged and do not fail the job.
 */
export const publishJobStatus = async ({
  redis,
  state,
  terminalState,
  syncSessionId,
  sessionStatus,
  error,
}: PublishJobStatusParams): Promise<void> => {
  const payload: SyncJobStatus = {
    jobId: state.jobId,
    phase: state.phase,
    statusMessage: state.statusMessage,
    progress: state.progress,
    recentItems: state.recentItems,
    error,
    startedAt: state.startedAt,
    updatedAt: new Date().toISOString(),
    terminalState,
  };

  if (syncSessionId && sessionStatus) {
    const [updated] = await db
      .update(syncSession)
      .set({
        statusMessage: state.statusMessage,
        status: sessionStatus,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(syncSession.id, syncSessionId),
          inArray(syncSession.status, ACTIVE_SYNC_SESSION_STATUSES),
        ),
      )
      .returning({ id: syncSession.id });
    if (!updated) return;
  }

  try {
    await writeJobStatusSnapshotAndPublish(redis, state.jobId, payload);
  } catch (cacheError) {
    const cacheLog = createLogger({
      action: "worker.jobStatusCache",
      outcome: "warn",
      jobId: state.jobId,
      syncSessionId: syncSessionId ?? null,
      message: "Failed to publish job status; the saved session is still available",
    });
    if (cacheError instanceof Error) cacheLog.error(cacheError);
    cacheLog.emit();
  }
};

const persistSyncSessionItemFailures = async ({
  tx,
  syncSessionId,
  failures,
}: {
  readonly tx: SyncTransaction;
  readonly syncSessionId: string;
  readonly failures: readonly SyncSessionItemFailure[];
}): Promise<void> => {
  if (failures.length === 0) return;

  const failureCases = failures.map(({ id, errorReason }) => sql`WHEN ${id} THEN ${errorReason}`);
  await tx
    .update(syncSessionItem)
    .set({
      status: "failed",
      errorReason: sql`CASE ${syncSessionItem.itemExternalId} ${sql.join(failureCases, sql.raw(" "))} END`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(syncSessionItem.syncSessionId, syncSessionId),
        eq(syncSessionItem.status, "pending"),
        inArray(
          syncSessionItem.itemExternalId,
          failures.map(({ id }) => id),
        ),
      ),
    );
};

/** Mark failures first, then mark the remaining pending items as scraped. */
export const persistSyncSessionItemResults = async ({
  tx,
  syncSessionId,
  failures,
}: {
  readonly tx: SyncTransaction;
  readonly syncSessionId: string;
  readonly failures: readonly SyncSessionItemFailure[];
}): Promise<void> => {
  await persistSyncSessionItemFailures({ tx, syncSessionId, failures });

  await tx
    .update(syncSessionItem)
    .set({
      status: "scraped",
      errorReason: null,
      updatedAt: new Date(),
    })
    .where(
      and(eq(syncSessionItem.syncSessionId, syncSessionId), eq(syncSessionItem.status, "pending")),
    );
};

export const persistSyncFailureOutcome = async ({
  syncSessionId,
  failures,
  pendingErrorReason = "Persistence failed while saving scraped items",
  statusMessage,
}: {
  readonly syncSessionId: string;
  readonly failures: readonly SyncSessionItemFailure[];
  readonly pendingErrorReason?: string;
  readonly statusMessage: string;
}): Promise<DbSyncSessionRow> => {
  return db.transaction(async (tx) => {
    // Lock the session so workers finishing at the same time cannot overwrite a final result.
    const [session] = await tx
      .select()
      .from(syncSession)
      .where(eq(syncSession.id, syncSessionId))
      .for("update");
    if (!session) throw new Error("SYNC_SESSION_NOT_FOUND");
    if (sessionStatusToTerminalState(session.status) !== null) return session;

    await persistSyncSessionItemFailures({ tx, syncSessionId, failures });
    await tx
      .update(syncSessionItem)
      .set({
        status: "failed",
        errorReason: pendingErrorReason,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(syncSessionItem.syncSessionId, syncSessionId),
          eq(syncSessionItem.status, "pending"),
        ),
      );

    const successCount = session.syncType === "item" ? session.successCount : 0;
    const [result] = await tx
      .update(syncSession)
      .set({
        status: successCount > 0 ? "partial" : "failed",
        statusMessage,
        successCount,
        failCount: session.totalItems - successCount,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(syncSession.id, syncSessionId))
      .returning();
    return result;
  });
};

/** Save collection, order, or CSV results and item history as one database change. */
export async function finalizeSync({
  syncSessionId,
  failures,
  totalRowCount,
  scrapedCount,
  persistence,
  log,
  redis,
  state,
  persist,
}: {
  readonly syncSessionId: string;
  readonly failures: readonly SyncSessionItemFailure[];
  readonly totalRowCount: number;
  readonly scrapedCount: number;
  readonly persistence: FinalizeSyncResult["persistence"];
  readonly log: WorkerJobLogger;
  readonly redis: Redis;
  readonly state: SyncJobStatusState;
  readonly persist: (tx: SyncTransaction) => Promise<{
    successCount: number;
    failCount: number;
    orderId?: string;
  }>;
}): Promise<FinalizeSyncResult> {
  const { data, error } = await tryCatch(
    db.transaction(async (tx) => {
      const [session] = await tx
        .select()
        .from(syncSession)
        .where(eq(syncSession.id, syncSessionId))
        .for("update");
      if (!session) throw new Error("SYNC_SESSION_NOT_FOUND");
      if (sessionStatusToTerminalState(session.status) !== null) return session;

      const counts = await persist(tx);
      await persistSyncSessionItemResults({ tx, syncSessionId, failures });
      const terminal = resolveTerminalState({ ...counts, totalRowCount, scrapedCount });
      const [result] = await tx
        .update(syncSession)
        .set({
          ...counts,
          status: terminal.sessionStatus,
          statusMessage: terminal.statusMessage,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(syncSession.id, syncSessionId))
        .returning();
      return result;
    }),
  );

  const result = error
    ? await persistSyncFailureOutcome({
        syncSessionId,
        failures,
        statusMessage: SYNC_STATUS_MESSAGES.failedPersist,
      })
    : data;

  let jobError: SyncJobError | null = null;
  if (error) {
    log.error(error);
    if (result.status === "failed") {
      jobError = { code: "persistence_failed", message: SYNC_STATUS_MESSAGES.failedPersist };
    }
  } else if (result.status === "failed" && scrapedCount === 0) {
    jobError = { code: "scrape_failed", message: result.statusMessage };
  }

  state.phase = sessionStatusToPhase(result.status);
  state.statusMessage = result.statusMessage;
  state.progress = {
    processed: result.successCount + result.failCount,
    total: result.totalItems,
    succeeded: result.successCount,
    failed: result.failCount,
  };
  await publishJobStatus({
    redis,
    state,
    syncSessionId,
    terminalState: sessionStatusToTerminalState(result.status),
    error: jobError,
  });
  return {
    processedAt: result.updatedAt.toISOString(),
    successCount: result.successCount,
    failCount: result.failCount,
    sessionStatus: result.status,
    statusMessage: result.statusMessage,
    persistence,
  };
}
