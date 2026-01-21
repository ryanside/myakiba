import { Elysia, status } from "elysia";
import * as z from "zod";
import { betterAuth } from "@/middleware/better-auth";
import { rateLimit } from "@/middleware/rate-limit";
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
import { tryCatch } from "@myakiba/utils";
import { createId } from "@paralleldrive/cuid2";

const syncRouter = new Elysia({ prefix: "/sync" })
  .use(betterAuth)
  .use(rateLimit)
  .post(
    "/csv",
    async ({ body, user }) => {
      if (!user) return status(401, "Unauthorized");

      const items = SyncService.assignOrderIdsAndSanitizeDates(body);

      const { data: result, error: processItemsError } = await tryCatch(
        SyncService.processItems(items, user.id)
      );

      if (processItemsError) {
        console.error("Error during processItems():", processItemsError, {
          userId: user.id,
          collectionItems: items,
        });
        return status(500, "Failed to process sync request");
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
          return status(500, "Failed to insert to collection and orders");
        }
      }

      let jobId: string | null | undefined = null;
      let statusMessage: string;

      if (itemsToScrape.length > 0) {
        const { data: jobIdData, error: queueCSVSyncJobError } = await tryCatch(
          SyncService.queueCSVSyncJob(itemsToScrape, user.id)
        );

        if (queueCSVSyncJobError) {
          if (queueCSVSyncJobError.message === "FAILED_TO_QUEUE_CSV_SYNC_JOB") {
            return status(500, "Failed to queue CSV sync job");
          }
          if (
            queueCSVSyncJobError.message === "FAILED_TO_SET_JOB_STATUS_IN_REDIS"
          ) {
            return status(500, "Failed to set job status");
          }
          console.error(
            "Error during queueCSVSyncJob():",
            queueCSVSyncJobError,
            {
              userId: user.id,
              itemsToScrape: itemsToScrape,
            }
          );
          return status(500, "Failed to queue CSV sync job");
        }

        jobId = jobIdData;
        statusMessage = jobId ? "Job added to queue." : "Sync completed";
      } else if (collectionItems.length === 0 && itemsToScrape.length === 0) {
        statusMessage =
          "All items already synced to your collection. If you want to add duplicates, use Collection/Order Sync.";
      } else {
        statusMessage =
          "Sync completed - All items already in myakiba database, no scraping needed";
      }

      return {
        status: statusMessage,
        isFinished: jobId ? false : true,
        existingItemsToInsert: collectionItems.length,
        newItems: itemsToScrape.length,
        jobId,
      };
    },
    {
      body: z.array(csvItemSchema),
      auth: true,
      rateLimit: "csv",
    }
  )
  .post(
    "/order",
    async ({ body, user }) => {
      if (!user) return status(401, "Unauthorized");

      const orderId = createId();

      const itemIds = body.items.map(
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
        return status(500, "Failed to check for existing items with releases");
      }

      const releaseDates = body.items
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

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { items, ...orderData } = body;
      const order: UpdatedSyncOrder = {
        ...orderData,
        userId: user.id,
        id: orderId,
        releaseMonthYear: latestReleaseDate,
      };

      const itemsToScrape: UpdatedSyncOrderItem[] = body.items
        .filter(
          (item: orderItemSyncType) => !existingItems.releases.get(item.itemId)
        )
        .map((item: orderItemSyncType) => ({
          ...item,
          orderId: orderId,
          releaseId: "",
          userId: user.id,
        }));

      const itemsToInsert: UpdatedSyncOrderItem[] = body.items
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
            return status(500, "Failed to queue order sync job");
          }
          if (
            queueOrderSyncJobError.message ===
            "FAILED_TO_SET_JOB_STATUS_IN_REDIS"
          ) {
            return status(500, "Failed to set job status");
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
          return status(500, "Failed to queue order sync job");
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
          return status(500, "Failed to insert to collection and orders");
        }
      }

      return {
        status: jobId ? "Job added to queue." : "Sync completed",
        isFinished: jobId ? false : true,
        existingItemsToInsert: itemsToInsert.length,
        newItems: itemsToScrape.length,
        jobId,
      };
    },
    {
      body: orderSyncSchema,
      auth: true,
      rateLimit: "order",
    }
  )
  .post(
    "/collection",
    async ({ body, user }) => {
      if (!user) return status(401, "Unauthorized");

      const itemIds = body.map((item: collectionSyncType) => item.itemId);

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
        return status(500, "Failed to check for existing items with releases");
      }

      const itemsToScrape: UpdatedSyncCollection[] = body
        .filter(
          (item: collectionSyncType) => !existingItems.releases.get(item.itemId)
        )
        .map((item: collectionSyncType) => ({
          ...item,
          releaseId: "",
          userId: user.id,
        }));

      const itemsToInsert: UpdatedSyncCollection[] = body
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
            return status(500, "Failed to queue collection sync job");
          }
          if (
            queueCollectionSyncJobError.message ===
            "FAILED_TO_SET_JOB_STATUS_IN_REDIS"
          ) {
            return status(500, "Failed to set job status");
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
          return status(500, "Failed to queue collection sync job");
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
          return status(500, "Failed to insert to collection and orders");
        }
      }

      return {
        status: jobId ? "Job added to queue." : "Sync completed",
        isFinished: jobId ? false : true,
        existingItemsToInsert: itemsToInsert.length,
        newItems: itemsToScrape.length,
        jobId,
      };
    },
    {
      body: z.array(collectionSyncSchema),
      auth: true,
      rateLimit: "collection",
    }
  )
  .get(
    "/job-status",
    async ({ query, user }) => {
      if (!user) {
        return status(401, {
          status: "Unauthorized",
          finished: true,
          createdAt: new Date().toISOString(),
        });
      }

      const { jobId } = query;

      const { data: jobStatus, error } = await tryCatch(
        SyncService.getJobStatus(jobId)
      );

      if (error) {
        if (error.message === "SYNC_JOB_NOT_FOUND") {
          return status(404, {
            status: "Job not found",
            finished: true,
            createdAt: new Date().toISOString(),
          });
        }

        console.error("Error fetching job status:", error, {
          jobId,
          userId: user.id,
        });

        return status(500, {
          status: "Error fetching job status",
          finished: true,
          createdAt: new Date().toISOString(),
        });
      }

      return {
        status: jobStatus.status,
        finished: jobStatus.finished,
        createdAt: jobStatus.createdAt,
      };
    },
    {
      query: z.object({ jobId: z.string().min(1) }),
      auth: true,
    }
  );

export default syncRouter;
