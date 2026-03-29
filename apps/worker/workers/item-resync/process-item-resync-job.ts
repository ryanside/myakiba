import type { Job } from "bullmq";
import { createLogger } from "evlog";
import { tryCatch } from "@myakiba/utils/result";
import { ITEM_RESYNC_QUEUE_NAME, setResyncCooldown } from "@myakiba/redis/item-resync";
import { redis } from "@myakiba/redis/client";
import { scrapeSingleItem } from "../../lib/scrape";
import { refreshItemData } from "./refresh-item";
import type { WorkerJobContext } from "../../lib/types";
import { createDefaultJobContext } from "../../lib/evlog";

export type ItemResyncJobData = {
  readonly itemId: string;
  readonly externalId: number;
};

export async function processItemResyncJob(job: Job<ItemResyncJobData>): Promise<void> {
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
      maxRetries: 3,
      baseDelayMs: 1000,
      jobId: job.id ?? itemId,
      overallIndex: 0,
      totalItems: 1,
    });

    if (!scrapedItem) {
      jobLog.set({ outcome: "error" });
      jobLog.error(new Error("Scrape returned null for item resync"));
      throw new Error("SCRAPE_RETURNED_NULL");
    }

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
  } finally {
    jobLog.emit();
  }
}
