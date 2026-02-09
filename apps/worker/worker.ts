import { Worker } from "bullmq";
import { scrapedItems, scrapedItemsWithRateLimit } from "./lib/scrape";
import {
  setJobStatus,
  updateSyncSessionCounts,
  batchUpdateSyncSessionItemStatuses,
} from "./lib/utils";
import type { jobData } from "./lib/types";
import { jobDataSchema } from "@myakiba/schemas";
import { finalizeCollectionSync } from "./lib/collection/utils";
import { finalizeOrderSync } from "./lib/order/utils";
import { finalizeCsvSync } from "./lib/csv/utils";
import { env } from "@myakiba/env/worker";
import { redis } from "@myakiba/redis";

const SCRAPE_FAILED_MESSAGE =
  "Sync failed: Failed to scrape items. Please try again. MFC might be down, or the MFC item IDs may be invalid.";

const myWorker = new Worker(
  "sync-queue",
  async (job: jobData) => {
    const validatedData = jobDataSchema.safeParse(job.data);
    if (validatedData.error) {
      await setJobStatus({
        redis,
        jobId: job.id!,
        statusMessage: `Sync failed: Invalid data. Please try again.`,
        finished: true,
      });
      throw new Error("Invalid data", { cause: validatedData.error });
    }
    const userId = validatedData.data.userId;
    const syncSessionId = validatedData.data.syncSessionId;
    const type = validatedData.data.type;

    if (type === "csv") {
      console.log("🎯 Worker: Processing CSV sync job", job.name);
      console.log("🎯 Worker: Job ID", job.id);
      console.log("🎯 Worker: Items", validatedData.data.items);
      console.log("🎯 Worker: UserId", userId);

      const scrapeMethod =
        validatedData.data.items.length <= 5 ? scrapedItems : scrapedItemsWithRateLimit;

      const itemIds = Array.from(
        new Set(validatedData.data.items.map((item) => item.itemExternalId)),
      );

      await setJobStatus({
        redis,
        jobId: job.id!,
        statusMessage: `Starting to sync ${itemIds.length} items`,
        finished: false,
        syncSessionId,
        sessionStatus: "processing",
      });

      const successfulResults = await scrapeMethod({
        itemIds,
        maxRetries: 3,
        baseDelayMs: 1000,
        userId,
        jobId: job.id!,
      });

      const scrapedItemIds = successfulResults.map((r) => r.id);
      const failedItemIds = itemIds.filter((id) => !scrapedItemIds.includes(id));
      await batchUpdateSyncSessionItemStatuses({
        syncSessionId,
        scrapedItemIds,
        failedItemIds,
      });

      if (successfulResults.length === 0) {
        await setJobStatus({
          redis,
          jobId: job.id!,
          statusMessage: SCRAPE_FAILED_MESSAGE,
          finished: true,
          syncSessionId,
          sessionStatus: "failed",
        });
        await updateSyncSessionCounts({
          syncSessionId,
          successCount: 0,
          failCount: itemIds.length,
        });
        throw new Error("Failed to scrape items.");
      }

      await finalizeCsvSync({
        successfulResults,
        job,
        userId,
        redis,
        csvItems: validatedData.data.items,
        syncSessionId,
      });

      return successfulResults;
    } else if (type === "order") {
      console.log("🎯 Worker: Processing Order sync job", job.name);
      console.log("🎯 Worker: Job ID", job.id);
      console.log("🎯 Worker: Details", validatedData.data.order.details);
      console.log("🎯 Worker: Items to scrape", validatedData.data.order.itemsToScrape);
      console.log("🎯 Worker: UserId", userId);

      const scrapeMethod =
        validatedData.data.order.itemsToScrape.length <= 5
          ? scrapedItems
          : scrapedItemsWithRateLimit;

      const itemIds = Array.from(
        new Set(validatedData.data.order.itemsToScrape.map((item) => item.itemExternalId)),
      );

      await setJobStatus({
        redis,
        jobId: job.id!,
        statusMessage: `Starting to scrape ${itemIds.length} items`,
        finished: false,
        syncSessionId,
        sessionStatus: "processing",
      });

      const successfulResults = await scrapeMethod({
        itemIds,
        maxRetries: 3,
        baseDelayMs: 1000,
        userId,
        jobId: job.id!,
      });

      const scrapedItemIds = successfulResults.map((r) => r.id);
      const failedItemIds = itemIds.filter((id) => !scrapedItemIds.includes(id));
      await batchUpdateSyncSessionItemStatuses({
        syncSessionId,
        scrapedItemIds,
        failedItemIds,
      });

      if (successfulResults.length === 0) {
        await setJobStatus({
          redis,
          jobId: job.id!,
          statusMessage: SCRAPE_FAILED_MESSAGE,
          finished: true,
          syncSessionId,
          sessionStatus: "failed",
        });
        await updateSyncSessionCounts({
          syncSessionId,
          successCount: 0,
          failCount: itemIds.length,
        });
        throw new Error("Failed to scrape items.");
      }

      await finalizeOrderSync({
        successfulResults,
        job,
        redis,
        details: validatedData.data.order.details,
        itemsToScrape: validatedData.data.order.itemsToScrape,
        itemsToInsert: validatedData.data.order.itemsToInsert,
        syncSessionId,
      });

      return successfulResults;
    } else {
      console.log("🎯 Worker: Processing Collection sync job", job.name);
      console.log("🎯 Worker: Job ID", job.id);
      console.log("🎯 Worker: Items to scrape", validatedData.data.collection.itemsToScrape);
      console.log("🎯 Worker: UserId", userId);

      const scrapeMethod =
        validatedData.data.collection.itemsToScrape.length <= 5
          ? scrapedItems
          : scrapedItemsWithRateLimit;

      const itemIds = Array.from(
        new Set(validatedData.data.collection.itemsToScrape.map((item) => item.itemExternalId)),
      );

      await setJobStatus({
        redis,
        jobId: job.id!,
        statusMessage: `Starting to scrape ${itemIds.length} items`,
        finished: false,
        syncSessionId,
        sessionStatus: "processing",
      });

      const successfulResults = await scrapeMethod({
        itemIds,
        maxRetries: 3,
        baseDelayMs: 1000,
        userId,
        jobId: job.id!,
      });

      const scrapedItemIds = successfulResults.map((r) => r.id);
      const failedItemIds = itemIds.filter((id) => !scrapedItemIds.includes(id));
      await batchUpdateSyncSessionItemStatuses({
        syncSessionId,
        scrapedItemIds,
        failedItemIds,
      });

      if (successfulResults.length === 0) {
        await setJobStatus({
          redis,
          jobId: job.id!,
          statusMessage: SCRAPE_FAILED_MESSAGE,
          finished: true,
          syncSessionId,
          sessionStatus: "failed",
        });
        await updateSyncSessionCounts({
          syncSessionId,
          successCount: 0,
          failCount: itemIds.length,
        });
        throw new Error("Failed to scrape items.");
      }

      await finalizeCollectionSync({
        successfulResults,
        job,
        redis,
        itemsToScrape: validatedData.data.collection.itemsToScrape,
        itemsToInsert: validatedData.data.collection.itemsToInsert,
        syncSessionId,
      });

      return successfulResults;
    }
  },
  {
    connection: {
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
    },
    concurrency: 2,
  },
);

myWorker.on("ready", () => {
  console.log("🚀 Worker is ready and connected to Redis");
});

myWorker.on("error", (error) => {
  console.error("❌ Worker error:", error);
});

myWorker.on("failed", async (job, err) => {
  console.error("💥 Job failed:", job?.name, "Error:", err);

  if (!job?.id) return;

  const syncSessionId = (job.data as Record<string, unknown>)?.syncSessionId;
  if (typeof syncSessionId !== "string") return;

  try {
    await setJobStatus({
      redis,
      jobId: job.id,
      statusMessage: `Sync failed: ${err.message}`,
      finished: true,
      syncSessionId,
      sessionStatus: "failed",
    });
  } catch (cleanupError) {
    console.error("❌ Failed to update sync session on job failure:", cleanupError);
  }
});

myWorker.on("completed", (job, result) => {
  console.log("🎉 Job completed:", job.name, "Result:", result);
});
