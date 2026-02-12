import { Elysia, status, sse } from "elysia";
import * as z from "zod";
import { betterAuth } from "@/middleware/better-auth";
import { requestContext } from "@/middleware/request-context";
import { rateLimit } from "@/middleware/rate-limit";
import { collectionSyncSchema, csvItemSchema, orderSyncSchema } from "./model";
import type {
  OrderItemSyncType,
  UpdatedSyncOrder,
  CollectionSyncType,
  UpdatedSyncCollection,
  UpdatedSyncOrderItem,
  CollectionInsertType,
} from "./model";
import SyncService from "./service";
import { tryCatch } from "@myakiba/utils";
import { SYNC_SESSION_STATUSES, SYNC_TYPES } from "@myakiba/constants";
import { createId } from "@paralleldrive/cuid2";

const syncRouter = new Elysia({ prefix: "/sync" })
  .use(betterAuth)
  .use(requestContext)
  .use(rateLimit)
  .post(
    "/csv",
    async ({ body, user, wideEvent }) => {
      if (!user) return status(401, "Unauthorized");

      wideEvent.set({ userId: user.id, itemCount: body.length });

      const items = SyncService.assignOrderIds(body);

      const { data: result, error: processItemsError } = await tryCatch(
        SyncService.processItems(items, user.id),
      );

      if (processItemsError) {
        wideEvent.set({ error: processItemsError, outcome: "error" });
        return status(500, "Failed to process sync request");
      }

      const {
        collectionItems,
        orderItems,
        csvItemsToScrape: itemsToScrape,
        existingItemExternalIds,
      } = result;

      const itemExternalIdsToTrack = itemsToScrape.map((i) => i.itemExternalId);
      const csvItemMetadata = new Map(
        itemsToScrape.map(({ itemExternalId, ...metadata }) => [itemExternalId, metadata]),
      );

      const { data: syncSessionId, error: syncSessionError } = await tryCatch(
        SyncService.createSyncSession(user.id, "csv", itemExternalIdsToTrack, {
          itemMetadata: csvItemMetadata,
          existingItemExternalIds,
        }),
      );

      if (syncSessionError) {
        wideEvent.set({ error: syncSessionError, outcome: "error" });
        return status(500, "Failed to create sync session");
      }

      if (collectionItems.length > 0) {
        const { error: insertToCollectionAndOrdersError } = await tryCatch(
          SyncService.insertToCollectionAndOrders(collectionItems, orderItems),
        );

        if (insertToCollectionAndOrdersError) {
          if (syncSessionId) {
            await tryCatch(
              SyncService.updateSyncSession(syncSessionId, {
                status: "failed",
                statusMessage: "Failed to insert to collection and orders",
                completedAt: new Date(),
              }),
            );
          }
          wideEvent.set({
            error: insertToCollectionAndOrdersError,
            outcome: "error",
          });
          return status(500, "Failed to insert to collection and orders");
        }
      }

      let jobId: string | null | undefined = null;
      let statusMessage: string;

      if (itemsToScrape.length > 0) {
        const { data: jobIdData, error: queueCSVSyncJobError } = await tryCatch(
          SyncService.queueCSVSyncJob(
            itemsToScrape,
            user.id,
            syncSessionId,
            existingItemExternalIds.length,
          ),
        );

        if (queueCSVSyncJobError) {
          if (queueCSVSyncJobError.message === "FAILED_TO_QUEUE_CSV_SYNC_JOB") {
            wideEvent.set({ error: queueCSVSyncJobError, outcome: "error" });
            return status(500, "Failed to queue CSV sync job");
          }
          if (queueCSVSyncJobError.message === "FAILED_TO_SET_JOB_STATUS_IN_REDIS") {
            wideEvent.set({ error: queueCSVSyncJobError, outcome: "error" });
            return status(500, "Failed to set job status");
          }
          wideEvent.set({ error: queueCSVSyncJobError, outcome: "error" });
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

      if (!jobId && syncSessionId) {
        const { error: updateSessionError } = await tryCatch(
          SyncService.updateSyncSession(syncSessionId, {
            status: "completed",
            completedAt: new Date(),
            statusMessage,
            successCount: existingItemExternalIds.length,
          }),
        );
        if (updateSessionError) {
          wideEvent.set({ error: updateSessionError, outcome: "error" });
          return status(500, "Failed to update sync session");
        }
      }

      wideEvent.set({
        outcome: "success",
        existingItemsToInsert: collectionItems.length,
        newItems: itemsToScrape.length,
        jobId: jobId ?? null,
        syncSessionId,
      });

      return {
        status: statusMessage,
        isFinished: jobId ? false : true,
        existingItemsToInsert: collectionItems.length,
        newItems: itemsToScrape.length,
        jobId,
        syncSessionId,
      };
    },
    {
      body: z.array(csvItemSchema),
      auth: true,
      rateLimit: "csv",
    },
  )
  .post(
    "/order",
    async ({ body, user, wideEvent }) => {
      if (!user) return status(401, "Unauthorized");

      wideEvent.set({ userId: user.id, itemCount: body.items.length });

      const orderId = createId();

      const itemExternalIds = body.items.map((item: OrderItemSyncType) => item.itemExternalId);

      const { data: existingItems, error: existingItemsError } = await tryCatch(
        SyncService.getExistingItemsByExternalIds(itemExternalIds),
      );

      if (existingItemsError) {
        wideEvent.set({ error: existingItemsError, outcome: "error" });
        return status(500, "Failed to check for existing items");
      }

      const existingItemIds = existingItems.map((existingItem) => existingItem.id);
      const { data: existingItemsWithReleases, error: existingItemsWithReleasesError } =
        await tryCatch(SyncService.getExistingItemsWithReleases(existingItemIds));

      if (existingItemsWithReleasesError) {
        wideEvent.set({
          error: existingItemsWithReleasesError,
          outcome: "error",
        });
        return status(500, "Failed to check for existing items with releases");
      }

      const externalIdToInternalId = new Map(
        existingItems.map((existingItem) => [existingItem.externalId, existingItem.id]),
      );

      const releaseDates = body.items
        .map((item: OrderItemSyncType) => {
          const internalId = externalIdToInternalId.get(item.itemExternalId);
          if (!internalId) {
            return undefined;
          }
          return existingItemsWithReleases.releaseDates.get(internalId);
        })
        .filter((date): date is string => date !== undefined);

      const latestReleaseDate =
        releaseDates.length > 0
          ? releaseDates.reduce((latest, current) => (current > latest ? current : latest))
          : null;

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { items, ...orderData } = body;
      const order: UpdatedSyncOrder = {
        ...orderData,
        userId: user.id,
        id: orderId,
        releaseDate: latestReleaseDate,
      };

      const itemsToScrape: UpdatedSyncOrderItem[] = body.items
        .filter((item: OrderItemSyncType) => !externalIdToInternalId.has(item.itemExternalId))
        .map((item: OrderItemSyncType) => ({
          ...item,
          itemId: null,
          orderId: orderId,
          releaseId: null,
          userId: user.id,
        }));

      const itemsToInsert: UpdatedSyncOrderItem[] = body.items.flatMap(
        (item: OrderItemSyncType) => {
          const internalItemId = externalIdToInternalId.get(item.itemExternalId);
          if (!internalItemId) {
            return [];
          }
          return [
            {
              ...item,
              itemId: internalItemId,
              orderId: orderId,
              releaseId: existingItemsWithReleases.releases.get(internalItemId) ?? null,
              userId: user.id,
            },
          ];
        },
      );

      const orderItemExternalIdsToTrack = itemsToScrape.map((i) => i.itemExternalId);
      const existingOrderItemExternalIds = itemsToInsert.map((i) => i.itemExternalId);
      const orderItemMetadata = new Map(
        itemsToScrape.map((item) => [
          item.itemExternalId,
          {
            price: item.price,
            count: item.count,
            status: item.status,
            condition: item.condition,
            shippingMethod: item.shippingMethod,
            orderDate: item.orderDate,
            paymentDate: item.paymentDate,
            shippingDate: item.shippingDate,
            collectionDate: item.collectionDate,
          },
        ]),
      );
      const collectionItemsToInsert: CollectionInsertType[] = itemsToInsert
        .filter((item): item is UpdatedSyncOrderItem & { itemId: string } => item.itemId !== null)
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

      const { data: syncSessionId, error: syncSessionError } = await tryCatch(
        SyncService.createSyncSession(user.id, "order", orderItemExternalIdsToTrack, {
          orderId: collectionItemsToInsert.length > 0 ? orderId : undefined,
          orderPayload: order,
          itemMetadata: orderItemMetadata,
          existingItemExternalIds: existingOrderItemExternalIds,
        }),
      );

      if (syncSessionError) {
        wideEvent.set({ error: syncSessionError, outcome: "error" });
        return status(500, "Failed to create sync session");
      }

      if (collectionItemsToInsert.length > 0) {
        const { error: insertToCollectionAndOrdersError } = await tryCatch(
          SyncService.insertToCollectionAndOrders(collectionItemsToInsert, [order]),
        );

        if (insertToCollectionAndOrdersError) {
          if (syncSessionId) {
            await tryCatch(
              SyncService.updateSyncSession(syncSessionId, {
                status: "failed",
                statusMessage: "Failed to insert to collection and orders",
                completedAt: new Date(),
              }),
            );
          }
          wideEvent.set({
            error: insertToCollectionAndOrdersError,
            outcome: "error",
          });
          return status(500, "Failed to insert to collection and orders");
        }
      }

      let jobId: string | null | undefined = null;
      if (itemsToScrape.length > 0) {
        const { data: jobIdData, error: queueOrderSyncJobError } = await tryCatch(
          SyncService.queueOrderSyncJob(
            user.id,
            order,
            itemsToScrape,
            itemsToInsert,
            syncSessionId,
            existingOrderItemExternalIds.length,
          ),
        );

        if (queueOrderSyncJobError) {
          if (queueOrderSyncJobError.message === "FAILED_TO_QUEUE_ORDER_SYNC_JOB") {
            wideEvent.set({ error: queueOrderSyncJobError, outcome: "error" });
            return status(500, "Failed to queue order sync job");
          }
          if (queueOrderSyncJobError.message === "FAILED_TO_SET_JOB_STATUS_IN_REDIS") {
            wideEvent.set({ error: queueOrderSyncJobError, outcome: "error" });
            return status(500, "Failed to set job status");
          }
          wideEvent.set({ error: queueOrderSyncJobError, outcome: "error" });
          return status(500, "Failed to queue order sync job");
        }

        jobId = jobIdData;
      } else {
        if (syncSessionId) {
          const { error: updateSessionError } = await tryCatch(
            SyncService.updateSyncSession(syncSessionId, {
              status: "completed",
              completedAt: new Date(),
              statusMessage: "Sync completed",
              orderId,
              successCount: existingOrderItemExternalIds.length,
            }),
          );
          if (updateSessionError) {
            wideEvent.set({ error: updateSessionError, outcome: "error" });
            return status(500, "Failed to update sync session");
          }
        }
      }

      wideEvent.set({
        outcome: "success",
        orderId,
        existingItemsToInsert: itemsToInsert.length,
        newItems: itemsToScrape.length,
        jobId: jobId ?? null,
        syncSessionId,
      });

      return {
        status: jobId ? "Job added to queue." : "Sync completed",
        isFinished: jobId ? false : true,
        existingItemsToInsert: itemsToInsert.length,
        newItems: itemsToScrape.length,
        jobId,
        syncSessionId,
      };
    },
    {
      body: orderSyncSchema,
      auth: true,
      rateLimit: "order",
    },
  )
  .post(
    "/collection",
    async ({ body, user, wideEvent }) => {
      if (!user) return status(401, "Unauthorized");

      wideEvent.set({ userId: user.id, itemCount: body.length });

      const itemExternalIds = body.map((item: CollectionSyncType) => item.itemExternalId);

      const { data: existingItems, error: existingItemsError } = await tryCatch(
        SyncService.getExistingItemsByExternalIds(itemExternalIds),
      );

      if (existingItemsError) {
        wideEvent.set({ error: existingItemsError, outcome: "error" });
        return status(500, "Failed to check for existing items");
      }

      const existingItemIds = existingItems.map((existingItem) => existingItem.id);
      const { data: existingItemsWithReleases, error: existingItemsWithReleasesError } =
        await tryCatch(SyncService.getExistingItemsWithReleases(existingItemIds));

      if (existingItemsWithReleasesError) {
        wideEvent.set({
          error: existingItemsWithReleasesError,
          outcome: "error",
        });
        return status(500, "Failed to check for existing items with releases");
      }

      const externalIdToInternalId = new Map(
        existingItems.map((existingItem) => [existingItem.externalId, existingItem.id]),
      );

      const itemsToScrape: UpdatedSyncCollection[] = body
        .filter((item: CollectionSyncType) => !externalIdToInternalId.has(item.itemExternalId))
        .map((item: CollectionSyncType) => ({
          ...item,
          itemId: null,
          releaseId: null,
          userId: user.id,
        }));

      const itemsToInsert: UpdatedSyncCollection[] = body.flatMap((item: CollectionSyncType) => {
        const internalItemId = externalIdToInternalId.get(item.itemExternalId);
        if (!internalItemId) {
          return [];
        }
        return [
          {
            ...item,
            itemId: internalItemId,
            releaseId: existingItemsWithReleases.releases.get(internalItemId) ?? null,
            userId: user.id,
          },
        ];
      });

      const collectionItemExternalIdsToTrack = itemsToScrape.map((i) => i.itemExternalId);
      const existingCollectionItemExternalIds = itemsToInsert.map((i) => i.itemExternalId);
      const collectionItemMetadata = new Map(
        itemsToScrape.map((item) => [
          item.itemExternalId,
          {
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
          },
        ]),
      );
      const collectionItemsToInsert: CollectionInsertType[] = itemsToInsert
        .filter((item): item is UpdatedSyncCollection & { itemId: string } => item.itemId !== null)
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

      const { data: syncSessionId, error: syncSessionError } = await tryCatch(
        SyncService.createSyncSession(user.id, "collection", collectionItemExternalIdsToTrack, {
          itemMetadata: collectionItemMetadata,
          existingItemExternalIds: existingCollectionItemExternalIds,
        }),
      );

      if (syncSessionError) {
        wideEvent.set({ error: syncSessionError, outcome: "error" });
        return status(500, "Failed to create sync session");
      }

      if (collectionItemsToInsert.length > 0) {
        const { error: insertToCollectionAndOrdersError } = await tryCatch(
          SyncService.insertToCollectionAndOrders(collectionItemsToInsert),
        );

        if (insertToCollectionAndOrdersError) {
          if (syncSessionId) {
            await tryCatch(
              SyncService.updateSyncSession(syncSessionId, {
                status: "failed",
                statusMessage: "Failed to insert to collection and orders",
                completedAt: new Date(),
              }),
            );
          }
          wideEvent.set({
            error: insertToCollectionAndOrdersError,
            outcome: "error",
          });
          return status(500, "Failed to insert to collection and orders");
        }
      }

      let jobId: string | null | undefined = null;
      if (itemsToScrape.length > 0) {
        const { data: jobIdData, error: queueCollectionSyncJobError } = await tryCatch(
          SyncService.queueCollectionSyncJob(
            user.id,
            itemsToScrape,
            itemsToInsert,
            syncSessionId,
            existingCollectionItemExternalIds.length,
          ),
        );

        if (queueCollectionSyncJobError) {
          if (queueCollectionSyncJobError.message === "FAILED_TO_QUEUE_COLLECTION_SYNC_JOB") {
            wideEvent.set({
              error: queueCollectionSyncJobError,
              outcome: "error",
            });
            return status(500, "Failed to queue collection sync job");
          }
          if (queueCollectionSyncJobError.message === "FAILED_TO_SET_JOB_STATUS_IN_REDIS") {
            wideEvent.set({
              error: queueCollectionSyncJobError,
              outcome: "error",
            });
            return status(500, "Failed to set job status");
          }
          wideEvent.set({
            error: queueCollectionSyncJobError,
            outcome: "error",
          });
          return status(500, "Failed to queue collection sync job");
        }

        jobId = jobIdData;
      } else {
        if (syncSessionId) {
          const { error: updateSessionError } = await tryCatch(
            SyncService.updateSyncSession(syncSessionId, {
              status: "completed",
              completedAt: new Date(),
              statusMessage: "Sync completed",
              successCount: existingCollectionItemExternalIds.length,
            }),
          );
          if (updateSessionError) {
            wideEvent.set({ error: updateSessionError, outcome: "error" });
            return status(500, "Failed to update sync session");
          }
        }
      }

      wideEvent.set({
        outcome: "success",
        existingItemsToInsert: itemsToInsert.length,
        newItems: itemsToScrape.length,
        jobId: jobId ?? null,
        syncSessionId,
      });

      return {
        status: jobId ? "Job added to queue." : "Sync completed",
        isFinished: jobId ? false : true,
        existingItemsToInsert: itemsToInsert.length,
        newItems: itemsToScrape.length,
        jobId,
        syncSessionId,
      };
    },
    {
      body: z.array(collectionSyncSchema),
      auth: true,
      rateLimit: "collection",
    },
  )
  .get(
    "/sessions",
    async ({ query, user, wideEvent }) => {
      if (!user) return status(401, "Unauthorized");

      wideEvent.set({ userId: user.id });

      const page = query.page ? parseInt(query.page, 10) : 1;
      const limit = query.limit ? parseInt(query.limit, 10) : 20;

      if (isNaN(page) || page < 1) return status(400, "Invalid page parameter");
      if (isNaN(limit) || limit < 1 || limit > 100) return status(400, "Invalid limit parameter");

      const { data: result, error } = await tryCatch(
        SyncService.getSyncSessions(user.id, page, limit, query.status, query.syncType),
      );

      if (error) {
        wideEvent.set({ error, outcome: "error" });
        return status(500, "Failed to fetch sync sessions");
      }

      return { sessions: result.sessions, total: result.total, page, limit };
    },
    {
      query: z.object({
        page: z.string().optional(),
        limit: z.string().optional(),
        status: z.enum(SYNC_SESSION_STATUSES).optional(),
        syncType: z.enum(SYNC_TYPES).optional(),
      }),
      auth: true,
    },
  )
  .get(
    "/sessions/:id",
    async ({ params, query, user, wideEvent }) => {
      if (!user) return status(401, "Unauthorized");

      wideEvent.set({ userId: user.id, sessionId: params.id });

      const page = query.page ? parseInt(query.page, 10) : undefined;
      const limit = query.limit ? parseInt(query.limit, 10) : undefined;

      if (page !== undefined && (isNaN(page) || page < 1))
        return status(400, "Invalid page parameter");
      if (limit !== undefined && (isNaN(limit) || limit < 1 || limit > 100))
        return status(400, "Invalid limit parameter");

      const { data: result, error } = await tryCatch(
        SyncService.getSyncSessionDetail(params.id, user.id, page, limit),
      );

      if (error) {
        wideEvent.set({ error, outcome: "error" });
        return status(500, "Failed to fetch sync session detail");
      }

      if (!result) {
        return status(404, "Sync session not found");
      }

      return {
        session: { ...result.session, items: result.items },
        totalItems: result.totalItems,
      };
    },
    {
      params: z.object({ id: z.string() }),
      query: z.object({
        page: z.string().optional(),
        limit: z.string().optional(),
      }),
      auth: true,
    },
  )
  .post(
    "/retry",
    async ({ body, user, wideEvent }) => {
      if (!user) return status(401, "Unauthorized");

      wideEvent.set({ userId: user.id, syncSessionId: body.syncSessionId });

      const { data: result, error } = await tryCatch(
        SyncService.retryFailedItems(body.syncSessionId, user.id),
      );

      if (error) {
        switch (error.message) {
          case "SYNC_SESSION_NOT_FOUND":
            wideEvent.set({ error, outcome: "error" });
            return status(404, "Sync session not found");
          case "NO_FAILED_ITEMS_TO_RETRY":
            wideEvent.set({ error, outcome: "error" });
            return status(409, "No failed items to retry");
          case "ORDER_NOT_FOUND_FOR_RETRY":
            wideEvent.set({ error, outcome: "error" });
            return status(404, "Original order not found, please re-submit the sync");
          default:
            wideEvent.set({ error, outcome: "error" });
            return status(500, "Failed to retry failed items");
        }
      }

      wideEvent.set({ outcome: "success", ...result });

      return result;
    },
    {
      body: z.object({
        syncSessionId: z.string().min(1),
      }),
      auth: true,
    },
  )
  .get(
    "/job-status",
    async function* ({ query, user, wideEvent }) {
      if (!user) return status(401, "Unauthorized");

      wideEvent.set({ userId: user.id, jobId: query.jobId });

      const { jobId } = query;
      const MAX_POLL_DURATION_MS = 10 * 60 * 1000; // 10 minutes
      const startTime = Date.now();

      while (true) {
        if (Date.now() - startTime > MAX_POLL_DURATION_MS) {
          wideEvent.set({ outcome: "timeout" });
          yield sse({
            data: {
              status: "Status stream timed out — refresh to check latest status",
              finished: true,
              createdAt: new Date().toISOString(),
              terminalState: "timeout",
            },
          });
          return;
        }

        const { data: jobStatus, error } = await tryCatch(SyncService.getJobStatus(jobId, user.id));

        if (error) {
          const message =
            error.message === "SYNC_JOB_NOT_FOUND" ? "Job not found" : "Error fetching job status";

          wideEvent.set({ error, outcome: "error" });

          yield sse({
            data: {
              status: message,
              finished: true,
              createdAt: new Date().toISOString(),
              terminalState: "error",
            },
          });
          return;
        }

        yield sse({
          data: {
            status: jobStatus.status,
            finished: jobStatus.finished,
            createdAt: jobStatus.createdAt,
            terminalState: jobStatus.terminalState,
          },
        });

        if (jobStatus.finished) {
          wideEvent.set({ outcome: jobStatus.terminalState === "success" ? "success" : "error" });
          return;
        }

        await Bun.sleep(2000);
      }
    },
    {
      query: z.object({ jobId: z.string().min(1) }),
      auth: true,
    },
  );

export default syncRouter;
