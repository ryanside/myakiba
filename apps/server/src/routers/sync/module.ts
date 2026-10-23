import { prepareMfcItem } from "@/lib/mfc-item-ingest";
import { SYNC_SESSION_RETRY_WINDOW_DAYS } from "@myakiba/contracts/sync/constants";
import {
  completeSyncItem,
  failSyncItem,
  heartbeatSyncRun,
  interruptSyncRun,
  retrySyncRun,
  retryOrderLock,
  OrderAbsentError,
  syncItemStatus,
  failRunWithoutOrder,
  recordItemFailures,
} from "./run";
import type { CompleteSyncItemResult } from "./run";
import { createId } from "@paralleldrive/cuid2";
import { command, fail, failAfterCommit, ok, proceed, query } from "@/domain/kernel";
import type {
  JobData,
  UpdatedSyncCollection,
  UpdatedSyncOrder,
  UpdatedSyncOrderItem,
  QueuedCollectionItem,
} from "@myakiba/contracts/sync/schema";
import { SYNC_STATUS_MESSAGES } from "@myakiba/contracts/sync/messages";
import { MAX_LIMIT } from "@myakiba/contracts/shared/constants";
import type {
  SyncSessionStatus,
  SyncSessionItemStatus,
  SyncType,
} from "@myakiba/contracts/shared/types";
import type {
  SyncItemUpload,
  SyncItemFailure,
  InternalCsvItem,
  OrderSyncType,
  CollectionSyncType,
  SyncOrderItemsInput,
  SyncOrderItemInput,
} from "./model";
import SyncService from "./service";
import type { SyncSessionCreation } from "./service";
import type { ItemRows } from "./item-rows";
import { idsToFetch } from "./item-rows";
import { prepareCsvItems } from "./csv";

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

type PlannedSync = {
  readonly session: SyncSessionCreation;
  readonly requestPayload: JobData;
  readonly rows: ItemRows;
};

const failedStart = command(
  { action: "sync.failedStart", failure: "Failed to save import history" },
  async (
    scope,
    input: Pick<PlannedSync, "session" | "requestPayload"> & {
      readonly failure: "before_start" | "request_persistence";
    },
  ) => {
    await SyncService.recordFailedStart(
      scope.tx,
      input.session,
      input.requestPayload,
      input.failure,
    );
    return ok(null);
  },
);

function startOperation<const M extends string>(failure: M) {
  return command(
    {
      action: "sync.start",
      failure,
      recover: async (scope, input: PlannedSync, error) => {
        try {
          await scope.execute(failedStart, { ...input, failure: "before_start" });
        } catch {
          /* The original persistence error takes precedence over history. */
        }
        throw error;
      },
    },
    async (scope, input: PlannedSync) => {
      await SyncService.startSyncRun(
        { session: input.session, requestPayload: input.requestPayload, existingRows: input.rows },
        scope.tx,
        scope.afterCommit,
      );
      return ok(null);
    },
  );
}

type ExistingSync = Parameters<typeof SyncService.completeSyncSessionFromExisting>[0];
function completeOperation<const M extends string>(failure: M) {
  return command(
    {
      action: "sync.completeExisting",
      failure,
      recover: async (scope, input: ExistingSync, error) => {
        try {
          await scope.execute(failedStart, {
            session: input.session,
            requestPayload: input.requestPayload,
            failure: "request_persistence",
          });
        } catch {
          /* The original persistence error takes precedence over history. */
        }
        throw error;
      },
    },
    async (scope, input: ExistingSync) => {
      await SyncService.completeSyncSessionFromExisting(input, scope.tx);
      return ok(null);
    },
  );
}

