import { Elysia, status, sse } from "elysia";
import * as z from "zod";
import { betterAuth } from "@/middleware/better-auth";
import { evlog } from "evlog/elysia";
import { rateLimit } from "@/middleware/rate-limit";
import {
  itemSyncSchema,
  collectionSyncSchema,
  internalCsvItemSchema,
  orderSyncSchema,
  syncOrderItemsSchema,
} from "./model";
import type {
  JobData,
  SyncJobError,
  SyncTerminalState,
  UpdatedSyncCollection,
  UpdatedSyncOrder,
  UpdatedSyncOrderItem,
  QueuedCollectionItem,
} from "@myakiba/contracts/sync/schema";
import type { SyncJobStatus, SyncOrderItemInput } from "./model";
import { SYNC_STATUS_MESSAGES } from "@myakiba/contracts/sync/messages";
import { SYNC_SESSION_RETRY_WINDOW_DAYS } from "@myakiba/contracts/sync/constants";
import SyncService from "./service";
import { tryCatch } from "@myakiba/utils/result";
import {
  MAX_LIMIT,
  SYNC_SESSION_ITEM_STATUSES,
  SYNC_SESSION_STATUSES,
  SYNC_TYPES,
} from "@myakiba/contracts/shared/constants";
import { createId } from "@paralleldrive/cuid2";
import { jobStatusSubscriptionRegistry } from "@/lib/job-status-subscription-registry";
import {
  MAX_JOB_STATUS_STREAM_DURATION_MS,
  waitForNextJobStatusEvent,
} from "@/lib/job-status-stream";
import { prepareCsvItems } from "./csv";

const createTerminalJobStatus = ({
  jobId,
  startedAt,
  error,
  terminalState,
}: {
  readonly jobId: string;
  readonly startedAt: string;
  readonly error: SyncJobError;
  readonly terminalState: SyncTerminalState;
}): SyncJobStatus => ({
  jobId,
  phase: "failed",
  statusMessage: error.message,
  progress: null,
  recentItems: [],
  error,
  startedAt,
  updatedAt: new Date().toISOString(),
  terminalState,
});

type ExistingItemsWithLatestRelease = Awaited<
  ReturnType<typeof SyncService.getExistingItemsWithLatestReleaseByExternalIds>
>;

const buildExistingItemLookups = (existingItems: ExistingItemsWithLatestRelease) => {
  const externalIdToInternalId = new Map<number, string>();
  const releaseIdsByItemId = new Map<string, string>();
  const releaseDatesByItemId = new Map<string, string>();

  for (const existingItem of existingItems) {
    externalIdToInternalId.set(existingItem.externalId, existingItem.id);

    if (existingItem.releaseId) {
      releaseIdsByItemId.set(existingItem.id, existingItem.releaseId);
    }

    if (existingItem.releaseDate) {
      releaseDatesByItemId.set(existingItem.id, existingItem.releaseDate);
    }
  }

  return {
    externalIdToInternalId,
    releaseIdsByItemId,
    releaseDatesByItemId,
  };
};

