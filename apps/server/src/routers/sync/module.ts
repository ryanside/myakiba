import { readStream } from "@/boundary/stream-read";
import { streamStatus } from "./stream";
import { prepareMfcItem } from "@/lib/mfc-item-ingest";
import {
  completeSyncItem,
  failSyncItem,
  heartbeatSyncRun,
  interruptSyncRun,
  retrySyncRun,
  retryOrderLock,
  syncItemStatus,
  failRunWithoutOrder,
  recordItemFailures,
} from "./run";
import type { CompleteSyncItemResult } from "./run";
import { createId } from "@paralleldrive/cuid2";
import { Result, panic } from "better-result";
import { command, compose, query, stream } from "@/domain/kernel";
import { EmailNotVerified } from "./errors/email-not-verified";
import { ImportNotFound } from "./errors/import-not-found";
import { InvalidLimit } from "./errors/invalid-limit";
import { InvalidPage } from "./errors/invalid-page";
import { ItemNotInImport } from "./errors/item-not-in-import";
import { OrderNotFound } from "@/routers/orders/errors/order-not-found";
import { RetryUnavailable } from "./errors/retry-unavailable";
import { RetryWindowExpired } from "./errors/retry-window-expired";
import type { JobData, UpdatedSyncOrder } from "@myakiba/contracts/sync/schema";
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
} from "./model";
import SyncService from "./service";
import type { SyncSessionCreation } from "./service";
import { normalizeCsvPrices, prepareCsvItems } from "./csv";
import { collectionRows, orderCollectionRows, plannedSync, splitItems } from "./plan";
import type { PlannedSync } from "./plan";

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
    return Result.ok(null);
  },
);

function startOperation<const M extends string>(failure: M) {
  return command(
    { action: "sync.start", failure },
    async (scope, input: PlannedSync) => {
      const started = await SyncService.startSyncRun(
        { session: input.session, requestPayload: input.requestPayload, existingRows: input.rows },
        scope.tx,
        scope.afterCommit,
      );
      return started.map(() => null);
    },
    {
      recover: async (scope, input, error) => {
        try {
          await scope.execute(failedStart, { ...input, failure: "before_start" });
        } catch {
          /* The original persistence error takes precedence over history. */
        }
        throw error;
      },
    },
  );
}

