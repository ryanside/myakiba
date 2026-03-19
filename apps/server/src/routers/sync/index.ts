import { Elysia, status, sse } from "elysia";
import * as z from "zod";
import { betterAuth } from "@/middleware/better-auth";
import { evlog } from "evlog/elysia";
import { rateLimit } from "@/middleware/rate-limit";
import { collectionSyncSchema, csvItemSchema, orderSyncSchema } from "./model";
import type {
  Status,
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
import {
  jobStatusSubscriptionRegistry,
  type JobStatusSubscription,
} from "./job-status-subscription-registry";

const MAX_JOB_STATUS_STREAM_DURATION_MS = 10 * 60 * 1000;

const createTerminalJobStatus = (
  statusMessage: string,
  terminalState: Status["terminalState"],
): Status => ({
  status: statusMessage,
  finished: true,
  createdAt: new Date().toISOString(),
  terminalState,
});

const jobStatusesMatch = (left: Status, right: Status): boolean =>
  left.status === right.status &&
  left.finished === right.finished &&
  left.createdAt === right.createdAt &&
  left.terminalState === right.terminalState;

const toSseJobStatus = (jobStatus: Status) =>
  sse({
    data: jobStatus,
  });

const waitForAbort = (signal: AbortSignal): Promise<"aborted"> => {
  if (signal.aborted) {
    return Promise.resolve("aborted");
  }

  return new Promise<"aborted">((resolve) => {
    signal.addEventListener("abort", () => resolve("aborted"), { once: true });
  });
};

type NextJobStatusEvent =
  | Readonly<{
      kind: "subscription";
      event: Awaited<ReturnType<JobStatusSubscription["next"]>>;
    }>
  | Readonly<{
      kind: "aborted";
    }>
  | Readonly<{
      kind: "timeout";
    }>;

const waitForNextJobStatusEvent = async (
  subscription: JobStatusSubscription,
  abortPromise: Promise<"aborted">,
  remainingMs: number,
): Promise<NextJobStatusEvent> => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      subscription.next().then(
        (event): NextJobStatusEvent => ({
          kind: "subscription",
          event,
        }),
      ),
      abortPromise.then(
        (): NextJobStatusEvent => ({
          kind: "aborted",
        }),
      ),
      new Promise<NextJobStatusEvent>((resolve) => {
        timeoutId = setTimeout(() => {
          resolve({ kind: "timeout" });
        }, remainingMs);
      }),
    ]);
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  }
};

