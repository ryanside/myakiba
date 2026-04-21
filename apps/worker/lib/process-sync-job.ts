import { scrapeItems, scrapedItemsWithRateLimit } from "./scrape";
import {
  batchUpdateSyncSessionItemStatuses,
  createJobStatusState,
  publishJobStatus,
  updateSyncSessionCounts,
} from "./utils";
import { MOCK_SCRAPE, runMockSyncJob } from "./mock-scrape";
import type { ProcessSyncJobParams, ProcessSyncJobResult } from "./types";
import { sessionStatusToPhase, sessionStatusToTerminalState } from "@myakiba/contracts/sync/schema";
import { SYNC_STATUS_MESSAGES } from "@myakiba/contracts/sync/messages";

export async function processSyncJob(params: ProcessSyncJobParams): Promise<ProcessSyncJobResult> {
  if (MOCK_SCRAPE) {
    return runMockSyncJob(params);
  }

  const { itemIds, scrapeRowCount, existingCount, context, finalize } = params;
  const { redis, jobId, syncSessionId, log } = context;

  const scrapeStrategy = itemIds.length <= 5 ? "standard" : "rate_limited";
  const scrapeMethod = scrapeStrategy === "standard" ? scrapeItems : scrapedItemsWithRateLimit;

  log.set({
    scrape: {
      strategy: scrapeStrategy,
      maxRetries: 3,
      baseDelayMs: 1000,
    },
  });

  const state = createJobStatusState({
    jobId,
    totalItems: itemIds.length,
    phase: "scraping",
    statusMessage: SYNC_STATUS_MESSAGES.starting(itemIds.length),
  });

  await publishJobStatus({
    redis,
    state,
    syncSessionId,
    sessionStatus: "processing",
    terminalState: null,
    error: null,
  });

  const { successful: successfulResults, failures } = await scrapeMethod({
    itemIds: [...itemIds],
    maxRetries: 3,
    baseDelayMs: 1000,
    redis,
    state,
    log,
  });

  const scrapedItemIds = successfulResults.map((r) => r.id);
  const failedItemIds = failures.map((f) => f.id);

  log.set({
    items: {
      scraped: successfulResults.length,
      failed: failedItemIds.length,
      failedIds: failedItemIds,
    },
    scrapeErrors: failures,
  });

  await batchUpdateSyncSessionItemStatuses({
    syncSessionId,
    scrapedItemIds,
    failedItemIds,
  });

  if (successfulResults.length === 0) {
    const successCount = existingCount;
    const failCount = scrapeRowCount;
    const totalRowCount = existingCount + scrapeRowCount;
    const sessionStatus = successCount > 0 ? ("partial" as const) : ("failed" as const);
    const statusMessage =
      sessionStatus === "partial"
        ? SYNC_STATUS_MESSAGES.partial(successCount, totalRowCount, failCount)
        : SYNC_STATUS_MESSAGES.failedScrape;

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
    await updateSyncSessionCounts({
      syncSessionId,
      successCount,
      failCount,
    });

    const processedAt = new Date().toISOString();

    return {
      processedAt,
      scrapeStrategy,
      scrapedItemIds,
      failedItemIds,
      scrapedCount: successfulResults.length,
      failedCount: failedItemIds.length,
      successCount,
      failCount,
      sessionStatus,
      statusMessage,
      persistence: null,
    };
  }

  state.phase = "persisting";
  state.statusMessage = SYNC_STATUS_MESSAGES.persisting(successfulResults.length);
  await publishJobStatus({
    redis,
    state,
    syncSessionId,
    sessionStatus: "processing",
    terminalState: null,
    error: null,
  });

  const finalizeResult = await finalize(successfulResults, state);

  return {
    processedAt: finalizeResult.processedAt,
    scrapeStrategy,
    scrapedItemIds,
    failedItemIds,
    scrapedCount: successfulResults.length,
    failedCount: failedItemIds.length,
    successCount: finalizeResult.successCount,
    failCount: finalizeResult.failCount,
    sessionStatus: finalizeResult.sessionStatus,
    statusMessage: finalizeResult.statusMessage,
    persistence: finalizeResult.persistence,
  };
}
