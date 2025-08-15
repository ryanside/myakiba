import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { Variables } from "../..";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { csvItemSchema, type csvItem, type status } from "./model";
import {
  getExistingItemIdsInCollection,
  getExistingItemIdsInItem,
  insertToCollection,
} from "./service";
import { generateUUID } from "@/lib/utils";

const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT!),
});
const syncQueue = new Queue("sync-queue", {
  connection: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT!),
  },
});

export const syncRouter = new Hono<{
  Variables: Variables;
}>()
  .get(
    "/",
    zValidator("query", z.object({ jobId: z.string() }), (result, c) => {
      if (!result.success) {
        return c.text("Invalid request!", 400);
      }
    }),
    async (c) => {
      const user = c.get("user");
      if (!user) return c.text("Unauthorized", 401);

      const validated = c.req.valid("query");
      const jobId = validated.jobId;

      const response = await redis.get(`job:${jobId}:status`);
      if (!response) return c.text("Sync job not found", 404);
      const jobStatus = JSON.parse(response) as status;

      return c.json({
        status: jobStatus.status,
        finished: jobStatus.finished,
        createdAt: jobStatus.createdAt,
      });
    }
  )

  .post(
    "/",
    zValidator("json", z.array(csvItemSchema), (result, c) => {
      if (!result.success) {
        return c.text("Invalid request!", 400);
      }
    }),
    async (c) => {
      const user = c.get("user");
      if (!user) return c.text("Unauthorized", 401);

      const validated = c.req.valid("json");
      const itemIds: number[] = validated.map((item: csvItem) => item.id);
      console.log("Raw Item IDs", itemIds);

      const itemIdsInCollection = await getExistingItemIdsInCollection(
        itemIds,
        user.id
      );
      console.log("DB: Item IDs in Collection", itemIdsInCollection);
      const itemIdsNotInCollection = itemIds.filter(
        (itemId) =>
          !itemIdsInCollection.some(
            (existingItem) => existingItem.itemId === itemId
          )
      );
      console.log("Item IDs not in Collection", itemIdsNotInCollection);

      const existingItemIds = await getExistingItemIdsInItem(
        itemIdsNotInCollection
      );
      console.log("DB:Existing Item IDs", existingItemIds);

      // using existingItemIds, filter out items to be inserted to user's collection w/o the need for worker scraping
      const itemsToInsertToCollection = validated.filter((item: csvItem) =>
        existingItemIds.some((existingItem) => existingItem.id === item.id)
      );
      console.log("Items to Insert to Collection", itemsToInsertToCollection);
      if (itemsToInsertToCollection.length > 0) {
        const insertToCollectionResult = await insertToCollection(
          itemsToInsertToCollection,
          user.id
        );
        console.log("DB: Insert to Collection", insertToCollectionResult);
      }

      const newItemIds = itemIdsNotInCollection.filter(
        (itemId) =>
          !existingItemIds.some((existingItem) => existingItem.id === itemId)
      );
      console.log("New Item IDs", newItemIds);
      const newItems = validated.filter((item: csvItem) =>
        newItemIds.includes(item.id)
      );
      console.log("New Items to Scrape", newItems);

      if (newItems.length > 0) {
        try {
          const job = await syncQueue.add(
            "sync-job",
            { items: newItems, userId: user.id },
            {
              removeOnComplete: true,
              removeOnFail: true,
              jobId: generateUUID(),
            }
          );
          const status = await redis.set(
            `job:${job.id}:status`,
            JSON.stringify({
              status: "Your sync job has been added to queue. Please wait...",
              finished: false,
              createdAt: new Date().toISOString(),
            }),
            "EX",
            60
          );
          console.log("Pending Status:", status);
          return c.json({
            message: "Job added to queue.",
            success: true,
            existingItems: itemsToInsertToCollection.length,
            newItems: newItemIds,
            jobId: job.id,
          });
        } catch (error) {
          return c.text("Failed to add job to queue.", 500);
        }
      }

      return c.json({
        message: "Sync completed",
        success: true,
        existingItems: itemsToInsertToCollection.length,
        newItems: newItemIds,
        jobId: null,
      });
    }
  );