const syncRouter = new Elysia({ prefix: "/sync" })
  .use(betterAuth)
  .use(evlog())
  .use(rateLimit)
  .post(
    "/csv",
    async ({ body, user, log }) => {
      if (!user) {
        log.set({ outcome: "unauthorized" });
        return status(401, "Unauthorized");
      }

      log.set({
        action: "sync.csv",
        user: { id: user.id },
        sync: { type: "csv" },
        items: { requested: body.length },
      });

      const items = SyncService.assignOrderIds(body);

      const { data: result, error: processItemsError } = await tryCatch(
        SyncService.processItems(items, user.id),
      );

      if (processItemsError) {
        log.error(processItemsError, {
          step: "processItems",
          outcome: "error",
          sync: { type: "csv" },
        });
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
        log.error(syncSessionError, {
          step: "createSyncSession",
          outcome: "error",
          sync: { type: "csv" },
        });
        return status(500, "Failed to create sync session");
      }

      log.set({
        sync: {
          type: "csv",
          sessionId: syncSessionId,
        },
      });

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
          log.error(insertToCollectionAndOrdersError, {
            step: "insertToCollectionAndOrders",
            outcome: "error",
            sync: {
              type: "csv",
              sessionId: syncSessionId,
            },
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
            log.error(queueCSVSyncJobError, {
              step: "queueCSVSyncJob",
              outcome: "error",
              sync: {
                type: "csv",
                sessionId: syncSessionId,
              },
            });
            return status(500, "Failed to queue CSV sync job");
          }
          if (queueCSVSyncJobError.message === "FAILED_TO_SET_JOB_STATUS_IN_REDIS") {
            log.error(queueCSVSyncJobError, {
              step: "queueCSVSyncJob",
              outcome: "error",
              sync: {
                type: "csv",
                sessionId: syncSessionId,
              },
            });
            return status(500, "Failed to set job status");
          }
          log.error(queueCSVSyncJobError, {
            step: "queueCSVSyncJob",
            outcome: "error",
            sync: {
              type: "csv",
              sessionId: syncSessionId,
            },
          });
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
          log.error(updateSessionError, {
            step: "updateSyncSession",
            outcome: "error",
            sync: {
              type: "csv",
              sessionId: syncSessionId,
            },
          });
          return status(500, "Failed to update sync session");
        }
      }

      log.set({
        outcome: "success",
        sync: {
          type: "csv",
          sessionId: syncSessionId,
          jobId: jobId ?? null,
        },
        items: {
          requested: body.length,
          existing: existingItemExternalIds.length,
          toInsert: collectionItems.length,
          queuedForScrape: itemsToScrape.length,
        },
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
    async ({ body, user, log }) => {
      if (!user) {
        log.set({ outcome: "unauthorized" });
        return status(401, "Unauthorized");
      }

      log.set({
        action: "sync.order",
        user: { id: user.id },
        sync: { type: "order" },
        items: { requested: body.items.length },
      });

      const orderId = createId();

      const itemExternalIds = body.items.map((item: OrderItemSyncType) => item.itemExternalId);

      const { data: existingItems, error: existingItemsError } = await tryCatch(
        SyncService.getExistingItemsByExternalIds(itemExternalIds),
      );

      if (existingItemsError) {
        log.error(existingItemsError, {
          step: "getExistingItems",
          outcome: "error",
          sync: { type: "order" },
        });
        return status(500, "Failed to check for existing items");
      }

      const existingItemIds = existingItems.map((existingItem) => existingItem.id);
      const { data: existingItemsWithReleases, error: existingItemsWithReleasesError } =
        await tryCatch(SyncService.getExistingItemsWithReleases(existingItemIds));

      if (existingItemsWithReleasesError) {
        log.error(existingItemsWithReleasesError, {
          step: "getExistingItemsWithReleases",
          outcome: "error",
          sync: { type: "order" },
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
          orderPayload: order,
          itemMetadata: orderItemMetadata,
          existingItemExternalIds: existingOrderItemExternalIds,
        }),
      );

      if (syncSessionError) {
        log.error(syncSessionError, {
          step: "createSyncSession",
          outcome: "error",
          sync: {
            type: "order",
            orderId,
          },
        });
        return status(500, "Failed to create sync session");
      }

      log.set({
        sync: {
          type: "order",
          sessionId: syncSessionId,
          orderId,
        },
        order: { id: orderId },
      });

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
          log.error(insertToCollectionAndOrdersError, {
            step: "insertToCollectionAndOrders",
            outcome: "error",
            sync: {
              type: "order",
              sessionId: syncSessionId,
              orderId,
            },
            order: { id: orderId },
          });
          return status(500, "Failed to insert to collection and orders");
        }

        const { error: updateOrderSyncSessionError } = await tryCatch(
          SyncService.updateSyncSession(syncSessionId, {
            orderId,
          }),
        );

        if (updateOrderSyncSessionError) {
          log.error(updateOrderSyncSessionError, {
            step: "updateSyncSessionOrderId",
            outcome: "error",
            sync: {
              type: "order",
              sessionId: syncSessionId,
              orderId,
            },
            order: { id: orderId },
          });
          return status(500, "Failed to update sync session");
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
            log.error(queueOrderSyncJobError, {
              step: "queueOrderSyncJob",
              outcome: "error",
              sync: {
                type: "order",
                sessionId: syncSessionId,
                orderId,
              },
              order: { id: orderId },
            });
            return status(500, "Failed to queue order sync job");
          }
          if (queueOrderSyncJobError.message === "FAILED_TO_SET_JOB_STATUS_IN_REDIS") {
            log.error(queueOrderSyncJobError, {
              step: "queueOrderSyncJob",
              outcome: "error",
              sync: {
                type: "order",
                sessionId: syncSessionId,
                orderId,
              },
              order: { id: orderId },
            });
            return status(500, "Failed to set job status");
          }
          log.error(queueOrderSyncJobError, {
            step: "queueOrderSyncJob",
            outcome: "error",
            sync: {
              type: "order",
              sessionId: syncSessionId,
              orderId,
            },
            order: { id: orderId },
          });
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
            log.error(updateSessionError, {
              step: "updateSyncSession",
              outcome: "error",
              sync: {
                type: "order",
                sessionId: syncSessionId,
                orderId,
              },
              order: { id: orderId },
            });
            return status(500, "Failed to update sync session");
          }
        }
      }

      log.set({
        outcome: "success",
        sync: {
          type: "order",
          sessionId: syncSessionId,
          jobId: jobId ?? null,
          orderId,
        },
        order: { id: orderId },
        items: {
          requested: body.items.length,
          existing: existingOrderItemExternalIds.length,
          toInsert: itemsToInsert.length,
          queuedForScrape: itemsToScrape.length,
        },
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
    async ({ body, user, log }) => {
      if (!user) {
        log.set({ outcome: "unauthorized" });
        return status(401, "Unauthorized");
      }

      log.set({
        action: "sync.collection",
        user: { id: user.id },
        sync: { type: "collection" },
        items: { requested: body.length },
      });

      const itemExternalIds = body.map((item: CollectionSyncType) => item.itemExternalId);

      const { data: existingItems, error: existingItemsError } = await tryCatch(
        SyncService.getExistingItemsByExternalIds(itemExternalIds),
      );

      if (existingItemsError) {
        log.error(existingItemsError, {
          step: "getExistingItems",
          outcome: "error",
          sync: { type: "collection" },
        });
        return status(500, "Failed to check for existing items");
      }

      const existingItemIds = existingItems.map((existingItem) => existingItem.id);
      const { data: existingItemsWithReleases, error: existingItemsWithReleasesError } =
        await tryCatch(SyncService.getExistingItemsWithReleases(existingItemIds));

      if (existingItemsWithReleasesError) {
        log.error(existingItemsWithReleasesError, {
          step: "getExistingItemsWithReleases",
          outcome: "error",
          sync: { type: "collection" },
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
        log.error(syncSessionError, {
          step: "createSyncSession",
          outcome: "error",
          sync: { type: "collection" },
        });
        return status(500, "Failed to create sync session");
      }

      log.set({
        sync: {
          type: "collection",
          sessionId: syncSessionId,
        },
      });

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
          log.error(insertToCollectionAndOrdersError, {
            step: "insertToCollectionAndOrders",
            outcome: "error",
            sync: {
              type: "collection",
              sessionId: syncSessionId,
            },
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
            log.error(queueCollectionSyncJobError, {
              step: "queueCollectionSyncJob",
              outcome: "error",
              sync: {
                type: "collection",
                sessionId: syncSessionId,
              },
            });
            return status(500, "Failed to queue collection sync job");
          }
          if (queueCollectionSyncJobError.message === "FAILED_TO_SET_JOB_STATUS_IN_REDIS") {
            log.error(queueCollectionSyncJobError, {
              step: "queueCollectionSyncJob",
              outcome: "error",
              sync: {
                type: "collection",
                sessionId: syncSessionId,
              },
            });
            return status(500, "Failed to set job status");
          }
          log.error(queueCollectionSyncJobError, {
            step: "queueCollectionSyncJob",
            outcome: "error",
            sync: {
              type: "collection",
              sessionId: syncSessionId,
            },
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
            log.error(updateSessionError, {
              step: "updateSyncSession",
              outcome: "error",
              sync: {
                type: "collection",
                sessionId: syncSessionId,
              },
            });
            return status(500, "Failed to update sync session");
          }
        }
      }

      log.set({
        outcome: "success",
        sync: {
          type: "collection",
          sessionId: syncSessionId,
          jobId: jobId ?? null,
        },
        items: {
          requested: body.length,
          existing: existingCollectionItemExternalIds.length,
          toInsert: itemsToInsert.length,
          queuedForScrape: itemsToScrape.length,
        },
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
    async ({ query, user, log }) => {
      if (!user) {
        log.set({ outcome: "unauthorized" });
        return status(401, "Unauthorized");
      }

      const page = query.page ? parseInt(query.page, 10) : 1;
      const limit = query.limit ? parseInt(query.limit, 10) : 20;

      log.set({
        action: "sync.sessions",
        user: { id: user.id },
        pagination: { page, limit },
        filters: {
          status: query.status ?? [],
          syncType: query.syncType ?? [],
        },
      });

      if (isNaN(page) || page < 1) {
        log.set({ outcome: "bad_request" });
        return status(400, "Invalid page parameter");
      }
      if (isNaN(limit) || limit < 1 || limit > 100) {
        log.set({ outcome: "bad_request" });
        return status(400, "Invalid limit parameter");
      }

      const { data: result, error } = await tryCatch(
        SyncService.getSyncSessions(user.id, page, limit, query.status, query.syncType),
      );

      if (error) {
        log.error(error, { step: "getSyncSessions", outcome: "error" });
        return status(500, "Failed to fetch sync sessions");
      }

      log.set({
        outcome: "success",
        result: {
          sessionCount: result.sessions.length,
          total: result.total,
        },
      });

      return { sessions: result.sessions, total: result.total, page, limit };
    },
    {
      query: z.object({
        page: z.string().optional(),
        limit: z.string().optional(),
        status: z
          .union([z.enum(SYNC_SESSION_STATUSES), z.array(z.enum(SYNC_SESSION_STATUSES))])
          .transform((v) => (Array.isArray(v) ? v : [v]))
          .optional(),
        syncType: z
          .union([z.enum(SYNC_TYPES), z.array(z.enum(SYNC_TYPES))])
          .transform((v) => (Array.isArray(v) ? v : [v]))
          .optional(),
      }),
      auth: true,
    },
  )
  .get(
    "/sessions/:id",
    async ({ params, query, user, log }) => {
      if (!user) {
        log.set({ outcome: "unauthorized" });
        return status(401, "Unauthorized");
      }

      log.set({
        action: "sync.sessionDetail",
        user: { id: user.id },
        sync: { sessionId: params.id },
      });

      const page = query.page ? parseInt(query.page, 10) : undefined;
      const limit = query.limit ? parseInt(query.limit, 10) : undefined;

      log.set({
        pagination: {
          page: page ?? null,
          limit: limit ?? null,
        },
      });

      if (page !== undefined && (isNaN(page) || page < 1)) {
        log.set({ outcome: "bad_request" });
        return status(400, "Invalid page parameter");
      }
      if (limit !== undefined && (isNaN(limit) || limit < 1 || limit > 100)) {
        log.set({ outcome: "bad_request" });
        return status(400, "Invalid limit parameter");
      }

      const { data: result, error } = await tryCatch(
        SyncService.getSyncSessionDetail(params.id, user.id, page, limit),
      );

      if (error) {
        log.error(error, {
          step: "getSyncSessionDetail",
          outcome: "error",
          sync: { sessionId: params.id },
        });
        return status(500, "Failed to fetch sync session detail");
      }

      if (!result) {
        log.set({ outcome: "not_found" });
        return status(404, "Sync session not found");
      }

      log.set({
        outcome: "success",
        result: {
          itemCount: result.items.length,
          totalItems: result.totalItems,
        },
      });

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
    async ({ body, user, log }) => {
      if (!user) {
        log.set({ outcome: "unauthorized" });
        return status(401, "Unauthorized");
      }

      log.set({
        action: "sync.retry",
        user: { id: user.id },
        sync: { sessionId: body.syncSessionId },
      });

      const { data: result, error } = await tryCatch(
        SyncService.retryFailedItems(body.syncSessionId, user.id),
      );

      if (error) {
        switch (error.message) {
          case "SYNC_SESSION_NOT_FOUND":
            log.set({ outcome: "not_found" });
            return status(404, "Sync session not found");
          case "NO_FAILED_ITEMS_TO_RETRY":
            log.set({ outcome: "conflict" });
            return status(409, "No failed items to retry");
          case "ORDER_NOT_FOUND_FOR_RETRY":
            log.set({ outcome: "not_found" });
            return status(404, "Original order not found, please re-submit the sync");
          default:
            log.error(error, {
              step: "retryFailedItems",
              outcome: "error",
              sync: { sessionId: body.syncSessionId },
            });
            return status(500, "Failed to retry failed items");
        }
      }

      log.set({
        outcome: "success",
        sync: {
          sessionId: body.syncSessionId,
          jobId: result.jobId,
        },
        items: {
          retried: result.itemCount,
        },
      });

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
    async function* ({ query, user, log, request }) {
      if (!user) {
        log.set({ outcome: "unauthorized" });
        return status(401, "Unauthorized");
      }

      log.set({
        action: "sync.jobStatus",
        user: { id: user.id },
        sync: { jobId: query.jobId },
      });

      const { jobId } = query;
      const startedAt = Date.now();
      const abortPromise = waitForAbort(request.signal);

      const { data: initialJobStatus, error: initialJobStatusError } = await tryCatch(
        SyncService.getJobStatus(jobId, user.id),
      );

      if (initialJobStatusError) {
        const message =
          initialJobStatusError.message === "SYNC_JOB_NOT_FOUND"
            ? "Job not found"
            : "Error fetching job status";

        if (initialJobStatusError.message === "SYNC_JOB_NOT_FOUND") {
          log.set({ outcome: "not_found" });
        } else {
          log.error(initialJobStatusError, { step: "getJobStatus", outcome: "error" });
        }

        yield toSseJobStatus(createTerminalJobStatus(message, "error"));
        return;
      }

      yield toSseJobStatus(initialJobStatus);

      if (initialJobStatus.finished) {
        log.set({
          outcome: initialJobStatus.terminalState === "success" ? "success" : "error",
          result: {
            terminalState: initialJobStatus.terminalState,
          },
        });
        return;
      }

      const { data: subscription, error: subscriptionError } = await tryCatch(
        jobStatusSubscriptionRegistry.subscribe(jobId),
      );

      if (subscriptionError) {
        log.error(subscriptionError, {
          step: "subscribeJobStatus",
          outcome: "error",
        });
        yield toSseJobStatus(
          createTerminalJobStatus(
            "Status stream connection lost — refresh to check latest status",
            "error",
          ),
        );
        return;
      }

      try {
        const { data: replayJobStatus, error: replayJobStatusError } = await tryCatch(
          SyncService.getJobStatus(jobId, user.id),
        );

        if (replayJobStatusError) {
          const message =
            replayJobStatusError.message === "SYNC_JOB_NOT_FOUND"
              ? "Job not found"
              : "Error fetching job status";

          if (replayJobStatusError.message === "SYNC_JOB_NOT_FOUND") {
            log.set({ outcome: "not_found" });
          } else {
            log.error(replayJobStatusError, { step: "getJobStatusReplay", outcome: "error" });
          }

          yield toSseJobStatus(createTerminalJobStatus(message, "error"));
          return;
        }

        if (!jobStatusesMatch(initialJobStatus, replayJobStatus)) {
          yield toSseJobStatus(replayJobStatus);
        }

        if (replayJobStatus.finished) {
          log.set({
            outcome: replayJobStatus.terminalState === "success" ? "success" : "error",
            result: {
              terminalState: replayJobStatus.terminalState,
            },
          });
          return;
        }

        while (true) {
          const remainingMs = MAX_JOB_STATUS_STREAM_DURATION_MS - (Date.now() - startedAt);

          if (remainingMs <= 0) {
            log.set({ outcome: "timeout" });
            yield toSseJobStatus(
              createTerminalJobStatus(
                "Status stream timed out — refresh to check latest status",
                "timeout",
              ),
            );
            return;
          }

          const nextEvent = await waitForNextJobStatusEvent(
            subscription,
            abortPromise,
            remainingMs,
          );

          if (nextEvent.kind === "aborted") {
            return;
          }

          if (nextEvent.kind === "timeout") {
            log.set({ outcome: "timeout" });
            yield toSseJobStatus(
              createTerminalJobStatus(
                "Status stream timed out — refresh to check latest status",
                "timeout",
              ),
            );
            return;
          }

          if (nextEvent.event.kind === "error") {
            if (!request.signal.aborted) {
              log.error(nextEvent.event.error, {
                step: "jobStatusSubscription",
                outcome: "error",
              });
              yield toSseJobStatus(
                createTerminalJobStatus(
                  "Status stream connection lost — refresh to check latest status",
                  "error",
                ),
              );
            }
            return;
          }

          yield toSseJobStatus(nextEvent.event.status);

          if (nextEvent.event.status.finished) {
            log.set({
              outcome: nextEvent.event.status.terminalState === "success" ? "success" : "error",
              result: {
                terminalState: nextEvent.event.status.terminalState,
              },
            });
            return;
          }
        }
      } finally {
        await subscription.unsubscribe();
      }
    },
    {
      query: z.object({ jobId: z.string().min(1) }),
      auth: true,
    },
  );

export default syncRouter;