type ExistingSync = Parameters<typeof SyncService.completeSyncSessionFromExisting>[0];
function completeOperation<const M extends string>(failure: M) {
  return command(
    { action: "sync.completeExisting", failure },
    async (scope, input: ExistingSync) => {
      await SyncService.completeSyncSessionFromExisting(input, scope.tx);
      return Result.ok(null);
    },
    {
      recover: async (scope, input, error) => {
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
  );
}

export const Sync = {
  planItem: query(
    { action: "sync.item", failure: "Failed to check for existing items" },
    async (
      scope,
      input: { readonly body: { readonly items: number[] }; readonly emailVerified: boolean },
    ) => {
      scope.log.set({ sync: { type: "item" } });
      if (!input.emailVerified) {
        scope.log.set({ sync: { reason: "email_not_verified" } });
        return Result.err(new EmailNotVerified());
      }
      const existing = await SyncService.getExistingItemsWithLatestReleaseByExternalIds(
        input.body.items,
        scope.tx,
      );
      const ids = new Set(existing.map((row) => row.externalId));
      const missing = input.body.items.filter((id) => !ids.has(id));
      const syncSessionId = createId();
      scope.log.set({
        sync: { sessionId: syncSessionId },
        items: {
          requested: input.body.items.length,
          existing: ids.size,
          toFetch: missing.length,
        },
      });
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
      return Result.ok({
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
          sync: { type: "csv", reason: "email_not_verified" },
        });
        return Result.err(new EmailNotVerified());
      }

      log.set({
        sync: { type: "csv" },
        items: { requested: body.length },
      });

      const { items, warnings } = normalizeCsvPrices(
        body.map((item) => ({
          ...item,
          collectionId: createId(),
          orderId: item.status === "Ordered" ? createId() : item.orderId,
        })),
      );

      const itemExternalIds = items.map((item) => item.itemExternalId);
      const existingItems = await SyncService.getExistingItemsWithLatestReleaseByExternalIds(
        itemExternalIds,
        scope.tx,
      );

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
        warnings,
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

      return Result.ok(
        plannedSync({
          log,
          requested: body.length,
          session,
          requestPayload: jobData,
          rows: { collectionItems, orders: orderItems },
        }),
      );
    },
  ),
  planOrder: query(
    { action: "sync.order", failure: "Failed to check for existing items" },
    async (scope, input: { readonly body: OrderSyncType; readonly emailVerified: boolean }) => {
      const { body } = input;
      const { log } = scope;
      if (!input.emailVerified) {
        log.set({
          sync: { type: "order", reason: "email_not_verified" },
        });
        return Result.err(new EmailNotVerified());
      }

      log.set({
        sync: { type: "order" },
        items: { requested: body.items.length },
      });

      const orderId = createId();

      const normalizedItems = body.items.map((item) => ({
        ...item,
        collectionId: createId(),
        orderId,
      }));
      const itemExternalIds = normalizedItems.map((item) => item.itemExternalId);

      const existingItems = await SyncService.getExistingItemsWithLatestReleaseByExternalIds(
        itemExternalIds,
        scope.tx,
      );

      const { itemsToFetch, itemsToInsert, releaseDates } = splitItems({
        items: normalizedItems,
        existingItems,
        userId: scope.viewer.userId,
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

      const orderItemExternalIdsToTrack = itemsToFetch.map((i) => i.itemExternalId);
      const existingOrderItemExternalIds = itemsToInsert.map((i) => i.itemExternalId);
      const collectionItemsToInsert = orderCollectionRows(itemsToInsert, order.shop);

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

      return Result.ok(
        plannedSync({
          log,
          requested: body.items.length,
          session,
          requestPayload: jobData,
          rows: {
            collectionItems: collectionItemsToInsert,
            orders: collectionItemsToInsert.length > 0 ? [order] : [],
          },
          completeOrders: [order],
        }),
      );
    },
  ),
  order: query(
    { action: "sync.orderItem", failure: "Failed to load order" },
    async (
      scope,
      input: { readonly body: SyncOrderItemsInput; readonly emailVerified: boolean },
    ) => {
      const { body } = input;
      const { log } = scope;
      if (!input.emailVerified) {
        log.set({
          sync: { type: "order-item", orderId: body.orderId, reason: "email_not_verified" },
        });
        return Result.err(new EmailNotVerified());
      }

      log.set({
        sync: { type: "order-item", orderId: body.orderId },
        items: { requested: body.items.length },
      });

      const existingOrder = await SyncService.getOrderByIdForUser(
        body.orderId,
        scope.viewer.userId,
        scope.tx,
      );

      if (!existingOrder) {
        return Result.err(new OrderNotFound());
      }

      return Result.ok({
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
      } satisfies UpdatedSyncOrder);
    },
  ),
  planOrderItem: query(
    { action: "sync.orderItem", failure: "Failed to check for existing items" },
    async (
      scope,
      input: { readonly body: SyncOrderItemsInput; readonly order: UpdatedSyncOrder },
    ) => {
      const { body, order: orderDetails } = input;
      const { log } = scope;

      const normalizedItems = body.items.map((item) => ({
        ...item,
        collectionId: createId(),
        orderId: orderDetails.id,
      }));
      const itemExternalIds = normalizedItems.map((item) => item.itemExternalId);

      const existingItems = await SyncService.getExistingItemsWithLatestReleaseByExternalIds(
        itemExternalIds,
        scope.tx,
      );

      const { itemsToFetch, itemsToInsert } = splitItems({
        items: normalizedItems,
        existingItems,
        userId: scope.viewer.userId,
      });

      const orderItemExternalIdsToTrack = itemsToFetch.map((item) => item.itemExternalId);
      const existingOrderItemExternalIds = itemsToInsert.map((item) => item.itemExternalId);
      const collectionItemsToInsert = orderCollectionRows(itemsToInsert, orderDetails.shop);

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
        orderId: orderDetails.id,
        existingItemExternalIds: existingOrderItemExternalIds,
      };

      return Result.ok(
        plannedSync({
          log,
          requested: body.items.length,
          session,
          requestPayload: jobData,
          rows: { collectionItems: collectionItemsToInsert, orders: [] },
        }),
      );
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
          sync: { type: "collection", reason: "email_not_verified" },
        });
        return Result.err(new EmailNotVerified());
      }

      log.set({
        sync: { type: "collection" },
        items: { requested: body.length },
      });

      const normalizedItems = body.map((item) => ({
        ...item,
        collectionId: createId(),
      }));
      const itemExternalIds = normalizedItems.map((item) => item.itemExternalId);

      const existingItems = await SyncService.getExistingItemsWithLatestReleaseByExternalIds(
        itemExternalIds,
        scope.tx,
      );

      const { itemsToFetch, itemsToInsert } = splitItems({
        items: normalizedItems,
        existingItems,
        userId: scope.viewer.userId,
      });

      const collectionItemExternalIdsToTrack = itemsToFetch.map((i) => i.itemExternalId);
      const existingCollectionItemExternalIds = itemsToInsert.map((i) => i.itemExternalId);
      const collectionItemsToInsert = collectionRows(
        itemsToInsert.map((item) => ({ ...item, orderId: null, status: "Owned" as const })),
      );

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

      return Result.ok(
        plannedSync({
          log,
          requested: body.length,
          session,
          requestPayload: jobData,
          rows: { collectionItems: collectionItemsToInsert, orders: [] },
        }),
      );
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
        pagination: { page, limit },
        filters: {
          status: filters.status ?? [],
          syncType: filters.syncType ?? [],
        },
      });

      if (Number.isNaN(page) || page < 1) {
        return Result.err(new InvalidPage());
      }
      if (Number.isNaN(limit) || limit < 1 || limit > MAX_LIMIT) {
        return Result.err(new InvalidLimit());
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
        result: {
          sessionCount: result.sessions.length,
          total: result.total,
        },
      });

      return Result.ok({ sessions: result.sessions, total: result.total, page, limit });
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
        return Result.err(new InvalidPage());
      }
      if (limit !== undefined && (Number.isNaN(limit) || limit < 1 || limit > MAX_LIMIT)) {
        return Result.err(new InvalidLimit());
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
        return Result.err(new ImportNotFound());
      }

      log.set({
        result: {
          itemCount: result.items.length,
          totalItems: result.totalItems,
        },
      });

      return Result.ok({
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
      return Result.ok(null);
    },
  ),
  completeItemSession: command(
    { action: "sync.completeItemSession", failure: "Failed to update import record" },
    async (scope, input: { readonly id: string; readonly statusMessage: string }) => {
      const updated = await SyncService.updateSyncSession(
        input.id,
        { status: "completed", statusMessage: input.statusMessage, completedAt: new Date() },
        scope.tx,
      );
      if (!updated)
        panic(
          `sync.completeItemSession could not update the Item import session ${input.id} that sync.createSession just created`,
        );
      return Result.ok(null);
    },
  ),
  jobStatus: query(
    {
      action: "sync.jobStatus",
      failure: "Error fetching job status",
    },
    async (scope, input: { readonly jobId: string }) =>
      SyncService.getJobStatus(input.jobId, scope.viewer.userId, scope.tx),
  ),
};

