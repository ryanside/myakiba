import { scrapeItems, scrapedItemsWithRateLimit } from "./scrape";
import { setJobStatus, updateSyncSessionCounts, batchUpdateSyncSessionItemStatuses } from "./utils";
import type { ProcessSyncJobParams, ProcessSyncJobResult } from "./types";

const SCRAPE_FAILED_MESSAGE =
  "Sync failed: Failed to scrape items. Please try again. MFC might be down, or the MFC item IDs may be invalid.";

export async function processSyncJob({
  itemIds,
  scrapeRowCount,
  existingCount,
  context,
  finalize,
}: ProcessSyncJobParams): Promise<ProcessSyncJobResult> {
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

  await setJobStatus({
    redis,
    jobId,
    statusMessage: `Starting to sync ${itemIds.length} items`,
    finished: false,
    syncSessionId,
    sessionStatus: "processing",
  });

  const { successful: successfulResults, failures } = await scrapeMethod({
    itemIds: [...itemIds],
    maxRetries: 3,
    baseDelayMs: 1000,
    jobId,
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
    const sessionStatus = successCount > 0 ? ("partial" as const) : ("failed" as const);
    const statusMessage =
      sessionStatus === "partial"
        ? `Sync partially completed: Failed to scrape ${scrapeRowCount} pending items.`
        : SCRAPE_FAILED_MESSAGE;

    await setJobStatus({
      redis,
      jobId,
      statusMessage,
      finished: true,
      syncSessionId,
      sessionStatus,
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

  const finalizeResult = await finalize(successfulResults);

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
