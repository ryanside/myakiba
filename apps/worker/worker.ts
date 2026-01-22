import { Worker } from "bullmq";
import Redis from "ioredis";
import { scrapedItems, scrapedItemsWithRateLimit } from "./lib/scrape";
import { setJobStatus } from "./lib/utils";
import { jobDataSchema, type jobData } from "./lib/types";
import { finalizeCollectionSync } from "./lib/collection/utils";
import { finalizeOrderSync } from "./lib/order/utils";
import { finalizeCsvSync } from "./lib/csv/utils";
import { env } from "@myakiba/env/worker";

const redis = new Redis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
});

const myWorker = new Worker(
  "sync-queue",
  async (job: jobData) => {
    const validatedData = jobDataSchema.safeParse(job.data);
    if (validatedData.error) {
      await setJobStatus(
        redis,
        job.id!,
        `Sync failed: Invalid data. Please try again.`,
        true
      );
      throw new Error("Invalid data", { cause: validatedData.error });
    }
    const userId = validatedData.data.userId;
    const type = validatedData.data.type;

    if (type === "csv") {
      console.log("🎯 Worker: Processing CSV sync job", job.name);
      console.log("🎯 Worker: Job ID", job.id);
      console.log("🎯 Worker: Items", validatedData.data.items);
      console.log("🎯 Worker: UserId", userId);

      const scrapeMethod =
        validatedData.data.items.length <= 5
          ? scrapedItems
          : scrapedItemsWithRateLimit;

      const itemIds = Array.from(
        new Set(validatedData.data.items.map((item) => item.itemExternalId))
      );

      await setJobStatus(
        redis,
        job.id!,
        `Starting to sync ${itemIds.length} items`,
        false
      );

      const successfulResults = await scrapeMethod(
        itemIds,
        3,
        1000,
        userId,
        job.id!
      );

      if (successfulResults.length === 0) {
        await setJobStatus(
          redis,
          job.id!,
          `Sync failed: Failed to scrape items. Please try again. MFC might be down, or the MFC item IDs may be invalid.`,
          true
        );
        throw new Error("Failed to scrape items.");
      }

      await finalizeCsvSync(
        successfulResults,
        job,
        userId,
        redis,
        validatedData.data.items
      );

      return successfulResults;
    } else if (type === "order") {
      console.log("🎯 Worker: Processing Order sync job", job.name);
      console.log("🎯 Worker: Job ID", job.id);
      console.log("🎯 Worker: Details", validatedData.data.order.details);
      console.log(
        "🎯 Worker: Items to scrape",
        validatedData.data.order.itemsToScrape
      );
      console.log("🎯 Worker: UserId", userId);

      const scrapeMethod =
        validatedData.data.order.itemsToScrape.length <= 5
          ? scrapedItems
          : scrapedItemsWithRateLimit;

      const itemIds = Array.from(
        new Set(
          validatedData.data.order.itemsToScrape.map(
            (item) => item.itemExternalId
          )
        )
      );

      await setJobStatus(
        redis,
        job.id!,
        `Starting to scrape ${itemIds.length} items`,
        false
      );

      const successfulResults = await scrapeMethod(
        itemIds,
        3,
        1000,
        userId,
        job.id!
      );

      if (successfulResults.length === 0) {
        await setJobStatus(
          redis,
          job.id!,
          `Sync failed: Failed to scrape items. Please try again. MFC might be down, or the MFC item IDs may be invalid.`,
          true
        );
        throw new Error("Failed to scrape items.");
      }

      await finalizeOrderSync(
        successfulResults,
        job,
        redis,
        validatedData.data.order.details,
        validatedData.data.order.itemsToScrape,
        validatedData.data.order.itemsToInsert
      );

      return successfulResults;
    } else {
      console.log("🎯 Worker: Processing Collection sync job", job.name);
      console.log("🎯 Worker: Job ID", job.id);
      console.log(
        "🎯 Worker: Items to scrape",
        validatedData.data.collection.itemsToScrape
      );
      console.log("🎯 Worker: UserId", userId);

      const scrapeMethod =
        validatedData.data.collection.itemsToScrape.length <= 5
          ? scrapedItems
          : scrapedItemsWithRateLimit;

      const itemIds = Array.from(
        new Set(
          validatedData.data.collection.itemsToScrape.map(
            (item) => item.itemExternalId
          )
        )
      );

      await setJobStatus(
        redis,
        job.id!,
        `Starting to scrape ${itemIds.length} items`,
        false
      );

      const successfulResults = await scrapeMethod(
        itemIds,
        3,
        1000,
        userId,
        job.id!
      );

      if (successfulResults.length === 0) {
        await setJobStatus(
          redis,
          job.id!,
          `Sync failed: Failed to scrape items. Please try again. MFC might be down, or the MFC item IDs may be invalid.`,
          true
        );
        throw new Error("Failed to scrape items.");
      }

      await finalizeCollectionSync(
        successfulResults,
        job,
        redis,
        validatedData.data.collection.itemsToScrape,
        validatedData.data.collection.itemsToInsert
      );

      return successfulResults;
    }
  },
  {
    connection: {
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
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
});

myWorker.on("completed", (job, result) => {
  console.log("🎉 Job completed:", job.name, "Result:", result);
});
