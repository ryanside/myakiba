import { db } from "@myakiba/db/client";
import { syncSession, syncSessionItem } from "@myakiba/db/schema/figure";
import { and, eq, inArray } from "drizzle-orm";
import type {
  BatchUpdateSyncSessionItemStatusesParams,
  MarkPersistFailedSyncSessionItemStatusesParams,
  PublishJobStatusParams,
  SyncJobStatusState,
  UpdateSyncSessionCountsParams,
} from "./types";
import { env } from "@myakiba/env/worker";
import { writeJobStatusSnapshotAndPublish } from "@myakiba/redis/job-status";
import type { SyncJobStatus } from "@myakiba/contracts/sync/schema";
import { SYNC_STATUS_MESSAGES } from "@myakiba/contracts/sync/messages";
import type { SyncSessionStatus } from "@myakiba/contracts/shared/types";

const RECENT_ITEMS_LIMIT = 5;

type ResolveTerminalStateParams = {
  readonly successCount: number;
  readonly failCount: number;
  readonly totalRowCount: number;
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
  proxy: env.HTTP_PROXY,
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
 * resolveTerminalState({ successCount: 10, failCount: 0, totalRowCount: 10 })
 * // { sessionStatus: "completed", statusMessage: "Synced 10/10 items" }
 *
 * @example
 * resolveTerminalState({
 *   successCount: 3,
 *   failCount: 2,
 *   totalRowCount: 5,
 *   error: new Error("duplicate key value violates unique constraint"),
 * })
 * // {
 * //   sessionStatus: "partial",
 * //   statusMessage:
 * //     "Sync failed - couldn't save scraped items - duplicate key value violates unique constraint"
 * // }
 */
export const resolveTerminalState = ({
  successCount,
  failCount,
  totalRowCount,
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
        statusMessage: SYNC_STATUS_MESSAGES.failedPersist,
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
 * Stamps `updatedAt`, writes the snapshot to Redis (SET + PUBLISH), and
 * dual-writes durable session state to Postgres when a session id is supplied.
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

  await writeJobStatusSnapshotAndPublish(redis, state.jobId, payload);

  if (syncSessionId && sessionStatus) {
    await db
      .update(syncSession)
      .set({
        statusMessage: state.statusMessage,
        status: sessionStatus,
        updatedAt: new Date(),
        ...(terminalState !== null ? { completedAt: new Date() } : {}),
      })
      .where(eq(syncSession.id, syncSessionId));
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
  failedItemIds,
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

    if (failedItemIds.length > 0) {
      await tx
        .update(syncSessionItem)
        .set({
          status: "failed",
          errorReason: "Scraping failed after max retries",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(syncSessionItem.syncSessionId, syncSessionId),
            inArray(syncSessionItem.itemExternalId, [...failedItemIds]),
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

/**
 * Updates the final success/fail counts on a sync_session.
 * Called after finalization or when all items fail scraping.
 */
export const updateSyncSessionCounts = async ({
  syncSessionId,
  successCount,
  failCount,
}: UpdateSyncSessionCountsParams): Promise<void> => {
  await db
    .update(syncSession)
    .set({
      successCount,
      failCount,
      updatedAt: new Date(),
    })
    .where(eq(syncSession.id, syncSessionId));
};
