import { Worker } from "bullmq";
import { setJobStatus } from "./lib/utils";
import type { FullJobData } from "./lib/types";
import { jobDataSchema } from "@myakiba/schemas";
import { finalizeCollectionSync } from "./lib/collection/utils";
import { finalizeOrderSync } from "./lib/order/utils";
import { finalizeCsvSync } from "./lib/csv/utils";
import { processSyncJob } from "./lib/process-sync-job";
import { env } from "@myakiba/env/worker";
import { redis } from "@myakiba/redis";

const myWorker = new Worker(
  "sync-queue",
  async (job: FullJobData) => {
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
    const context = {
      redis,
      jobId: job.id!,
      syncSessionId,
      userId,
    };

    if (type === "csv") {
      const data = validatedData.data;
      console.log("🎯 Worker: Processing CSV sync job", job.name);
      console.log("🎯 Worker: Job ID", job.id);
      console.log("🎯 Worker: Items", data.items);
      console.log("🎯 Worker: UserId", userId);

      const itemIds = Array.from(new Set(data.items.map((item) => item.itemExternalId)));
      return processSyncJob({
        itemIds,
        scrapeRowCount: data.items.length,
        existingCount: data.existingCount,
        context,
        finalize: async (successfulResults) => {
          await finalizeCsvSync({
            successfulResults: [...successfulResults],
            job,
            userId,
            redis,
            csvItems: data.items,
            existingCount: data.existingCount,
            syncSessionId,
          });
        },
      });
    }

    if (type === "order") {
      const { order } = validatedData.data;
      console.log("🎯 Worker: Processing Order sync job", job.name);
      console.log("🎯 Worker: Job ID", job.id);
      console.log("🎯 Worker: Details", order.details);
      console.log("🎯 Worker: Items to scrape", order.itemsToScrape);
      console.log("🎯 Worker: UserId", userId);

      const itemIds = Array.from(new Set(order.itemsToScrape.map((item) => item.itemExternalId)));
      return processSyncJob({
        itemIds,
        scrapeRowCount: order.itemsToScrape.length,
        existingCount: order.existingCount,
        context,
        finalize: async (successfulResults) => {
          await finalizeOrderSync({
            successfulResults: [...successfulResults],
            job,
            redis,
            details: order.details,
            itemsToScrape: order.itemsToScrape,
            existingCount: order.existingCount,
            syncSessionId,
          });
        },
      });
    }

    const { collection } = validatedData.data;
    console.log("🎯 Worker: Processing Collection sync job", job.name);
    console.log("🎯 Worker: Job ID", job.id);
    console.log("🎯 Worker: Items to scrape", collection.itemsToScrape);
    console.log("🎯 Worker: UserId", userId);

    const itemIds = Array.from(
      new Set(collection.itemsToScrape.map((item) => item.itemExternalId)),
    );
    return processSyncJob({
      itemIds,
      scrapeRowCount: collection.itemsToScrape.length,
      existingCount: collection.existingCount,
      context,
      finalize: async (successfulResults) => {
        await finalizeCollectionSync({
          successfulResults: [...successfulResults],
          job,
          redis,
          itemsToScrape: collection.itemsToScrape,
          existingCount: collection.existingCount,
          syncSessionId,
        });
      },
    });
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

  const parsedJobData = jobDataSchema.safeParse(job.data);
  if (!parsedJobData.success) return;

  const syncSessionId = parsedJobData.data.syncSessionId;

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
