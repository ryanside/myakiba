import { scrapeItems, scrapedItemsWithRateLimit } from "./scrape";
import { publishJobStatus } from "./utils";
import type { ProcessSyncJobParams, ProcessSyncJobResult, SyncJobStatusState } from "./types";
import { SYNC_STATUS_MESSAGES } from "@myakiba/contracts/sync/messages";

export async function processSyncJob(params: ProcessSyncJobParams): Promise<ProcessSyncJobResult> {
  const { itemIds, initialSuccessCount, context, finalize } = params;
  const { redis, jobId, syncSessionId, log } = context;

  const rowCountByExternalId = new Map<number, number>();
  for (const id of itemIds) {
    rowCountByExternalId.set(id, (rowCountByExternalId.get(id) ?? 0) + 1);
  }
  const uniqueItemIds = [...rowCountByExternalId.keys()];
  const totalItems = initialSuccessCount + itemIds.length;
  const scrapeStrategy = uniqueItemIds.length <= 5 ? "standard" : "rate_limited";
  const scrapeMethod = scrapeStrategy === "standard" ? scrapeItems : scrapedItemsWithRateLimit;

  log.set({
    scrape: {
      strategy: scrapeStrategy,
    },
  });

  const state: SyncJobStatusState = {
    jobId,
    startedAt: new Date().toISOString(),
    phase: "scraping",
    statusMessage: SYNC_STATUS_MESSAGES.starting(itemIds.length),
    progress: {
      processed: initialSuccessCount,
      total: totalItems,
      succeeded: initialSuccessCount,
      failed: 0,
    },
    recentItems: [],
    rowCountByExternalId,
  };

  await publishJobStatus({
    redis,
    state,
    syncSessionId,
    sessionStatus: "processing",
    terminalState: null,
    error: null,
  });

  const { successful: successfulResults, failures } = await scrapeMethod({
    itemIds: uniqueItemIds,
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

  const finalizeResult = await finalize(
    successfulResults,
    failures.map(({ id, reason }) => ({
      id,
      errorReason: `Scraping failed: ${reason}`,
    })),
    state,
  );

  return {
    ...finalizeResult,
    scrapeStrategy,
    scrapedItemIds,
    failedItemIds,
    scrapedCount: successfulResults.length,
    failedCount: failedItemIds.length,
  };
}
