import { Worker } from "bullmq";
import Redis from "ioredis";
import { scrapedItems, scrapedItemsWithRateLimit } from "./lib/scrape";
import { setJobStatus } from "./lib/utils";
import type { jobData } from "./lib/types";
import { finalizeCsvSync } from "./lib/csv/utils";

const redis = new Redis({
  host:
    process.env.NODE_ENV === "production"
      ? process.env.REDIS_HOST
      : "localhost",
  port:
    process.env.NODE_ENV === "production"
      ? parseInt(process.env.REDIS_PORT!)
      : 6379,
});

const myWorker = new Worker(
  "sync-queue",
  async (job: jobData) => {
    const userId = job.data.userId;
    console.log("🎯 Worker: Processing job", job.name);
    console.log("🎯 Worker: Job ID", job.id);
    console.log("🎯 Worker: Items", job.data.items);
    console.log("🎯 Worker: UserId", job.data.userId);

    const scrapeMethod =
      job.data.items.length <= 5 ? scrapedItems : scrapedItemsWithRateLimit;

    const itemIds = job.data.items.map((item) => item.id);

    await setJobStatus(
      redis,
      job.id!,
      `Starting to sync ${itemIds.length} items`,
      false
    );

    const successfulResults = await scrapeMethod(itemIds, 3, 1000, userId, job.id!);
    
    if (successfulResults.length === 0) {
      await setJobStatus(
        redis,
        job.id!,
        `Sync failed: Failed to scrape items. Please try again. MFC might be down, or the MFC item IDs may be invalid.`,
        true
      );
      throw new Error("Failed to scrape items.");
    }

    if (job.data.type === "csv") {
      await finalizeCsvSync(successfulResults, job, userId, redis);
    }
    
    return successfulResults;
  },
  {
    connection: {
      host: process.env.REDIS_HOST || "localhost",
      port: parseInt(process.env.REDIS_PORT || "6379"),
    },
    concurrency: 2,
  }
);

myWorker.on("ready", () => {
  console.log("🚀 Worker is ready and connected to Redis");
});

myWorker.on("error", (error) => {
  console.error("❌ Worker error:", error);
});

myWorker.on("failed", (job, err) => {
  console.error("💥 Job failed:", job?.name, "Error:", err);
  if (job) {
    setJobStatus(redis, job.id!, `Job failed: ${err}`, true);
  }
});

myWorker.on("completed", (job, result) => {
  console.log("🎉 Job completed:", job.name, "Result:", result);
});