const runFailure = command(
  { action: "sync.recordItemFailure", failure: "Failed to save the item result" },
  async (
    scope,
    input: { readonly id: string; readonly upload: SyncItemUpload; readonly missingOrder: boolean },
  ) => {
    scope.log.set({ outcome: "failed" });
    if (input.missingOrder) {
      await failRunWithoutOrder(scope, input.id, scope.viewer.userId);
      return Result.ok({
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
    return recorded.unwrap() === null
      ? Result.err(new ItemNotInImport())
      : Result.ok({
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
      if (!input.emailVerified) return Result.err(new EmailNotVerified());
      const rows = await syncItemStatus(scope.tx, input.id, scope.viewer.userId, input.mfcItemId);
      if (rows.length === 0) return Result.err(new ItemNotInImport());
      if (!rows.every((row) => row.status === "imported")) return Result.ok(null);
      scope.log.set({ outcome: "already_imported" });
      return Result.ok({
        outcome: "already_imported",
        reason: null,
      } satisfies CompleteSyncItemResult);
    },
  ),

  complete: command(
    {
      action: "sync.completeItem",
      failure: "Failed to import item",
      before: async (scope, input: { readonly id: string; readonly upload: SyncItemUpload }) => {
        return scope.proceed({
          ...input,
          prepared: await prepareMfcItem(scope.tx, input.upload),
        });
      },
    },
    async (scope, input) => {
      const completed = await completeSyncItem(
        scope,
        input.id,
        scope.viewer.userId,
        input.upload,
        input.prepared,
      );
      if (completed.isErr()) return completed;
      const result = completed.value;
      if (result === null) return Result.err(new ItemNotInImport());
      scope.log.set({ outcome: result.outcome });
      return Result.ok(result);
    },
    {
      retry: retryOrderLock,
      recover: async (scope, input, error) => {
        const { missingOrder, cause } = error.match({
          SyncOrderAbsent: (absent) => ({ missingOrder: true, cause: absent }),
          SyncOrderUnowned: (unowned) => ({ missingOrder: false, cause: unowned }),
          MfcItemNotPersisted: (unsaved) => ({ missingOrder: false, cause: unsaved }),
          StoreItemPictureFailed: (failed) => ({
            missingOrder: false,
            cause: failed.cause,
          }),
          UnhandledException: (thrown) => ({
            missingOrder: false,
            cause: thrown.cause,
          }),
        });
        const original = cause instanceof Error ? cause : new Error(String(cause));
        try {
          const recorded = await scope.execute(runFailure, { ...input, missingOrder });
          if (!missingOrder) scope.log.error(original);
          return recorded;
        } catch (recordError) {
          // A missing Order reports why recording failed; anything else reports the original.
          throw missingOrder ? recordError : original;
        }
      },
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
      if (!input.emailVerified) return Result.err(new EmailNotVerified());
      const answered = await failSyncItem(scope, input.id, scope.viewer.userId, input.failure);
      const result = answered.unwrap();
      if (result === null) return Result.err(new ImportNotFound());
      scope.log.set({ outcome: result.outcome });
      return Result.ok(result);
    },
  ),
  heartbeat: command(
    { action: "sync.heartbeat", failure: "Failed to renew the import" },
    async (scope, input: { readonly id: string; readonly jobId: string }) => {
      const answered = await heartbeatSyncRun(scope, input.id, scope.viewer.userId, input.jobId);
      const result = answered.unwrap();
      if (result === null) return Result.err(new ImportNotFound());
      scope.log.set({ outcome: result.active ? "active" : "inactive" });
      return Result.ok(result);
    },
  ),
  interrupt: command(
    { action: "sync.interrupt", failure: "Failed to stop the import" },
    async (scope, input: { readonly id: string; readonly jobId: string }) => {
      const answered = await interruptSyncRun(scope, input.id, scope.viewer.userId, input.jobId);
      const result = answered.unwrap();
      if (result === null) return Result.err(new ImportNotFound());
      scope.log.set({ outcome: result.outcome });
      return Result.ok(result);
    },
  ),
  retry: command(
    { action: "sync.retry", failure: "Failed to retry failed item results" },
    async (scope, input: { readonly id: string; readonly emailVerified: boolean }) => {
      if (!input.emailVerified) return Result.err(new EmailNotVerified());
      const result = await retrySyncRun(scope, input.id, scope.viewer.userId);
      if (result.outcome === "not_found") return Result.err(new ImportNotFound());
      if (result.outcome === "expired") return scope.failAfterCommit(new RetryWindowExpired());
      if (result.outcome === "unavailable") return scope.failAfterCommit(new RetryUnavailable());
      if (result.outcome === "invalid_payload") {
        scope.log.error(result.failure);
        return scope.failAfterCommit(result.failure);
      }
      scope.log.set({
        sync: { jobId: result.jobId },
        items: { toFetch: result.missingMfcItemIds.length },
      });
      return Result.ok({ jobId: result.jobId, missingMfcItemIds: result.missingMfcItemIds });
    },
  ),
};

type InputOf<O> = O extends { readonly "~types"?: { readonly input: (input: infer I) => void } }
  ? I
  : never;

export const SyncRequests = {
  stream: stream(
    { action: "sync.jobStatus", failure: "Error fetching job status" },
    (scope, input: { readonly jobId: string; readonly signal: AbortSignal }) =>
      streamStatus({
        log: scope.log,
        jobId: input.jobId,
        signal: input.signal,
        read: () => readStream(scope, Sync.jobStatus, { jobId: input.jobId }),
      }),
  ),

  item: compose(
    {
      action: "sync.item",
      failure: "Failed to check for existing items",
      steps: [Sync.planItem, Sync.start, Sync.createSession, Sync.completeItemSession],
      before: (scope, input: InputOf<typeof Sync.planItem>) => scope.execute(Sync.planItem, input),
    },
    async (scope, plan) => {
      if (plan.response.jobId) {
        const started = await scope.execute(Sync.start, plan);
        if (started.isErr()) return started;
      } else {
        const created = await scope.execute(Sync.createSession, plan.session);
        if (created.isErr()) return created;
        const completed = await scope.execute(Sync.completeItemSession, {
          id: plan.session.id,
          statusMessage: plan.response.status,
        });
        if (completed.isErr()) return completed;
      }
      return Result.ok(plan.response);
    },
  ),
  csv: compose(
    {
      action: "sync.csv",
      failure: "Failed to check for existing items",
      steps: [Sync.planCsv, Sync.start, Sync.completeCsv],
      before: (scope, input: InputOf<typeof Sync.planCsv>) => scope.execute(Sync.planCsv, input),
    },
    async (scope, plan) => {
      const saved = plan.response.jobId
        ? await scope.execute(Sync.start, plan)
        : await scope.execute(Sync.completeCsv, plan.complete);
      if (saved.isErr()) return saved;
      return Result.ok(plan.response);
    },
  ),
  order: compose(
    {
      action: "sync.order",
      failure: "Failed to check for existing items",
      steps: [Sync.planOrder, Sync.start, Sync.completeOrder],
      before: (scope, input: InputOf<typeof Sync.planOrder>) =>
        scope.execute(Sync.planOrder, input),
    },
    async (scope, plan) => {
      const saved = plan.response.jobId
        ? await scope.execute(Sync.start, plan)
        : await scope.execute(Sync.completeOrder, plan.complete);
      if (saved.isErr()) return saved;
      return Result.ok(plan.response);
    },
  ),
  orderItem: compose(
    {
      action: "sync.orderItem",
      failure: "Failed to check for existing items",
      steps: [Sync.order, Sync.planOrderItem, Sync.start, Sync.completeOrderItem],
      before: async (scope, input: InputOf<typeof Sync.order>) => {
        const order = await scope.execute(Sync.order, input);
        if (order.isErr()) return order;
        return scope.execute(Sync.planOrderItem, { body: input.body, order: order.value });
      },
    },
    async (scope, plan) => {
      const saved = plan.response.jobId
        ? await scope.execute(Sync.start, plan)
        : await scope.execute(Sync.completeOrderItem, plan.complete);
      if (saved.isErr()) return saved;
      return Result.ok(plan.response);
    },
  ),
  collection: compose(
    {
      action: "sync.collection",
      failure: "Failed to check for existing items",
      steps: [Sync.planCollection, Sync.start, Sync.completeCollection],
      before: (scope, input: InputOf<typeof Sync.planCollection>) =>
        scope.execute(Sync.planCollection, input),
    },
    async (scope, plan) => {
      const saved = plan.response.jobId
        ? await scope.execute(Sync.start, plan)
        : await scope.execute(Sync.completeCollection, plan.complete);
      if (saved.isErr()) return saved;
      return Result.ok(plan.response);
    },
  ),
  complete: compose(
    {
      action: "sync.completeItem",
      failure: "Failed to import item",
      steps: [SyncRuns.itemStatus, SyncRuns.complete],
      before: async (
        scope,
        input: InputOf<typeof SyncRuns.complete> & { readonly emailVerified: boolean },
      ) => {
        const existing = await scope.execute(SyncRuns.itemStatus, {
          id: input.id,
          mfcItemId: input.upload.mfcItemId,
          emailVerified: input.emailVerified,
        });
        if (existing.isErr()) return existing;
        return Result.ok({ input, existing: existing.value });
      },
    },
    async (scope, { input, existing }) => {
      if (existing !== null) return Result.ok(existing);
      return scope.execute(SyncRuns.complete, input);
    },
  ),
};
