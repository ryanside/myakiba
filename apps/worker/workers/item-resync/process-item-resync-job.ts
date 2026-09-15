import type { Job } from "bullmq";
import { createLogger } from "evlog";
import { tryCatch } from "@myakiba/utils/result";
import {
  ITEM_RESYNC_QUEUE_NAME,
  MFC_METADATA_BACKFILL_404_SKIP_SET_KEY,
  setResyncCooldown,
} from "@myakiba/redis/item-resync";
import { redis } from "@myakiba/redis/client";
import { ScrapeError, scrapeSingleItem } from "../../lib/scrape";
import { refreshItemData } from "./refresh-item";
import type { WorkerJobContext } from "../../lib/types";
import { createDefaultJobContext } from "../../lib/evlog";

export type ItemResyncJobData = {
  readonly itemId: string;
  readonly externalId: number;
};

export async function processItemResyncJob(
  job: Pick<Job<ItemResyncJobData>, "data" | "id" | "name" | "attemptsMade">,
): Promise<void> {
  const { itemId, externalId } = job.data;

  const jobLog = createLogger<WorkerJobContext>({
    ...createDefaultJobContext(),
    action: "item-resync.job",
    queue: { name: ITEM_RESYNC_QUEUE_NAME, jobName: job.name },
    job: {
      id: job.id ?? null,
      attemptsMade: job.attemptsMade,
      attemptNumber: job.attemptsMade + 1,
    },
  });

  try {
    const scrapedItem = await scrapeSingleItem({
      id: externalId,
      log: jobLog,
    });

    const { error: refreshError } = await tryCatch(refreshItemData(scrapedItem, itemId));

    if (refreshError) {
      jobLog.set({ outcome: "error" });
      if (refreshError instanceof Error) {
        jobLog.error(refreshError);
      }
      throw refreshError;
    }

    await setResyncCooldown(redis, itemId);

    jobLog.set({ outcome: "success" });
  } catch (error) {
    jobLog.set({ outcome: "error" });
    if (
      error instanceof ScrapeError &&
      error.details.kind === "item_failure" &&
      error.details.itemPageStatus === 404
    ) {
      const results = await redis
        .multi()
        .sadd(MFC_METADATA_BACKFILL_404_SKIP_SET_KEY, externalId)
        .expire(MFC_METADATA_BACKFILL_404_SKIP_SET_KEY, 90 * 24 * 60 * 60)
        .exec();

      if (results === null) {
        throw new Error("Failed to record MFC metadata backfill 404 skip", { cause: error });
      }
      for (const [commandError] of results) {
        if (commandError) throw commandError;
      }
    }
    throw error;
  } finally {
    jobLog.emit();
  }
}
