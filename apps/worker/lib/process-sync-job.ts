import { scrapeItems, scrapedItemsWithRateLimit } from "./scrape";
import {
  batchUpdateSyncSessionItemStatuses,
  createJobStatusState,
  publishJobStatus,
} from "./utils";
import type { ProcessSyncJobParams, ProcessSyncJobResult } from "./types";
import { SYNC_STATUS_MESSAGES } from "@myakiba/contracts/sync/messages";

export async function processSyncJob(params: ProcessSyncJobParams): Promise<ProcessSyncJobResult> {
  const { itemIds, existingCount, context, finalize } = params;
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

  if (params.type === "item") {
    state.progress = {
      processed: existingCount,
      total: existingCount + itemIds.length,
      succeeded: existingCount,
      failed: 0,
    };
  }

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
    failures,
  });

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