export const Sync = {
  planItem: query(
    { action: "sync.item", failure: "Failed to check for existing items" },
    async (
      scope,
      input: { readonly body: { readonly items: number[] }; readonly emailVerified: boolean },
    ) => {
      if (!input.emailVerified)
        return fail("forbidden", SYNC_STATUS_MESSAGES.requireEmailVerification);
      const existing = await SyncService.getExistingItemsWithLatestReleaseByExternalIds(
        input.body.items,
        scope.tx,
      );
      const ids = new Set(existing.map((row) => row.externalId));
      const missing = input.body.items.filter((id) => !ids.has(id));
      const syncSessionId = createId();
      const session = {
        id: syncSessionId,
        userId: scope.viewer.userId,
        syncType: "item",
        itemExternalIds: input.body.items,
        existingItemExternalIds: input.body.items.filter((id) => ids.has(id)),
      } satisfies SyncSessionCreation;
      const status =
        missing.length > 0
          ? SYNC_STATUS_MESSAGES.queued
          : "These items are already in the item database.";
      return ok({
        session,
        requestPayload: {
          type: "item",
          payloadVersion: 3,
          userId: scope.viewer.userId,
          syncSessionId,
          itemExternalIds: missing,
        } satisfies JobData,
        rows: { collectionItems: [], orders: [] },
        response: {
          status,
          isFinished: missing.length === 0,
          existingItemsToInsert: ids.size,
          newItems: missing.length,
          jobId: missing.length > 0 ? syncSessionId : null,
          syncSessionId,
          missingMfcItemIds: missing,
        },
      });
    },
  ),
  planCsv: query(
    { action: "sync.csv", failure: "Failed to check for existing items" },
    async (
      scope,
      input: {
        readonly body: Omit<InternalCsvItem, "collectionId">[];
        readonly emailVerified: boolean;
      },
    ) => {
      const { body } = input;
      const { log } = scope;
      if (!input.emailVerified) {
        log.set({
          action: "sync.csv",
          outcome: "forbidden",
          user: { id: scope.viewer.userId },
          sync: { type: "csv", reason: "email_not_verified" },
        });
        return fail("forbidden", SYNC_STATUS_MESSAGES.requireEmailVerification);
      }

      log.set({
        action: "sync.csv",
        user: { id: scope.viewer.userId },
        sync: { type: "csv" },
        items: { requested: body.length },
      });

      const items = body.map((item) => ({
        ...item,
        collectionId: createId(),
        orderId: item.status === "Ordered" ? createId() : item.orderId,
      }));

      const itemExternalIds = items.map((item) => item.itemExternalId);
      let existingItems;
      try {
        existingItems = await SyncService.getExistingItemsWithLatestReleaseByExternalIds(
          itemExternalIds,
          scope.tx,
        );
      } catch (error) {
        log.error(error instanceof Error ? error : new Error(String(error)), {
          step: "getExistingItemsWithLatestRelease",
          outcome: "error",
          sync: { type: "csv" },
        });
        return fail("internal_error", "Failed to check for existing items");
      }

      const result = prepareCsvItems(items, existingItems, scope.viewer.userId);
      const {
        collectionItems,
        orderItems,
        csvItemsToFetch: itemsToFetch,
        existingItemExternalIds,
      } = result;

      const itemExternalIdsToTrack = itemsToFetch.map((i) => i.itemExternalId);
      const syncSessionId = createId();
      const jobData = {
        type: "csv",
        payloadVersion: 3,
        userId: scope.viewer.userId,
        syncSessionId,
        items: itemsToFetch,
        itemsToInsert: collectionItems,
        ordersToInsert: orderItems,
      } satisfies JobData;
      const session = {
        id: syncSessionId,
        userId: scope.viewer.userId,
        syncType: "csv" as const,
        itemExternalIds: itemExternalIdsToTrack,
        existingItemExternalIds,
      };

      const jobId = itemsToFetch.length > 0 ? syncSessionId : null;
      const statusMessage: string = jobId
        ? SYNC_STATUS_MESSAGES.queued
        : SYNC_STATUS_MESSAGES.insertedFromExisting;

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
          toFetch: itemsToFetch.length,
        },
      });

      return ok({
        session,
        requestPayload: jobData,
        rows: { collectionItems, orders: orderItems },
        complete: {
          session,
          collectionItems,
          orderItems,
          requestPayload: jobData,
        },
        response: {
          status: statusMessage,
          isFinished: !jobId,
          existingItemsToInsert: collectionItems.length,
          newItems: itemsToFetch.length,
          jobId,
          syncSessionId,
          missingMfcItemIds: idsToFetch(jobData),
        },
      });
    },
  ),
  planOrder: query(
    { action: "sync.order", failure: "Failed to check for existing items" },
    async (scope, input: { readonly body: OrderSyncType; readonly emailVerified: boolean }) => {
      const { body } = input;
      const { log } = scope;
      if (!input.emailVerified) {
        log.set({
          action: "sync.order",
          outcome: "forbidden",
          user: { id: scope.viewer.userId },
          sync: { type: "order", reason: "email_not_verified" },
        });
        return fail("forbidden", SYNC_STATUS_MESSAGES.requireEmailVerification);
      }

      log.set({
        action: "sync.order",
        user: { id: scope.viewer.userId },
        sync: { type: "order" },
        items: { requested: body.items.length },
      });

      const orderId = createId();

      const normalizedItems = body.items.map((item: SyncOrderItemInput) => ({
        ...item,
        collectionId: createId(),
      }));
      const itemExternalIds = normalizedItems.map((item) => item.itemExternalId);

      let existingItems;
      try {
        existingItems = await SyncService.getExistingItemsWithLatestReleaseByExternalIds(
          itemExternalIds,
          scope.tx,
        );
      } catch (error) {
        log.error(error instanceof Error ? error : new Error(String(error)), {
          step: "getExistingItemsWithLatestRelease",
          outcome: "error",
          sync: { type: "order" },
        });
        return fail("internal_error", "Failed to check for existing items");
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

      const { items: _items, ...orderData } = body;
      const order: UpdatedSyncOrder = {
        ...orderData,
        userId: scope.viewer.userId,
        id: orderId,
        releaseDate: latestReleaseDate,
      };

      const itemsToFetch: UpdatedSyncOrderItem[] = normalizedItems
        .filter((item) => !externalIdToInternalId.has(item.itemExternalId))
        .map((item) => ({
          ...item,
          itemId: null,
          orderId,
          releaseId: null,
          userId: scope.viewer.userId,
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
            userId: scope.viewer.userId,
          },
        ];
      });

      const orderItemExternalIdsToTrack = itemsToFetch.map((i) => i.itemExternalId);
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

      const syncSessionId = createId();
      const jobData = {
        type: "order",
        payloadVersion: 3,
        userId: scope.viewer.userId,
        syncSessionId,
        order: {
          details: order,
          itemsToFetch,
          itemsToInsert: collectionItemsToInsert,
        },
      } satisfies JobData;
      const session = {
        id: syncSessionId,
        userId: scope.viewer.userId,
        syncType: "order" as const,
        itemExternalIds: orderItemExternalIdsToTrack,
        existingItemExternalIds: existingOrderItemExternalIds,
      };

      log.set({
        sync: {
          type: "order",
          sessionId: syncSessionId,
          orderId,
        },
        order: { id: orderId },
      });

      const jobId = itemsToFetch.length > 0 ? syncSessionId : null;

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
          toFetch: itemsToFetch.length,
        },
      });

      const statusMessage = jobId
        ? SYNC_STATUS_MESSAGES.queued
        : SYNC_STATUS_MESSAGES.insertedFromExisting;

      return ok({
        session,
        requestPayload: jobData,
        rows: {
          collectionItems: collectionItemsToInsert,
          orders: collectionItemsToInsert.length > 0 ? [order] : [],
        },
        complete: {
          session,
          collectionItems: collectionItemsToInsert,
          orderItems: [order],
          requestPayload: jobData,
        },
        response: {
          status: statusMessage,
          isFinished: !jobId,
          existingItemsToInsert: itemsToInsert.length,
          newItems: itemsToFetch.length,
          jobId,
          syncSessionId,
          missingMfcItemIds: idsToFetch(jobData),
        },
      });
    },
  ),
  planOrderItem: query(
    { action: "sync.orderItem", failure: "Failed to check for existing items" },
    async (
      scope,
      input: { readonly body: SyncOrderItemsInput; readonly emailVerified: boolean },
    ) => {
      const { body } = input;
      const { log } = scope;
      if (!input.emailVerified) {
        log.set({
          action: "sync.orderItem",
          outcome: "forbidden",
          user: { id: scope.viewer.userId },
          sync: { type: "order-item", orderId: body.orderId, reason: "email_not_verified" },
        });
        return fail("forbidden", SYNC_STATUS_MESSAGES.requireEmailVerification);
      }

      log.set({
        action: "sync.orderItem",
        user: { id: scope.viewer.userId },
        sync: { type: "order-item", orderId: body.orderId },
        items: { requested: body.items.length },
      });

      let existingOrder;
      try {
        existingOrder = await SyncService.getOrderByIdForUser(
          body.orderId,
          scope.viewer.userId,
          scope.tx,
        );
      } catch (error) {
        log.error(error instanceof Error ? error : new Error(String(error)), {
          step: "getOrderByIdForUser",
          outcome: "error",
          sync: { type: "order-item", orderId: body.orderId },
        });
        return fail("internal_error", "Failed to load order");
      }

      if (!existingOrder) {
        log.set({ outcome: "not_found" });
        return fail("not_found", "Order not found");
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

      let existingItems;
      try {
        existingItems = await SyncService.getExistingItemsWithLatestReleaseByExternalIds(
          itemExternalIds,
          scope.tx,
        );
      } catch (error) {
        log.error(error instanceof Error ? error : new Error(String(error)), {
          step: "getExistingItemsWithLatestRelease",
          outcome: "error",
          sync: { type: "order-item", orderId: body.orderId },
        });
        return fail("internal_error", "Failed to check for existing items");
      }

      const { externalIdToInternalId, releaseIdsByItemId } =
        buildExistingItemLookups(existingItems);

      const itemsToFetch: UpdatedSyncOrderItem[] = normalizedItems
        .filter((item) => !externalIdToInternalId.has(item.itemExternalId))
        .map((item) => ({
          ...item,
          itemId: null,
          orderId: existingOrder.id,
          releaseId: null,
          userId: scope.viewer.userId,
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
            userId: scope.viewer.userId,
          },
        ];
      });

      const orderItemExternalIdsToTrack = itemsToFetch.map((item) => item.itemExternalId);
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

      const syncSessionId = createId();
      const jobData = {
        type: "order-item",
        payloadVersion: 3,
        userId: scope.viewer.userId,
        syncSessionId,
        order: {
          details: orderDetails,
          itemsToFetch,
          itemsToInsert: collectionItemsToInsert,
        },
      } satisfies JobData;
      const session = {
        id: syncSessionId,
        userId: scope.viewer.userId,
        syncType: "order-item" as const,
        itemExternalIds: orderItemExternalIdsToTrack,
        orderId: existingOrder.id,
        existingItemExternalIds: existingOrderItemExternalIds,
      };

      log.set({
        sync: {
          type: "order-item",
          sessionId: syncSessionId,
          orderId: existingOrder.id,
        },
        order: { id: existingOrder.id },
      });

      const jobId = itemsToFetch.length > 0 ? syncSessionId : null;

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
          toFetch: itemsToFetch.length,
        },
      });

      const statusMessage = jobId
        ? SYNC_STATUS_MESSAGES.queued
        : SYNC_STATUS_MESSAGES.insertedFromExisting;

      return ok({
        session,
        requestPayload: jobData,
        rows: { collectionItems: collectionItemsToInsert, orders: [] },
        complete: {
          session,
          collectionItems: collectionItemsToInsert,
          requestPayload: jobData,
        },
        response: {
          status: statusMessage,
          isFinished: !jobId,
          existingItemsToInsert: itemsToInsert.length,
          newItems: itemsToFetch.length,
          jobId,
          syncSessionId,
          missingMfcItemIds: idsToFetch(jobData),
        },
      });
    },
  ),
  planCollection: query(
    { action: "sync.collection", failure: "Failed to check for existing items" },
    async (
      scope,
      input: {
        readonly body: Omit<CollectionSyncType, "collectionId">[];
        readonly emailVerified: boolean;
      },
    ) => {
      const { body } = input;
      const { log } = scope;
      if (!input.emailVerified) {
        log.set({
          action: "sync.collection",
          outcome: "forbidden",
          user: { id: scope.viewer.userId },
          sync: { type: "collection", reason: "email_not_verified" },
        });
        return fail("forbidden", SYNC_STATUS_MESSAGES.requireEmailVerification);
      }

      log.set({
        action: "sync.collection",
        user: { id: scope.viewer.userId },
        sync: { type: "collection" },
        items: { requested: body.length },
      });

      const normalizedItems = body.map((item) => ({
        ...item,
        collectionId: createId(),
      }));
      const itemExternalIds = normalizedItems.map((item) => item.itemExternalId);

      let existingItems;
      try {
        existingItems = await SyncService.getExistingItemsWithLatestReleaseByExternalIds(
          itemExternalIds,
          scope.tx,
        );
      } catch (error) {
        log.error(error instanceof Error ? error : new Error(String(error)), {
          step: "getExistingItemsWithLatestRelease",
          outcome: "error",
          sync: { type: "collection" },
        });
        return fail("internal_error", "Failed to check for existing items");
      }

      const { externalIdToInternalId, releaseIdsByItemId } =
        buildExistingItemLookups(existingItems);

      const itemsToFetch: UpdatedSyncCollection[] = normalizedItems
        .filter((item) => !externalIdToInternalId.has(item.itemExternalId))
        .map((item) => ({
          ...item,
          itemId: null,
          releaseId: null,
          userId: scope.viewer.userId,
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
            userId: scope.viewer.userId,
          },
        ];
      });

      const collectionItemExternalIdsToTrack = itemsToFetch.map((i) => i.itemExternalId);
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

      const syncSessionId = createId();
      const jobData = {
        type: "collection",
        payloadVersion: 3,
        userId: scope.viewer.userId,
        syncSessionId,
        collection: {
          itemsToFetch,
          itemsToInsert: collectionItemsToInsert,
        },
      } satisfies JobData;
      const session = {
        id: syncSessionId,
        userId: scope.viewer.userId,
        syncType: "collection" as const,
        itemExternalIds: collectionItemExternalIdsToTrack,
        existingItemExternalIds: existingCollectionItemExternalIds,
      };

      log.set({
        sync: {
          type: "collection",
          sessionId: syncSessionId,
        },
      });

      const jobId = itemsToFetch.length > 0 ? syncSessionId : null;

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
          toFetch: itemsToFetch.length,
        },
      });

      const statusMessage = jobId
        ? SYNC_STATUS_MESSAGES.queued
        : SYNC_STATUS_MESSAGES.insertedFromExisting;

      return ok({
        session,
        requestPayload: jobData,
        rows: { collectionItems: collectionItemsToInsert, orders: [] },
        complete: {
          session,
          collectionItems: collectionItemsToInsert,
          requestPayload: jobData,
        },
        response: {
          status: statusMessage,
          isFinished: !jobId,
          existingItemsToInsert: itemsToInsert.length,
          newItems: itemsToFetch.length,
          jobId,
          syncSessionId,
          missingMfcItemIds: idsToFetch(jobData),
        },
      });
    },
  ),
  sessions: query(
    { action: "sync.sessions", failure: "Failed to load import history" },
    async (
      scope,
      input: {
        readonly query: {
          page?: string;
          limit?: string;
          status?: SyncSessionStatus[];
          syncType?: SyncType[];
        };
      },
    ) => {
      const { query: filters } = input;
      const { log } = scope;
      const page = filters.page ? Number.parseInt(filters.page, 10) : 1;
      const limit = filters.limit ? Number.parseInt(filters.limit, 10) : 20;

      log.set({
        action: "sync.sessions",
        user: { id: scope.viewer.userId },
        pagination: { page, limit },
        filters: {
          status: filters.status ?? [],
          syncType: filters.syncType ?? [],
        },
      });

      if (Number.isNaN(page) || page < 1) {
        log.set({ outcome: "bad_request" });
        return fail("bad_request", "Invalid page parameter");
      }
      if (Number.isNaN(limit) || limit < 1 || limit > MAX_LIMIT) {
        log.set({ outcome: "bad_request" });
        return fail("bad_request", "Invalid limit parameter");
      }

      const result = await SyncService.getSyncSessions(
        scope.viewer.userId,
        page,
        limit,
        filters.status,
        filters.syncType,
        scope.tx,
      );

      log.set({
        outcome: "success",
        result: {
          sessionCount: result.sessions.length,
          total: result.total,
        },
      });

      return ok({ sessions: result.sessions, total: result.total, page, limit });
    },
  ),
  sessionDetail: query(
    { action: "sync.sessionDetail", failure: "Failed to load import details" },
    async (
      scope,
      input: {
        readonly query: { page?: string; limit?: string; status?: SyncSessionItemStatus[] };
        readonly params: { readonly id: string };
      },
    ) => {
      const { query: filters, params } = input;
      const { log } = scope;
      log.set({
        action: "sync.sessionDetail",
        user: { id: scope.viewer.userId },
        sync: { sessionId: params.id },
        filters: {
          status: filters.status ?? [],
        },
      });

      const page = filters.page ? Number.parseInt(filters.page, 10) : undefined;
      const limit = filters.limit ? Number.parseInt(filters.limit, 10) : undefined;

      log.set({
        pagination: {
          page: page ?? null,
          limit: limit ?? null,
        },
      });

      if (page !== undefined && (Number.isNaN(page) || page < 1)) {
        log.set({ outcome: "bad_request" });
        return fail("bad_request", "Invalid page parameter");
      }
      if (limit !== undefined && (Number.isNaN(limit) || limit < 1 || limit > MAX_LIMIT)) {
        log.set({ outcome: "bad_request" });
        return fail("bad_request", "Invalid limit parameter");
      }

      const result = await SyncService.getSyncSessionDetail(
        params.id,
        scope.viewer.userId,
        page,
        limit,
        filters.status,
        scope.tx,
      );

      if (!result) {
        log.set({ outcome: "not_found" });
        return fail("not_found", "Import not found");
      }

      log.set({
        outcome: "success",
        result: {
          itemCount: result.items.length,
          totalItems: result.totalItems,
        },
      });

      return ok({
        session: { ...result.session, items: result.items },
        totalItems: result.totalItems,
      });
    },
  ),
  start: startOperation("Failed to create import record"),
  completeCsv: completeOperation("Failed to save collection items and orders"),
  completeOrder: completeOperation("Failed to save the order and its items"),
  completeOrderItem: completeOperation("Failed to save order items"),
  completeCollection: completeOperation("Failed to save collection items"),
  createSession: command(
    { action: "sync.createSession", failure: "Failed to create import record" },
    async (scope, input: SyncSessionCreation) => {
      await SyncService.createSyncSession(input, scope.tx);
      return ok(null);
    },
  ),
  completeItemSession: command(
    { action: "sync.completeItemSession", failure: "Failed to update import record" },
    async (scope, input: { readonly id: string; readonly statusMessage: string }) => {
      await SyncService.updateSyncSession(
        input.id,
        { status: "completed", statusMessage: input.statusMessage, completedAt: new Date() },
        scope.tx,
      );
      return ok(null);
    },
  ),
  jobStatus: query(
    { action: "sync.jobStatus", failure: "Error fetching job status" },
    async (scope, input: { readonly jobId: string }) => {
      try {
        return ok(await SyncService.getJobStatus(input.jobId, scope.viewer.userId, scope.tx));
      } catch (error) {
        if (error instanceof Error && error.message === "SYNC_JOB_NOT_FOUND")
          return fail("not_found", "Job not found");
        throw error;
      }
    },
  ),
};

