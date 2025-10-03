import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { Variables } from "../..";
import {
  collectionSyncSchema,
  csvItemSchema,
  orderSyncSchema,
  type orderItemSyncType,
  type UpdatedSyncOrder,
  type collectionSyncType,
  type UpdatedSyncCollection,
  type UpdatedSyncOrderItem,
} from "./model";
import SyncService from "./service";
import { tryCatch } from "@/lib/utils";
import { createId } from "@paralleldrive/cuid2";

const syncRouter = new Hono<{
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

      const validatedQuery = c.req.valid("query");

      const { data: jobStatus, error } = await tryCatch(
        SyncService.getJobStatus(validatedQuery.jobId)
      );

      if (error) {
        if (error.message === "SYNC_JOB_NOT_FOUND") {
          return c.text("Sync job not found", 404);
        }

        console.error("Error getJobStatus():", error, {
          userId: user.id,
          jobId: validatedQuery.jobId,
        });

        return c.text("Failed to get sync job status", 500);
      }

      return c.json({
        status: jobStatus.status,
        finished: jobStatus.finished,
        createdAt: jobStatus.createdAt,
      });
    }
  )
  .post(
    "/csv",
    zValidator("json", z.array(csvItemSchema), (result, c) => {
      if (!result.success) {
        return c.text("Invalid request!", 400);
      }
    }),
    async (c) => {
      const user = c.get("user");
      if (!user) return c.text("Unauthorized", 401);

      const validatedJSON = c.req.valid("json");

      const items = SyncService.assignOrderIdsAndSanitizeDates(validatedJSON);

      const { data: result, error: processItemsError } = await tryCatch(
        SyncService.processItems(items, user.id)
      );

      if (processItemsError) {
        console.error("Error during processItems():", processItemsError, {
          userId: user.id,
          collectionItems: items,
        });
        return c.text("Failed to process sync request", 500);
      }

      const {
        collectionItems,
        orderItems,
        csvItemsToScrape: itemsToScrape,
      } = result;

      if (collectionItems.length > 0) {
        const { error: insertToCollectionAndOrdersError } = await tryCatch(
          SyncService.insertToCollectionAndOrders(collectionItems, orderItems)
        );

        if (insertToCollectionAndOrdersError) {
          console.error(
            "Error during insertToCollectionAndOrders():",
            insertToCollectionAndOrdersError,
            {
              userId: user.id,
              collectionItems: collectionItems,
              orderItems: orderItems,
            }
          );
          return c.text("Failed to insert to collection and orders", 500);
        }
      }

      let jobId: string | null | undefined = null;
      if (itemsToScrape.length > 0) {
        const { data: jobIdData, error: queueCSVSyncJobError } = await tryCatch(
          SyncService.queueCSVSyncJob(itemsToScrape, user.id)
        );

        if (queueCSVSyncJobError) {
          if (queueCSVSyncJobError.message === "FAILED_TO_QUEUE_CSV_SYNC_JOB") {
            return c.text("Failed to queue CSV sync job", 500);
          }
          if (
            queueCSVSyncJobError.message === "FAILED_TO_SET_JOB_STATUS_IN_REDIS"
          ) {
            return c.text("Failed to set job status", 500);
          }
          console.error(
            "Error during queueCSVSyncJob():",
            queueCSVSyncJobError,
            {
              userId: user.id,
              itemsToScrape: itemsToScrape,
            }
          );
          return c.text("Failed to queue CSV sync job", 500);
        }

        jobId = jobIdData;
      }

      return c.json({
        status: jobId ? "Job added to queue." : "Sync completed",
        isFinished: jobId ? false : true,
        existingItemsToInsert: collectionItems.length,
        newItems: itemsToScrape.length,
        jobId,
      });
    }
  )
  .post(
    "/order",
    zValidator("json", orderSyncSchema, (result, c) => {
      if (!result.success) {
        return c.text("Invalid request!", 400);
      }
    }),
    async (c) => {
      const user = c.get("user");
      if (!user) return c.text("Unauthorized", 401);

      const validatedJSON = c.req.valid("json");
      const orderId = createId();

      const itemIds = validatedJSON.items.map(
        (item: orderItemSyncType) => item.itemId
      );

      const { data: existingItems, error: existingItemsError } = await tryCatch(
        SyncService.getExistingItemsWithReleases(itemIds)
      );

      if (existingItemsError) {
        console.error(
          "Error during getExistingItemsWithReleases():",
          existingItemsError,
          {
            userId: user.id,
            itemIds: itemIds,
          }
        );
        return c.text("Failed to check for existing items with releases", 500);
      }

      const releaseDates = validatedJSON.items
        .map((item: orderItemSyncType) =>
          existingItems.releaseDates.get(item.itemId)
        )
        .filter((date): date is string => date !== undefined);

      const latestReleaseDate =
        releaseDates.length > 0
          ? releaseDates.reduce((latest, current) =>
              current > latest ? current : latest
            )
          : null;

      const { items, ...orderData } = validatedJSON;
      const order: UpdatedSyncOrder = {
        ...orderData,
        userId: user.id,
        id: orderId,
        releaseMonthYear: latestReleaseDate,
      };

      const itemsToScrape: UpdatedSyncOrderItem[] = validatedJSON.items
        .filter(
          (item: orderItemSyncType) => !existingItems.releases.get(item.itemId)
        )
        .map((item: orderItemSyncType) => ({
          ...item,
          orderId: orderId,
          releaseId: "",
          userId: user.id,
        }));

      const itemsToInsert: UpdatedSyncOrderItem[] = validatedJSON.items
        .filter((item: orderItemSyncType) =>
          existingItems.releases.get(item.itemId)
        )
        .map((item: orderItemSyncType) => ({
          ...item,
          orderId: orderId,
          releaseId: existingItems.releases.get(item.itemId) ?? "",
          userId: user.id,
        }));

      let jobId: string | null | undefined = null;
      if (itemsToScrape.length > 0) {
        const { data: jobIdData, error: queueOrderSyncJobError } =
          await tryCatch(
            SyncService.queueOrderSyncJob(
              user.id,
              order,
              itemsToScrape,
              itemsToInsert
            )
          );

        if (queueOrderSyncJobError) {
          if (
            queueOrderSyncJobError.message === "FAILED_TO_QUEUE_ORDER_SYNC_JOB"
          ) {
            return c.text("Failed to queue order sync job", 500);
          }
          if (
            queueOrderSyncJobError.message ===
            "FAILED_TO_SET_JOB_STATUS_IN_REDIS"
          ) {
            return c.text("Failed to set job status", 500);
          }
          console.error(
            "Error during queueOrderSyncJob():",
            queueOrderSyncJobError,
            {
              userId: user.id,
              order: order,
              itemsToScrape: itemsToScrape,
              itemsToInsert: itemsToInsert,
            }
          );
          return c.text("Failed to queue order sync job", 500);
        }

        jobId = jobIdData;
      } else {
        const { error: insertToCollectionAndOrdersError } = await tryCatch(
          SyncService.insertToCollectionAndOrders(itemsToInsert, [order])
        );

        if (insertToCollectionAndOrdersError) {
          console.error(
            "Error during insertToCollectionAndOrders():",
            insertToCollectionAndOrdersError,
            {
              userId: user.id,
              collectionItems: itemsToInsert,
              orderItems: [order],
            }
          );
          return c.text("Failed to insert to collection and orders", 500);
        }
      }

      return c.json({
        status: jobId ? "Job added to queue." : "Sync completed",
        isFinished: jobId ? false : true,
        existingItemsToInsert: itemsToInsert.length,
        newItems: itemsToScrape.length,
        jobId,
      });
    }
  )
  .post(
    "/collection",
    zValidator("json", z.array(collectionSyncSchema), (result, c) => {
      if (!result.success) {
        return c.text("Invalid request!", 400);
      }
    }),
    async (c) => {
      const user = c.get("user");
      if (!user) return c.text("Unauthorized", 401);

      const validatedJSON = c.req.valid("json");

      const itemIds = validatedJSON.map(
        (item: collectionSyncType) => item.itemId
      );

      const { data: existingItems, error: existingItemsError } = await tryCatch(
        SyncService.getExistingItemsWithReleases(itemIds)
      );

      if (existingItemsError) {
        console.error(
          "Error during getExistingItemsWithReleases():",
          existingItemsError,
          {
            userId: user.id,
            itemIds: itemIds,
          }
        );
        return c.text("Failed to check for existing items with releases", 500);
      }

      const itemsToScrape: UpdatedSyncCollection[] = validatedJSON
        .filter(
          (item: collectionSyncType) => !existingItems.releases.get(item.itemId)
        )
        .map((item: collectionSyncType) => ({
          ...item,
          releaseId: "",
          userId: user.id,
        }));

      const itemsToInsert: UpdatedSyncCollection[] = validatedJSON
        .filter((item: collectionSyncType) =>
          existingItems.releases.get(item.itemId)
        )
        .map((item: collectionSyncType) => ({
          ...item,
          releaseId: existingItems.releases.get(item.itemId) ?? "",
          userId: user.id,
        }));

      let jobId: string | null | undefined = null;
      if (itemsToScrape.length > 0) {
        const { data: jobIdData, error: queueCollectionSyncJobError } =
          await tryCatch(
            SyncService.queueCollectionSyncJob(
              user.id,
              itemsToScrape,
              itemsToInsert
            )
          );

        if (queueCollectionSyncJobError) {
          if (
            queueCollectionSyncJobError.message ===
            "FAILED_TO_QUEUE_COLLECTION_SYNC_JOB"
          ) {
            return c.text("Failed to queue collection sync job", 500);
          }
          if (
            queueCollectionSyncJobError.message ===
            "FAILED_TO_SET_JOB_STATUS_IN_REDIS"
          ) {
            return c.text("Failed to set job status", 500);
          }
          console.error(
            "Error during queueCollectionSyncJob():",
            queueCollectionSyncJobError,
            {
              userId: user.id,
              itemsToScrape: itemsToScrape,
              itemsToInsert: itemsToInsert,
            }
          );
          return c.text("Failed to queue collection sync job", 500);
        }

        jobId = jobIdData;
      } else {
        const { error: insertToCollectionAndOrdersError } = await tryCatch(
          SyncService.insertToCollectionAndOrders(itemsToInsert)
        );

        if (insertToCollectionAndOrdersError) {
          console.error(
            "Error during insertToCollectionAndOrders():",
            insertToCollectionAndOrdersError,
            {
              userId: user.id,
              itemsToInsert: itemsToInsert,
            }
          );
          return c.text("Failed to insert to collection and orders", 500);
        }
      }

      return c.json({
        status: jobId ? "Job added to queue." : "Sync completed",
        isFinished: jobId ? false : true,
        existingItemsToInsert: itemsToInsert.length,
        newItems: itemsToScrape.length,
        jobId,
      });
    }
  );
export default syncRouter;
