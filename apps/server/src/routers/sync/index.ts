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
  type collectionInsertType,
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

      const items = SyncService.assignOrderIds(body);

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

      const itemExternalIds = body.items.map(
        (item: orderItemSyncType) => item.itemExternalId
      );

      const { data: existingItems, error: existingItemsError } = await tryCatch(
        SyncService.getExistingItemsByExternalIds(itemExternalIds)
      );

      if (existingItemsError) {
        console.error(
          "Error during getExistingItemsByExternalIds():",
          existingItemsError,
          {
            userId: user.id,
            itemExternalIds: itemExternalIds,
          }
        );
        return status(500, "Failed to check for existing items");
      }

      const existingItemIds = existingItems.map(
        (existingItem) => existingItem.id
      );
      const {
        data: existingItemsWithReleases,
        error: existingItemsWithReleasesError,
      } = await tryCatch(
        SyncService.getExistingItemsWithReleases(existingItemIds)
      );

      if (existingItemsWithReleasesError) {
        console.error(
          "Error during getExistingItemsWithReleases():",
          existingItemsWithReleasesError,
          {
            userId: user.id,
            itemIds: existingItemIds,
          }
        );
        return status(500, "Failed to check for existing items with releases");
      }

      const externalIdToInternalId = new Map(
        existingItems.map((existingItem) => [
          existingItem.externalId,
          existingItem.id,
        ])
      );

      const releaseDates = body.items
        .map((item: orderItemSyncType) => {
          const internalId = externalIdToInternalId.get(item.itemExternalId);
          if (!internalId) {
            return undefined;
          }
          return existingItemsWithReleases.releaseDates.get(internalId);
        })
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
          (item: orderItemSyncType) =>
            !externalIdToInternalId.has(item.itemExternalId)
        )
        .map((item: orderItemSyncType) => ({
          ...item,
          itemId: null,
          orderId: orderId,
          releaseId: null,
          userId: user.id,
        }));

      const itemsToInsert: UpdatedSyncOrderItem[] = body.items.flatMap(
        (item: orderItemSyncType) => {
          const internalItemId = externalIdToInternalId.get(
            item.itemExternalId
          );
          if (!internalItemId) {
            return [];
          }
          return [
            {
              ...item,
              itemId: internalItemId,
              orderId: orderId,
              releaseId:
                existingItemsWithReleases.releases.get(internalItemId) ?? null,
              userId: user.id,
            },
          ];
        }
      );

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
        const collectionItemsToInsert: collectionInsertType[] = itemsToInsert
          .filter(
            (item): item is UpdatedSyncOrderItem & { itemId: string } =>
              item.itemId !== null
          )
          .map((item) => ({
            userId: item.userId,
            itemId: item.itemId,
            orderId: item.orderId,
            status: item.status,
            count: item.count,
            score: "0.0",
            price: item.price,
            shop: order.shop,
            orderDate: item.orderDate,
            paymentDate: item.paymentDate,
            shippingDate: item.shippingDate,
            collectionDate: item.collectionDate,
            shippingMethod: item.shippingMethod,
            condition: item.condition,
            notes: "",
            tags: [],
            releaseId: item.releaseId,
          }));
        const { error: insertToCollectionAndOrdersError } = await tryCatch(
          SyncService.insertToCollectionAndOrders(collectionItemsToInsert, [
            order,
          ])
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

      const itemExternalIds = body.map(
        (item: collectionSyncType) => item.itemExternalId
      );

      const { data: existingItems, error: existingItemsError } = await tryCatch(
        SyncService.getExistingItemsByExternalIds(itemExternalIds)
      );

      if (existingItemsError) {
        console.error(
          "Error during getExistingItemsByExternalIds():",
          existingItemsError,
          {
            userId: user.id,
            itemExternalIds: itemExternalIds,
          }
        );
        return status(500, "Failed to check for existing items");
      }

      const existingItemIds = existingItems.map(
        (existingItem) => existingItem.id
      );
      const {
        data: existingItemsWithReleases,
        error: existingItemsWithReleasesError,
      } = await tryCatch(
        SyncService.getExistingItemsWithReleases(existingItemIds)
      );

      if (existingItemsWithReleasesError) {
        console.error(
          "Error during getExistingItemsWithReleases():",
          existingItemsWithReleasesError,
          {
            userId: user.id,
            itemIds: existingItemIds,
          }
        );
        return status(500, "Failed to check for existing items with releases");
      }

      const externalIdToInternalId = new Map(
        existingItems.map((existingItem) => [
          existingItem.externalId,
          existingItem.id,
        ])
      );

      const itemsToScrape: UpdatedSyncCollection[] = body
        .filter(
          (item: collectionSyncType) =>
            !externalIdToInternalId.has(item.itemExternalId)
        )
        .map((item: collectionSyncType) => ({
          ...item,
          itemId: null,
          releaseId: null,
          userId: user.id,
        }));

      const itemsToInsert: UpdatedSyncCollection[] = body.flatMap(
        (item: collectionSyncType) => {
          const internalItemId = externalIdToInternalId.get(
            item.itemExternalId
          );
          if (!internalItemId) {
            return [];
          }
          return [
            {
              ...item,
              itemId: internalItemId,
              releaseId:
                existingItemsWithReleases.releases.get(internalItemId) ?? null,
              userId: user.id,
            },
          ];
        }
      );

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
        const collectionItemsToInsert: collectionInsertType[] = itemsToInsert
          .filter(
            (item): item is UpdatedSyncCollection & { itemId: string } =>
              item.itemId !== null
          )
          .map((item) => ({
            userId: item.userId,
            itemId: item.itemId,
            releaseId: item.releaseId,
            price: item.price,
            count: item.count,
            score: item.score,
            shop: item.shop,
            orderDate: item.orderDate,
            paymentDate: item.paymentDate,
            shippingDate: item.shippingDate,
            collectionDate: item.collectionDate,
            shippingMethod: item.shippingMethod,
            tags: item.tags,
            condition: item.condition,
            notes: item.notes,
          }));
        const { error: insertToCollectionAndOrdersError } = await tryCatch(
          SyncService.insertToCollectionAndOrders(collectionItemsToInsert)
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
