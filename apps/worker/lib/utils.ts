import { db } from "@myakiba/db/client";
import { syncSession, syncSessionItem } from "@myakiba/db/schema/figure";
import { and, eq, inArray, sql } from "drizzle-orm";
import type {
  BatchUpdateSyncSessionItemStatusesParams,
  MarkPersistFailedSyncSessionItemStatusesParams,
  PublishJobStatusParams,
  SyncJobStatusState,
} from "./types";
import { env } from "@myakiba/env/worker";
import { writeJobStatusSnapshotAndPublish } from "@myakiba/redis/job-status";
import type { SyncJobStatus } from "@myakiba/contracts/sync/schema";
import { SYNC_STATUS_MESSAGES } from "@myakiba/contracts/sync/messages";
import type { SyncSessionStatus } from "@myakiba/contracts/shared/types";
import { createLogger } from "evlog";

const RECENT_ITEMS_LIMIT = 5;
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

const formatFailureMessage = (error?: Error | null): string => {
  if (!error?.message) {
    return SYNC_STATUS_MESSAGES.failedPersist;
  }
  return `${SYNC_STATUS_MESSAGES.failedPersist} - ${error.message}`;
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
 * Creates the mutable in-memory job-status state that the worker updates while
 * a sync is running.
 *
 * Use this at the start of a worker job before publishing the first snapshot.
 * Callers then mutate the returned object through helpers like
 * `recordItemOutcome()` and publish it via `publishJobStatus()`.
 *
 * This is worker-only state. UI code should consume the serialized
 * `SyncJobStatus` payload instead of creating its own local version.
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
 * Resolves the terminal session status and canonical terminal message from the
 * worker's final counts.
 *
 * Use this in finalize paths after scraping/persistence completes, instead of
 * rebuilding the same completed/partial/failed wording in each sync type.
 *
 * Pass `error` only for persistence failures where the run reached a terminal
 * state but we want the stored message to include the underlying cause.
 *
 * Do not use this for live progress updates. During in-flight work, the worker
 * should set `state.phase` and `state.statusMessage` directly.
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
 * //   statusMessage:
 * //     "Failed to save items - duplicate key value violates unique constraint"
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
      statusMessage: formatFailureMessage(error),
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
 * Mutates `state` with a single item's completion: bumps the matching progress
 * counter and prepends a ticker entry capped at `RECENT_ITEMS_LIMIT`.
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
 * Persists supplied session state first, then publishes the Redis snapshot as
 * a best-effort cache update. Finalizers that commit session state with domain
 * rows skip the durable update. Redis failures never fail durable worker work.
 */
export const publishJobStatus = async ({
  redis,
  state,
  terminalState,
  syncSessionId,
  sessionStatus,
  successCount,
  failCount,
  orderId,
  skipDurableUpdate = false,
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

  if (syncSessionId && sessionStatus && !skipDurableUpdate) {
    await db
      .update(syncSession)
      .set({
        statusMessage: state.statusMessage,
        status: sessionStatus,
        updatedAt: new Date(),
        successCount,
        failCount,
        orderId,
        completedAt: terminalState === null ? undefined : new Date(),
      })
      .where(eq(syncSession.id, syncSessionId));
  }

  try {
    await writeJobStatusSnapshotAndPublish(redis, state.jobId, payload);
  } catch (cacheError) {
    const cacheLog = createLogger({
      action: "worker.jobStatusCache",
      outcome: "warn",
      jobId: state.jobId,
      syncSessionId: syncSessionId ?? null,
      message: "Failed to publish job status cache; durable session remains authoritative",
    });
    if (cacheError instanceof Error) cacheLog.error(cacheError);
    cacheLog.emit();
  }
};

/**
 * Batch-updates sync_session_item statuses in Postgres.
 * Called once after all scraping completes, marking scraped and failed items
 * in one or two queries instead of per-item writes.
 */
export const batchUpdateSyncSessionItemStatuses = async ({
  syncSessionId,
  scrapedItemIds,
  failures,
}: BatchUpdateSyncSessionItemStatusesParams): Promise<void> => {
  await db.transaction(async (tx) => {
    if (scrapedItemIds.length > 0) {
      await tx
        .update(syncSessionItem)
        .set({
          status: "scraped",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(syncSessionItem.syncSessionId, syncSessionId),
            inArray(syncSessionItem.itemExternalId, [...scrapedItemIds]),
          ),
        );
    }

    if (failures.length > 0) {
      const failureCases = failures.map(
        ({ id, reason }) => sql`WHEN ${id} THEN ${`Scraping failed after max retries: ${reason}`}`,
      );
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
            inArray(
              syncSessionItem.itemExternalId,
              failures.map(({ id }) => id),
            ),
          ),
        );
    }
  });
};

/**
 * Marks previously scraped sync_session_item rows as failed when persistence fails.
 * This keeps durable sync history accurate when scraping succeeded but persistence did not.
 */
export const markPersistFailedSyncSessionItemStatuses = async ({
  syncSessionId,
  scrapedItemIds,
  errorReason,
}: MarkPersistFailedSyncSessionItemStatusesParams): Promise<void> => {
  if (scrapedItemIds.length === 0) {
    return;
  }

  await db
    .update(syncSessionItem)
    .set({
      status: "failed",
      errorReason,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(syncSessionItem.syncSessionId, syncSessionId),
        eq(syncSessionItem.status, "scraped"),
        inArray(syncSessionItem.itemExternalId, [...scrapedItemIds]),
      ),
    );
};