const runFailure = command(
  { action: "sync.recordItemFailure", failure: "Failed to save the item result" },
  async (
    scope,
    input: { readonly id: string; readonly upload: SyncItemUpload; readonly missingOrder: boolean },
  ) => {
    if (input.missingOrder) {
      await failRunWithoutOrder(scope, input.id, scope.viewer.userId);
      return ok({
        outcome: "failed",
        reason: SYNC_STATUS_MESSAGES.failedPersist,
      } satisfies CompleteSyncItemResult);
    }
    const recorded = await recordItemFailures(
      scope,
      input.id,
      scope.viewer.userId,
      input.upload.jobId,
      [{ mfcItemId: input.upload.mfcItemId, kind: "persistence" }],
    );
    return recorded === null
      ? failAfterCommit("not_found", "This item is not part of the import")
      : ok({
          outcome: "failed",
          reason: SYNC_STATUS_MESSAGES.failedPersist,
        } satisfies CompleteSyncItemResult);
  },
);

export const SyncRuns = {
  itemStatus: query(
    { action: "sync.completeItem", failure: "Failed to import item" },
    async (
      scope,
      input: { readonly id: string; readonly mfcItemId: number; readonly emailVerified: boolean },
    ) => {
      if (!input.emailVerified)
        return fail("forbidden", SYNC_STATUS_MESSAGES.requireEmailVerification);
      const rows = await syncItemStatus(scope.tx, input.id, scope.viewer.userId, input.mfcItemId);
      if (rows.length === 0) return fail("not_found", "This item is not part of the import");
      return ok(
        rows.every((row) => row.status === "imported")
          ? ({ outcome: "already_imported", reason: null } satisfies CompleteSyncItemResult)
          : null,
      );
    },
  ),

  complete: command(
    {
      action: "sync.completeItem",
      failure: "Failed to import item",
      retry: retryOrderLock,
      before: async (scope, input: { readonly id: string; readonly upload: SyncItemUpload }) =>
        proceed({ ...input, prepared: await prepareMfcItem(scope.tx, input.upload) }),
      recover: async (scope, input, error) => {
        const missingOrder = error instanceof OrderAbsentError;
        try {
          const recorded = await scope.execute(runFailure, { ...input, missingOrder });
          if (!missingOrder)
            scope.log.error(error instanceof Error ? error : new Error(String(error)));
          return recorded;
        } catch (recordError) {
          if (missingOrder) throw recordError;
          throw error;
        }
      },
    },
    async (scope, input) => {
      const result = await completeSyncItem(
        scope,
        input.id,
        scope.viewer.userId,
        input.upload,
        input.prepared,
      );
      return result === null
        ? failAfterCommit("not_found", "This item is not part of the import")
        : ok(result);
    },
  ),
  failure: command(
    { action: "sync.failItem", failure: "Failed to save the item result" },
    async (
      scope,
      input: {
        readonly id: string;
        readonly failure: SyncItemFailure;
        readonly emailVerified: boolean;
      },
    ) => {
      if (!input.emailVerified)
        return fail("forbidden", SYNC_STATUS_MESSAGES.requireEmailVerification);
      const result = await failSyncItem(scope, input.id, scope.viewer.userId, input.failure);
      return result === null ? fail("not_found", "Import not found") : ok(result);
    },
  ),
  heartbeat: command(
    { action: "sync.heartbeat", failure: "Failed to renew the import" },
    async (scope, input: { readonly id: string; readonly jobId: string }) => {
      const result = await heartbeatSyncRun(scope, input.id, scope.viewer.userId, input.jobId);
      return result === null ? fail("not_found", "Import not found") : ok(result);
    },
  ),
  interrupt: command(
    { action: "sync.interrupt", failure: "Failed to stop the import" },
    async (scope, input: { readonly id: string; readonly jobId: string }) => {
      const result = await interruptSyncRun(scope, input.id, scope.viewer.userId, input.jobId);
      return result === null ? fail("not_found", "Import not found") : ok(result);
    },
  ),
  retry: command(
    { action: "sync.retry", failure: "Failed to retry failed item results" },
    async (scope, input: { readonly id: string; readonly emailVerified: boolean }) => {
      if (!input.emailVerified)
        return fail("forbidden", SYNC_STATUS_MESSAGES.requireEmailVerification);
      const result = await retrySyncRun(scope, input.id, scope.viewer.userId);
      if (result.outcome === "not_found") return failAfterCommit("not_found", "Import not found");
      if (result.outcome === "expired")
        return failAfterCommit(
          "conflict",
          `The ${SYNC_SESSION_RETRY_WINDOW_DAYS}-day window to retry failed item results has expired`,
        );
      if (result.outcome === "unavailable")
        return failAfterCommit("conflict", "These failed item results cannot be retried");
      return ok({ jobId: result.jobId, missingMfcItemIds: result.missingMfcItemIds });
    },
  ),
};