const syncRouter = new Elysia({ prefix: "/sync" })
  .use(betterAuth)
  .use(evlog())
  .use(rateLimit)
  .post(
    "/item",
    async ({ body, user, log }) => {
      log.set({ action: "sync.item", user: { id: user.id }, sync: { type: "item" } });
      if (!user.emailVerified) {
        log.set({ outcome: "forbidden", sync: { reason: "email_not_verified" } });
        return status(403, SYNC_STATUS_MESSAGES.requireEmailVerification);
      }

      const { data: existingItems, error: lookupError } = await tryCatch(
        SyncService.getExistingItemsWithLatestReleaseByExternalIds(body.items),
      );
      if (lookupError) {
        log.error(lookupError, { step: "getExistingItems", outcome: "error" });
        return status(500, "Failed to check for existing items");
      }
      const existingIds = new Set(existingItems.map((item) => item.externalId));
      const missingIds = body.items.filter((id) => !existingIds.has(id));
      const { data: syncSessionId, error: sessionError } = await tryCatch(
        SyncService.createSyncSession(user.id, "item", body.items, {
          existingItemExternalIds: body.items.filter((id) => existingIds.has(id)),
        }),
      );
      if (sessionError) {
        log.error(sessionError, { step: "createSyncSession", outcome: "error" });
        return status(500, "Failed to create import record");
      }

      log.set({
        sync: { sessionId: syncSessionId },
        items: {
          requested: body.items.length,
          existing: existingIds.size,
          queuedForScrape: missingIds.length,
        },
      });
      const statusMessage =
        missingIds.length > 0
          ? SYNC_STATUS_MESSAGES.queued
          : "These items are already in the item database.";
      const { error: startError } = await tryCatch<string | boolean>(
        missingIds.length > 0
          ? SyncService.queueSyncJob({
              type: "item",
              payloadVersion: 3,
              userId: user.id,
              syncSessionId,
              itemExternalIds: missingIds,
            })
          : SyncService.updateSyncSession(syncSessionId, {
              status: "completed",
              statusMessage,
              completedAt: new Date(),
            }),
      );
      if (startError) {
        log.error(startError, { step: "startItemSync", outcome: "error" });
        return status(
          500,
          missingIds.length > 0
            ? "Failed to queue item database items"
            : "Failed to update import record",
        );
      }
      log.set({ outcome: "success" });
      return {
        status: statusMessage,
        isFinished: missingIds.length === 0,
        existingItemsToInsert: existingIds.size,
        newItems: missingIds.length,
        jobId: missingIds.length > 0 ? syncSessionId : null,
        syncSessionId,
      };
    },
    { body: itemSyncSchema, auth: true, rateLimit: "item" },
  )
  .post(
    "/csv",
    async ({ body, user, log }) => {
      if (!user.emailVerified) {
        log.set({
          action: "sync.csv",
          outcome: "forbidden",
          user: { id: user.id },
          sync: { type: "csv", reason: "email_not_verified" },
        });
        return status(403, SYNC_STATUS_MESSAGES.requireEmailVerification);
      }

      log.set({
        action: "sync.csv",
        user: { id: user.id },
        sync: { type: "csv" },
        items: { requested: body.length },
      });

      const items = body.map((item) => ({
        ...item,
        collectionId: createId(),
        orderId: item.status === "Ordered" ? createId() : item.orderId,
      }));

      const itemExternalIds = items.map((item) => item.itemExternalId);
      const { data: existingItems, error: existingItemsError } = await tryCatch(
        SyncService.getExistingItemsWithLatestReleaseByExternalIds(itemExternalIds),
      );

      if (existingItemsError) {
        log.error(existingItemsError, {
          step: "getExistingItemsWithLatestRelease",
          outcome: "error",
          sync: { type: "csv" },
        });
        return status(500, "Failed to check for existing items");
      }

      const result = prepareCsvItems(items, existingItems, user.id);
      const {
        collectionItems,
        orderItems,
        csvItemsToScrape: itemsToScrape,
        existingItemExternalIds,
      } = result;

      const itemExternalIdsToTrack = itemsToScrape.map((i) => i.itemExternalId);

      const { data: syncSessionId, error: syncSessionError } = await tryCatch(
        SyncService.createSyncSession(user.id, "csv", itemExternalIdsToTrack, {
          existingItemExternalIds,
        }),
      );

      if (syncSessionError) {
        log.error(syncSessionError, {
          step: "createSyncSession",
          outcome: "error",
          sync: { type: "csv" },
        });
        return status(500, "Failed to create import record");
      }

      log.set({
        sync: {
          type: "csv",
          sessionId: syncSessionId,
        },
      });

      const jobData = {
        type: "csv",
        payloadVersion: 3,
        userId: user.id,
        syncSessionId,
        items: itemsToScrape,
        itemsToInsert: collectionItems,
        ordersToInsert: orderItems,
      } satisfies JobData;

      let jobId: string | null = null;

      if (itemsToScrape.length === 0) {
        const { error: insertToCollectionAndOrdersError } = await tryCatch(
          SyncService.completeSyncSessionWithoutWorker({
            collectionItems,
            orderItems,
            requestPayload: jobData,
            syncSessionId,
          }),
        );

        if (insertToCollectionAndOrdersError) {
          log.error(insertToCollectionAndOrdersError, {
            step: "insertToCollectionAndOrders",
            outcome: "error",
            sync: {
              type: "csv",
              sessionId: syncSessionId,
            },
          });
          return status(500, "Failed to save collection items and orders");
        }
      } else {
        const { data: jobIdData, error: queueCSVSyncJobError } = await tryCatch(
          SyncService.queueSyncJob(jobData),
        );

        if (queueCSVSyncJobError) {
          log.error(queueCSVSyncJobError, {
            step: "queueCSVSyncJob",
            outcome: "error",
            sync: {
              type: "csv",
              sessionId: syncSessionId,
            },
          });
          return status(500, "Failed to queue MyFigureCollection CSV import");
        }

        jobId = jobIdData;
      }

      const statusMessage: string = jobId
        ? SYNC_STATUS_MESSAGES.queued
        : SYNC_STATUS_MESSAGES.insertedWithoutScrape;

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
        isFinished: !jobId,
        existingItemsToInsert: collectionItems.length,
        newItems: itemsToScrape.length,
        jobId,
        syncSessionId,
      };
    },
    {
      body: z.array(internalCsvItemSchema.omit({ collectionId: true })).min(1),
      auth: true,
      rateLimit: "csv",
    },
  )
  .post(
    "/order",
    async ({ body, user, log }) => {
      if (!user.emailVerified) {
        log.set({
          action: "sync.order",
          outcome: "forbidden",
          user: { id: user.id },
          sync: { type: "order", reason: "email_not_verified" },
        });
        return status(403, SYNC_STATUS_MESSAGES.requireEmailVerification);
      }

      log.set({
        action: "sync.order",
        user: { id: user.id },
        sync: { type: "order" },
        items: { requested: body.items.length },
      });

      const orderId = createId();

      const normalizedItems = body.items.map((item: SyncOrderItemInput) => ({
        ...item,
        collectionId: createId(),
      }));
      const itemExternalIds = normalizedItems.map((item) => item.itemExternalId);

      const { data: existingItems, error: existingItemsError } = await tryCatch(
        SyncService.getExistingItemsWithLatestReleaseByExternalIds(itemExternalIds),
      );

      if (existingItemsError) {
        log.error(existingItemsError, {
          step: "getExistingItemsWithLatestRelease",
          outcome: "error",
          sync: { type: "order" },
        });
        return status(500, "Failed to check for existing items");
      }

      const { externalIdToInternalId, releaseIdsByItemId, releaseDatesByItemId } =
        buildExistingItemLookups(existingItems);

      const releaseDates = normalizedItems.flatMap((item) => {
        const internalId = externalIdToInternalId.get(item.itemExternalId);
        if (!internalId) return [];
        const date = releaseDatesByItemId.get(internalId);
        return date ? [date] : [];
      });
      if (body.releaseDate) releaseDates.push(body.releaseDate);

      const latestReleaseDate =
        releaseDates.length > 0
          ? releaseDates.reduce((latest, current) => (current > latest ? current : latest))
          : null;

      // oxlint-disable-next-line no-unused-vars
      const { items, ...orderData } = body;
      const order: UpdatedSyncOrder = {
        ...orderData,
        userId: user.id,
        id: orderId,
        releaseDate: latestReleaseDate,
      };

      const itemsToScrape: UpdatedSyncOrderItem[] = normalizedItems
        .filter((item) => !externalIdToInternalId.has(item.itemExternalId))
        .map((item) => ({
          ...item,
          itemId: null,
          orderId,
          releaseId: null,
          userId: user.id,
        }));

      const itemsToInsert: UpdatedSyncOrderItem[] = normalizedItems.flatMap((item) => {
        const internalItemId = externalIdToInternalId.get(item.itemExternalId);
        if (!internalItemId) {
          return [];
        }
        return [
          {
            ...item,
            itemId: internalItemId,
            orderId,
            releaseId: releaseIdsByItemId.get(internalItemId) ?? null,
            userId: user.id,
          },
        ];
      });

      const orderItemExternalIdsToTrack = itemsToScrape.map((i) => i.itemExternalId);
      const existingOrderItemExternalIds = itemsToInsert.map((i) => i.itemExternalId);
      const collectionItemsToInsert: QueuedCollectionItem[] = itemsToInsert
        .filter((item): item is UpdatedSyncOrderItem & { itemId: string } => item.itemId !== null)
        .map((item) => ({
          id: item.collectionId,
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
        return status(500, "Failed to create import record");
      }

      log.set({
        sync: {
          type: "order",
          sessionId: syncSessionId,
          orderId,
        },
        order: { id: orderId },
      });

      const jobData = {
        type: "order",
        payloadVersion: 3,
        userId: user.id,
        syncSessionId,
        order: {
          details: order,
          itemsToScrape,
          itemsToInsert: collectionItemsToInsert,
        },
      } satisfies JobData;

      if (itemsToScrape.length === 0) {
        const { error: insertToCollectionAndOrdersError } = await tryCatch(
          SyncService.completeSyncSessionWithoutWorker({
            collectionItems: collectionItemsToInsert,
            orderItems: [order],
            requestPayload: jobData,
            syncSessionId,
          }),
        );

        if (insertToCollectionAndOrdersError) {
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
          return status(500, "Failed to save the order and its items");
        }
      }

      let jobId: string | null = null;
      if (itemsToScrape.length > 0) {
        const { data: jobIdData, error: queueOrderSyncJobError } = await tryCatch(
          SyncService.queueSyncJob(jobData),
        );

        if (queueOrderSyncJobError) {
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
          return status(500, "Failed to queue order creation");
        }
        jobId = jobIdData;
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

      const statusMessage = jobId
        ? SYNC_STATUS_MESSAGES.queued
        : SYNC_STATUS_MESSAGES.insertedWithoutScrape;

      return {
        status: statusMessage,
        isFinished: !jobId,
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
    "/order-item",
    async ({ body, user, log }) => {
      if (!user.emailVerified) {
        log.set({
          action: "sync.orderItem",
          outcome: "forbidden",
          user: { id: user.id },
          sync: { type: "order-item", orderId: body.orderId, reason: "email_not_verified" },
        });
        return status(403, SYNC_STATUS_MESSAGES.requireEmailVerification);
      }

      log.set({
        action: "sync.orderItem",
        user: { id: user.id },
        sync: { type: "order-item", orderId: body.orderId },
        items: { requested: body.items.length },
      });

      const { data: existingOrder, error: existingOrderError } = await tryCatch(
        SyncService.getOrderByIdForUser(body.orderId, user.id),
      );

      if (existingOrderError) {
        log.error(existingOrderError, {
          step: "getOrderByIdForUser",
          outcome: "error",
          sync: { type: "order-item", orderId: body.orderId },
        });
        return status(500, "Failed to load order");
      }

      if (!existingOrder) {
        log.set({ outcome: "not_found" });
        return status(404, "Order not found");
      }

      const orderDetails: UpdatedSyncOrder = {
        id: existingOrder.id,
        userId: existingOrder.userId,
        status: existingOrder.status,
        title: existingOrder.title,
        shop: existingOrder.shop,
        orderDate: existingOrder.orderDate,
        releaseDate: existingOrder.releaseDate,
        paymentDate: existingOrder.paymentDate,
        shippingDate: existingOrder.shippingDate,
        collectionDate: existingOrder.collectionDate,
        shippingMethod: existingOrder.shippingMethod,
        shippingFee: existingOrder.shippingFee,
        taxes: existingOrder.taxes,
        duties: existingOrder.duties,
        tariffs: existingOrder.tariffs,
        miscFees: existingOrder.miscFees,
        notes: existingOrder.notes,
      };

      const normalizedItems = body.items.map((item: SyncOrderItemInput) => ({
        ...item,
        collectionId: createId(),
      }));
      const itemExternalIds = normalizedItems.map((item) => item.itemExternalId);

      const { data: existingItems, error: existingItemsError } = await tryCatch(
        SyncService.getExistingItemsWithLatestReleaseByExternalIds(itemExternalIds),
      );

      if (existingItemsError) {
        log.error(existingItemsError, {
          step: "getExistingItemsWithLatestRelease",
          outcome: "error",
          sync: { type: "order-item", orderId: body.orderId },
        });
        return status(500, "Failed to check for existing items");
      }

      const { externalIdToInternalId, releaseIdsByItemId } =
        buildExistingItemLookups(existingItems);

      const itemsToScrape: UpdatedSyncOrderItem[] = normalizedItems
        .filter((item) => !externalIdToInternalId.has(item.itemExternalId))
        .map((item) => ({
          ...item,
          itemId: null,
          orderId: existingOrder.id,
          releaseId: null,
          userId: user.id,
        }));

      const itemsToInsert: UpdatedSyncOrderItem[] = normalizedItems.flatMap((item) => {
        const internalItemId = externalIdToInternalId.get(item.itemExternalId);
        if (!internalItemId) {
          return [];
        }
        return [
          {
            ...item,
            itemId: internalItemId,
            orderId: existingOrder.id,
            releaseId: releaseIdsByItemId.get(internalItemId) ?? null,
            userId: user.id,
          },
        ];
      });

      const orderItemExternalIdsToTrack = itemsToScrape.map((item) => item.itemExternalId);
      const existingOrderItemExternalIds = itemsToInsert.map((item) => item.itemExternalId);
      const collectionItemsToInsert: QueuedCollectionItem[] = itemsToInsert
        .filter((item): item is UpdatedSyncOrderItem & { itemId: string } => item.itemId !== null)
        .map((item) => ({
          id: item.collectionId,
          userId: item.userId,
          itemId: item.itemId,
          orderId: item.orderId,
          status: item.status,
          count: item.count,
          score: "0.0",
          price: item.price,
          shop: orderDetails.shop,
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
        SyncService.createSyncSession(user.id, "order-item", orderItemExternalIdsToTrack, {
          orderId: existingOrder.id,
          existingItemExternalIds: existingOrderItemExternalIds,
        }),
      );

      if (syncSessionError) {
        log.error(syncSessionError, {
          step: "createSyncSession",
          outcome: "error",
          sync: {
            type: "order-item",
            orderId: existingOrder.id,
          },
        });
        return status(500, "Failed to create import record");
      }

      log.set({
        sync: {
          type: "order-item",
          sessionId: syncSessionId,
          orderId: existingOrder.id,
        },
        order: { id: existingOrder.id },
      });

      const jobData = {
        type: "order-item",
        payloadVersion: 3,
        userId: user.id,
        syncSessionId,
        order: {
          details: orderDetails,
          itemsToScrape,
          itemsToInsert: collectionItemsToInsert,
        },
      } satisfies JobData;

      if (itemsToScrape.length === 0) {
        const { error: insertOrderItemsError } = await tryCatch(
          SyncService.completeSyncSessionWithoutWorker({
            collectionItems: collectionItemsToInsert,
            requestPayload: jobData,
            syncSessionId,
          }),
        );

        if (insertOrderItemsError) {
          log.error(insertOrderItemsError, {
            step: "insertOrderItems",
            outcome: "error",
            sync: {
              type: "order-item",
              sessionId: syncSessionId,
              orderId: existingOrder.id,
            },
            order: { id: existingOrder.id },
          });
          return status(500, "Failed to save order items");
        }
      }

      let jobId: string | null = null;
      if (itemsToScrape.length > 0) {
        const { data: jobIdData, error: queueOrderItemSyncJobError } = await tryCatch(
          SyncService.queueSyncJob(jobData),
        );

        if (queueOrderItemSyncJobError) {
          log.error(queueOrderItemSyncJobError, {
            step: "queueOrderItemSyncJob",
            outcome: "error",
            sync: {
              type: "order-item",
              sessionId: syncSessionId,
              orderId: existingOrder.id,
            },
            order: { id: existingOrder.id },
          });
          return status(500, "Failed to queue order items");
        }
        jobId = jobIdData;
      }

      log.set({
        outcome: "success",
        sync: {
          type: "order-item",
          sessionId: syncSessionId,
          jobId: jobId ?? null,
          orderId: existingOrder.id,
        },
        order: { id: existingOrder.id },
        items: {
          requested: body.items.length,
          existing: existingOrderItemExternalIds.length,
          toInsert: itemsToInsert.length,
          queuedForScrape: itemsToScrape.length,
        },
      });

      const statusMessage = jobId
        ? SYNC_STATUS_MESSAGES.queued
        : SYNC_STATUS_MESSAGES.insertedWithoutScrape;

      return {
        status: statusMessage,
        isFinished: !jobId,
        existingItemsToInsert: itemsToInsert.length,
        newItems: itemsToScrape.length,
        jobId,
        syncSessionId,
      };
    },
    {
      body: syncOrderItemsSchema,
      auth: true,
      rateLimit: "order",
    },
  )
  .post(
    "/collection",
    async ({ body, user, log }) => {
      if (!user.emailVerified) {
        log.set({
          action: "sync.collection",
          outcome: "forbidden",
          user: { id: user.id },
          sync: { type: "collection", reason: "email_not_verified" },
        });
        return status(403, SYNC_STATUS_MESSAGES.requireEmailVerification);
      }

      log.set({
        action: "sync.collection",
        user: { id: user.id },
        sync: { type: "collection" },
        items: { requested: body.length },
      });

      const normalizedItems = body.map((item) => ({
        ...item,
        collectionId: createId(),
      }));
      const itemExternalIds = normalizedItems.map((item) => item.itemExternalId);

      const { data: existingItems, error: existingItemsError } = await tryCatch(
        SyncService.getExistingItemsWithLatestReleaseByExternalIds(itemExternalIds),
      );

      if (existingItemsError) {
        log.error(existingItemsError, {
          step: "getExistingItemsWithLatestRelease",
          outcome: "error",
          sync: { type: "collection" },
        });
        return status(500, "Failed to check for existing items");
      }

      const { externalIdToInternalId, releaseIdsByItemId } =
        buildExistingItemLookups(existingItems);

      const itemsToScrape: UpdatedSyncCollection[] = normalizedItems
        .filter((item) => !externalIdToInternalId.has(item.itemExternalId))
        .map((item) => ({
          ...item,
          itemId: null,
          releaseId: null,
          userId: user.id,
        }));

      const itemsToInsert: UpdatedSyncCollection[] = normalizedItems.flatMap((item) => {
        const internalItemId = externalIdToInternalId.get(item.itemExternalId);
        if (!internalItemId) {
          return [];
        }
        return [
          {
            ...item,
            itemId: internalItemId,
            releaseId: releaseIdsByItemId.get(internalItemId) ?? null,
            userId: user.id,
          },
        ];
      });

      const collectionItemExternalIdsToTrack = itemsToScrape.map((i) => i.itemExternalId);
      const existingCollectionItemExternalIds = itemsToInsert.map((i) => i.itemExternalId);
      const collectionItemsToInsert: QueuedCollectionItem[] = itemsToInsert
        .filter((item): item is UpdatedSyncCollection & { itemId: string } => item.itemId !== null)
        .map((item) => ({
          id: item.collectionId,
          userId: item.userId,
          itemId: item.itemId,
          releaseId: item.releaseId,
          orderId: null,
          status: "Owned",
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
          existingItemExternalIds: existingCollectionItemExternalIds,
        }),
      );

      if (syncSessionError) {
        log.error(syncSessionError, {
          step: "createSyncSession",
          outcome: "error",
          sync: { type: "collection" },
        });
        return status(500, "Failed to create import record");
      }

      log.set({
        sync: {
          type: "collection",
          sessionId: syncSessionId,
        },
      });

      const jobData = {
        type: "collection",
        payloadVersion: 3,
        userId: user.id,
        syncSessionId,
        collection: {
          itemsToScrape,
          itemsToInsert: collectionItemsToInsert,
        },
      } satisfies JobData;

      if (itemsToScrape.length === 0) {
        const { error: insertToCollectionAndOrdersError } = await tryCatch(
          SyncService.completeSyncSessionWithoutWorker({
            collectionItems: collectionItemsToInsert,
            requestPayload: jobData,
            syncSessionId,
          }),
        );

        if (insertToCollectionAndOrdersError) {
          log.error(insertToCollectionAndOrdersError, {
            step: "insertToCollectionAndOrders",
            outcome: "error",
            sync: {
              type: "collection",
              sessionId: syncSessionId,
            },
          });
          return status(500, "Failed to save collection items");
        }
      }

      let jobId: string | null = null;
      if (itemsToScrape.length > 0) {
        const { data: jobIdData, error: queueCollectionSyncJobError } = await tryCatch(
          SyncService.queueSyncJob(jobData),
        );

        if (queueCollectionSyncJobError) {
          log.error(queueCollectionSyncJobError, {
            step: "queueCollectionSyncJob",
            outcome: "error",
            sync: {
              type: "collection",
              sessionId: syncSessionId,
            },
          });
          return status(500, "Failed to queue collection items");
        }
        jobId = jobIdData;
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

      const statusMessage = jobId
        ? SYNC_STATUS_MESSAGES.queued
        : SYNC_STATUS_MESSAGES.insertedWithoutScrape;

      return {
        status: statusMessage,
        isFinished: !jobId,
        existingItemsToInsert: itemsToInsert.length,
        newItems: itemsToScrape.length,
        jobId,
        syncSessionId,
      };
    },
    {
      body: z.array(collectionSyncSchema.omit({ collectionId: true })).min(1),
      auth: true,
      rateLimit: "collection",
    },
  )
  .get(
    "/sessions",
    async ({ query, user, log }) => {
      const page = query.page ? Number.parseInt(query.page, 10) : 1;
      const limit = query.limit ? Number.parseInt(query.limit, 10) : 20;

      log.set({
        action: "sync.sessions",
        user: { id: user.id },
        pagination: { page, limit },
        filters: {
          status: query.status ?? [],
          syncType: query.syncType ?? [],
        },
      });

      if (Number.isNaN(page) || page < 1) {
        log.set({ outcome: "bad_request" });
        return status(400, "Invalid page parameter");
      }
      if (Number.isNaN(limit) || limit < 1 || limit > MAX_LIMIT) {
        log.set({ outcome: "bad_request" });
        return status(400, "Invalid limit parameter");
      }

      const { data: result, error } = await tryCatch(
        SyncService.getSyncSessions(user.id, page, limit, query.status, query.syncType),
      );

      if (error) {
        log.error(error, { step: "getSyncSessions", outcome: "error" });
        return status(500, "Failed to load import history");
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
      log.set({
        action: "sync.sessionDetail",
        user: { id: user.id },
        sync: { sessionId: params.id },
        filters: {
          status: query.status ?? [],
        },
      });

      const page = query.page ? Number.parseInt(query.page, 10) : undefined;
      const limit = query.limit ? Number.parseInt(query.limit, 10) : undefined;

      log.set({
        pagination: {
          page: page ?? null,
          limit: limit ?? null,
        },
      });

      if (page !== undefined && (Number.isNaN(page) || page < 1)) {
        log.set({ outcome: "bad_request" });
        return status(400, "Invalid page parameter");
      }
      if (limit !== undefined && (Number.isNaN(limit) || limit < 1 || limit > MAX_LIMIT)) {
        log.set({ outcome: "bad_request" });
        return status(400, "Invalid limit parameter");
      }

      const { data: result, error } = await tryCatch(
        SyncService.getSyncSessionDetail(params.id, user.id, page, limit, query.status),
      );

      if (error) {
        log.error(error, {
          step: "getSyncSessionDetail",
          outcome: "error",
          sync: { sessionId: params.id },
        });
        return status(500, "Failed to load import details");
      }

      if (!result) {
        log.set({ outcome: "not_found" });
        return status(404, "Import not found");
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
        status: z
          .union([z.enum(SYNC_SESSION_ITEM_STATUSES), z.array(z.enum(SYNC_SESSION_ITEM_STATUSES))])
          .transform((value) => (Array.isArray(value) ? value : [value]))
          .optional(),
      }),
      auth: true,
    },
  )
  .post(
    "/sessions/:id/retry",
    async ({ params, user, log }) => {
      log.set({
        action: "sync.retry",
        user: { id: user.id },
        sync: { sessionId: params.id },
      });

      if (!user.emailVerified) {
        log.set({ outcome: "forbidden", sync: { reason: "email_not_verified" } });
        return status(403, SYNC_STATUS_MESSAGES.requireEmailVerification);
      }

      const { data: result, error } = await tryCatch(
        SyncService.retrySyncSession(params.id, user.id),
      );
      if (error) {
        log.error(error, { step: "retrySyncSession", outcome: "error" });
        return status(500, "Failed to retry failed item results");
      }

      if (result.outcome === "not_found") {
        log.set({ outcome: "not_found" });
        return status(404, "Import not found");
      }
      if (result.outcome === "expired") {
        log.set({ outcome: "expired" });
        return status(
          409,
          `The ${SYNC_SESSION_RETRY_WINDOW_DAYS}-day window to retry failed item results has expired`,
        );
      }
      if (result.outcome === "unavailable") {
        log.set({ outcome: "conflict" });
        return status(409, "These failed item results cannot be retried");
      }

      log.set({
        outcome: "success",
        sync: {
          jobId: result.jobId,
        },
      });
      return { jobId: result.jobId };
    },
    {
      params: z.object({ id: z.string() }),
      auth: true,
      rateLimit: "retry",
    },
  )
  .get(
    "/job-status",
    async function* ({ query, user, log, request }) {
      log.set({
        action: "sync.jobStatus",
        user: { id: user.id },
        sync: { jobId: query.jobId },
      });

      const { jobId } = query;
      const streamStartedAt = Date.now();
      const streamStartedAtIso = new Date(streamStartedAt).toISOString();
      const abortPromise = request.signal.aborted
        ? Promise.resolve<"aborted">("aborted")
        : new Promise<"aborted">((resolve) => {
            request.signal.addEventListener("abort", () => resolve("aborted"), { once: true });
          });

      const logTerminalOutcome = (terminalState: SyncTerminalState): void => {
        log.set({
          outcome: terminalState,
          result: { terminalState },
        });
      };

      const { data: initialJobStatus, error: initialJobStatusError } = await tryCatch(
        SyncService.getJobStatus(jobId, user.id),
      );

      if (initialJobStatusError) {
        const isNotFound = initialJobStatusError.message === "SYNC_JOB_NOT_FOUND";
        const message = isNotFound ? "Job not found" : "Error fetching job status";

        if (isNotFound) {
          log.set({ outcome: "not_found" });
        } else {
          log.error(initialJobStatusError, { step: "getJobStatus", outcome: "error" });
        }

        yield sse({
          data: createTerminalJobStatus({
            jobId,
            startedAt: streamStartedAtIso,
            error: { code: "unknown", message },
            terminalState: "error",
          }),
        });
        return;
      }

      yield sse({
        data: initialJobStatus,
      });

      if (initialJobStatus.terminalState !== null) {
        logTerminalOutcome(initialJobStatus.terminalState);
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
        yield sse({
          data: createTerminalJobStatus({
            jobId,
            startedAt: initialJobStatus.startedAt,
            error: {
              code: "connection_lost",
              message: SYNC_STATUS_MESSAGES.streamError,
            },
            terminalState: "error",
          }),
        });
        return;
      }

      try {
        const { data: replayJobStatus, error: replayJobStatusError } = await tryCatch(
          SyncService.getJobStatus(jobId, user.id),
        );

        if (replayJobStatusError) {
          const isNotFound = replayJobStatusError.message === "SYNC_JOB_NOT_FOUND";
          const message = isNotFound ? "Job not found" : "Error fetching job status";

          if (isNotFound) {
            log.set({ outcome: "not_found" });
          } else {
            log.error(replayJobStatusError, { step: "getJobStatusReplay", outcome: "error" });
          }

          yield sse({
            data: createTerminalJobStatus({
              jobId,
              startedAt: initialJobStatus.startedAt,
              error: { code: "unknown", message },
              terminalState: "error",
            }),
          });
          return;
        }

        if (
          initialJobStatus.phase !== replayJobStatus.phase ||
          initialJobStatus.statusMessage !== replayJobStatus.statusMessage ||
          initialJobStatus.updatedAt !== replayJobStatus.updatedAt ||
          initialJobStatus.terminalState !== replayJobStatus.terminalState
        ) {
          yield sse({
            data: replayJobStatus,
          });
        }

        if (replayJobStatus.terminalState !== null) {
          logTerminalOutcome(replayJobStatus.terminalState);
          return;
        }

        let latestJobStatus = replayJobStatus;
        let subscriptionEventPromise = subscription.next();

        while (true) {
          const remainingMs = MAX_JOB_STATUS_STREAM_DURATION_MS - (Date.now() - streamStartedAt);

          if (remainingMs <= 0) {
            log.set({ outcome: "timeout" });
            yield sse({
              data: createTerminalJobStatus({
                jobId,
                startedAt: initialJobStatus.startedAt,
                error: {
                  code: "timeout",
                  message: SYNC_STATUS_MESSAGES.streamTimeout,
                },
                terminalState: "timeout",
              }),
            });
            return;
          }

          const nextEvent = await waitForNextJobStatusEvent({
            subscriptionEventPromise,
            abortPromise,
            remainingMs,
          });

          if (nextEvent.kind === "aborted") {
            return;
          }

          if (nextEvent.kind === "timeout") {
            log.set({ outcome: "timeout" });
            yield sse({
              data: createTerminalJobStatus({
                jobId,
                startedAt: initialJobStatus.startedAt,
                error: {
                  code: "timeout",
                  message: SYNC_STATUS_MESSAGES.streamTimeout,
                },
                terminalState: "timeout",
              }),
            });
            return;
          }

          if (nextEvent.kind === "heartbeat") {
            yield sse({
              data: latestJobStatus,
            });
            continue;
          }

          if (nextEvent.event.kind === "error") {
            if (!request.signal.aborted) {
              log.error(nextEvent.event.error, {
                step: "jobStatusSubscription",
                outcome: "error",
              });
              yield sse({
                data: createTerminalJobStatus({
                  jobId,
                  startedAt: initialJobStatus.startedAt,
                  error: {
                    code: "connection_lost",
                    message: SYNC_STATUS_MESSAGES.streamError,
                  },
                  terminalState: "error",
                }),
              });
            }
            return;
          }

          latestJobStatus = nextEvent.event.status;
          yield sse({
            data: latestJobStatus,
          });

          if (latestJobStatus.terminalState !== null) {
            logTerminalOutcome(latestJobStatus.terminalState);
            return;
          }

          subscriptionEventPromise = subscription.next();
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
