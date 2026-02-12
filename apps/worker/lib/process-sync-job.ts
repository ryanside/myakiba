import { scrapeItems, scrapedItemsWithRateLimit } from "./scrape";
import { setJobStatus, updateSyncSessionCounts, batchUpdateSyncSessionItemStatuses } from "./utils";
import type { ScrapedItem } from "./types";
import type Redis from "ioredis";

const SCRAPE_FAILED_MESSAGE =
  "Sync failed: Failed to scrape items. Please try again. MFC might be down, or the MFC item IDs may be invalid.";

export type ProcessSyncJobContext = {
  readonly redis: Redis;
  readonly jobId: string;
  readonly syncSessionId: string;
  readonly userId: string;
};

export type ProcessSyncJobParams = {
  readonly itemIds: readonly number[];
  readonly scrapeRowCount: number;
  readonly existingCount: number;
  readonly context: ProcessSyncJobContext;
  readonly finalize: (successfulResults: readonly ScrapedItem[]) => Promise<void>;
};

export async function processSyncJob({
  itemIds,
  scrapeRowCount,
  existingCount,
  context,
  finalize,
}: ProcessSyncJobParams): Promise<readonly ScrapedItem[]> {
  const { redis, jobId, syncSessionId } = context;

  const scrapeMethod = itemIds.length <= 5 ? scrapeItems : scrapedItemsWithRateLimit;

  await setJobStatus({
    redis,
    jobId,
    statusMessage: `Starting to sync ${itemIds.length} items`,
    finished: false,
    syncSessionId,
    sessionStatus: "processing",
  });

  const successfulResults = await scrapeMethod({
    itemIds: [...itemIds],
    maxRetries: 3,
    baseDelayMs: 1000,
    jobId,
  });

  const scrapedItemIds = successfulResults.map((r) => r.id);
  const scrapedItemIdSet = new Set(scrapedItemIds);
  const failedItemIds = itemIds.filter((id) => !scrapedItemIdSet.has(id));
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
    return successfulResults;
  }

  await finalize(successfulResults);
  return successfulResults;
}
