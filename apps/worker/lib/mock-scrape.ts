import {
  batchUpdateSyncSessionItemStatuses,
  createJobStatusState,
  publishJobStatus,
  recordItemOutcome,
  updateSyncSessionCounts,
} from "./utils";
import type { ProcessSyncJobParams, ProcessSyncJobResult, SyncJobStatusState } from "./types";
import { sessionStatusToPhase, sessionStatusToTerminalState } from "@myakiba/contracts/sync/schema";
import type { SyncSessionStatus } from "@myakiba/contracts/shared/types";
import { env } from "@myakiba/env/worker";
import type Redis from "ioredis";

/**
 * Flip to `true` to bypass real scraping (and DB persistence) in the sync
 * worker. Used as a UI-comparison harness for the active-session views:
 * `sync.tsx`, `sync_.$id.tsx`, and `sync-status-widget.tsx`.
 *
 * Has no effect on `item-resync` or any other worker.
 */
const MOCK_SCRAPE_FLAG = false;
export const MOCK_SCRAPE = MOCK_SCRAPE_FLAG && env.NODE_ENV !== "production";

const MOCK_SCRAPE_DELAY_MS = 10000;
const MOCK_SCRAPE_FAIL_RATE = 0;
const MOCK_SCRAPE_STRATEGY = "standard" as const;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

type SimulateScrapeParams = {
  readonly itemIds: readonly number[];
  readonly redis: Redis;
  readonly state: SyncJobStatusState;
};

type SimulateScrapeResult = {
  readonly successfulIds: readonly number[];
  readonly failedIds: readonly number[];
};

const simulateScrape = async ({
  itemIds,
  redis,
  state,
}: SimulateScrapeParams): Promise<SimulateScrapeResult> => {
  const successfulIds: number[] = [];
  const failedIds: number[] = [];

  for (const id of itemIds) {
    if (MOCK_SCRAPE_DELAY_MS > 0) {
      await sleep(MOCK_SCRAPE_DELAY_MS);
    }

    const shouldFail = MOCK_SCRAPE_FAIL_RATE > 0 && Math.random() < MOCK_SCRAPE_FAIL_RATE;

    if (shouldFail) {
      failedIds.push(id);
      recordItemOutcome(state, {
        outcome: "failed",
        externalId: id,
        title: `MOCK #${id}`,
        failureReason: "Mocked scrape failure",
      });
    } else {
      successfulIds.push(id);
      recordItemOutcome(state, {
        outcome: "succeeded",
        externalId: id,
        title: `MOCK #${id}`,
      });
    }

    state.statusMessage = state.progress
      ? `Syncing...${state.progress.processed}/${state.progress.total}`
      : state.statusMessage;

    await publishJobStatus({ redis, state, terminalState: null, error: null });
  }

  return { successfulIds, failedIds };
};

type ResolveSessionStatusParams = {
  readonly successCount: number;
  readonly failCount: number;
  readonly mockedSuccesses: number;
};

/**
 * Picks the terminal session status for a mock run. Matches the real worker's
 * convention: any successes (existing or newly "scraped") with failures → partial;
 * all successes → completed; zero successes → failed.
 */
const resolveSessionStatus = ({
  successCount,
  failCount,
  mockedSuccesses,
}: ResolveSessionStatusParams): SyncSessionStatus => {
  if (successCount === 0 && mockedSuccesses === 0) return "failed";
  if (failCount > 0) return "partial";
  return "completed";
};

type FinalizeMockSyncParams = {
  readonly redis: Redis;
  readonly state: SyncJobStatusState;
  readonly syncSessionId: string;
  readonly existingCount: number;
  readonly successfulIds: readonly number[];
  readonly failedIds: readonly number[];
};

type FinalizeMockSyncResult = {
  readonly sessionStatus: SyncSessionStatus;
  readonly statusMessage: string;
  readonly successCount: number;
  readonly failCount: number;
};

const finalizeMockSync = async ({
  redis,
  state,
  syncSessionId,
  existingCount,
  successfulIds,
  failedIds,
}: FinalizeMockSyncParams): Promise<FinalizeMockSyncResult> => {
  const successCount = existingCount + successfulIds.length;
  const failCount = failedIds.length;
  const sessionStatus = resolveSessionStatus({
    successCount,
    failCount,
    mockedSuccesses: successfulIds.length,
  });

  const statusMessage =
    sessionStatus === "completed"
      ? `Mock sync complete: ${successfulIds.length} item${successfulIds.length === 1 ? "" : "s"} processed`
      : sessionStatus === "partial"
        ? `Mock sync partial: ${successfulIds.length} succeeded, ${failCount} failed`
        : `Mock sync failed: ${failCount} item${failCount === 1 ? "" : "s"} failed`;

  state.phase = sessionStatusToPhase(sessionStatus);
  state.statusMessage = statusMessage;

  await publishJobStatus({
    redis,
    state,
    syncSessionId,
    sessionStatus,
    terminalState: sessionStatusToTerminalState(sessionStatus),
    error: sessionStatus === "failed" ? { code: "scrape_failed", message: statusMessage } : null,
  });

  await updateSyncSessionCounts({ syncSessionId, successCount, failCount });

  return { sessionStatus, statusMessage, successCount, failCount };
};

/**
 * Mock entry point used by `processSyncJob` when `MOCK_SCRAPE` is true.
 * Simulates the full live-status lifecycle (scrape ticks + terminal publish)
 * and updates the durable `sync_session` + `sync_session_item` rows, but
 * performs no HTTP/S3 traffic and writes no items, releases, entries,
 * collection items, or orders.
 */
export const runMockSyncJob = async ({
  itemIds,
  existingCount,
  context,
}: ProcessSyncJobParams): Promise<ProcessSyncJobResult> => {
  const { redis, jobId, syncSessionId, log } = context;

  log.set({
    scrape: {
      strategy: MOCK_SCRAPE_STRATEGY,
      maxRetries: 0,
      baseDelayMs: MOCK_SCRAPE_DELAY_MS,
    },
  });

  const state = createJobStatusState({
    jobId,
    totalItems: itemIds.length,
    phase: "scraping",
    statusMessage: `Mock syncing ${itemIds.length} items`,
  });

  await publishJobStatus({
    redis,
    state,
    syncSessionId,
    sessionStatus: "processing",
    terminalState: null,
    error: null,
  });

  const { successfulIds, failedIds } = await simulateScrape({
    itemIds,
    redis,
    state,
  });

  await batchUpdateSyncSessionItemStatuses({
    syncSessionId,
    scrapedItemIds: successfulIds,
    failedItemIds: failedIds,
  });

  const { sessionStatus, statusMessage, successCount, failCount } = await finalizeMockSync({
    redis,
    state,
    syncSessionId,
    existingCount,
    successfulIds,
    failedIds,
  });

  return {
    processedAt: new Date().toISOString(),
    scrapeStrategy: MOCK_SCRAPE_STRATEGY,
    scrapedItemIds: successfulIds,
    failedItemIds: failedIds,
    scrapedCount: successfulIds.length,
    failedCount: failedIds.length,
    successCount,
    failCount,
    sessionStatus,
    statusMessage,
    persistence: null,
  };
};
