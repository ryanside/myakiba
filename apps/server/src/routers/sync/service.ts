import { db } from "@myakiba/db/client";
import {
  item,
  collection,
  item_release,
  order,
  syncSession,
  syncSessionItem,
} from "@myakiba/db/schema/figure";
import type {
  DbEnrichedSyncSessionItemRow,
  DbSyncSessionItemRow,
  DbSyncSessionRow,
} from "@myakiba/db/schema/figure";
import { and, inArray, eq, desc, count, sql } from "drizzle-orm";
import { syncJobStatusSchema, type SyncTerminalState } from "./model";
import type {
  UpdatedSyncCollection,
  UpdatedSyncOrder,
  UpdatedSyncOrderItem,
} from "@myakiba/schemas/sync";
import type { InternalCsvItem, SyncJobStatus, CollectionInsertType } from "./model";
import type { OrderInsertType } from "../orders/model";
import type { SyncSessionItemStatus, SyncSessionStatus, SyncType } from "@myakiba/types/enums";
import { Queue } from "bullmq";
import { createId } from "@paralleldrive/cuid2";
import { env } from "@myakiba/env/server";
import { parseMoneyToMinorUnits } from "@myakiba/utils/currency";
import { toDateOnlyString } from "@myakiba/utils/date-only";
import { tryCatch } from "@myakiba/utils/result";
import {
  getJobStatusSnapshotKey,
  parseJobStatusPayload,
  writeJobStatusSnapshotAndPublish,
} from "@myakiba/redis/job-status";
import { redis } from "@myakiba/redis/client";
import {
  csvItemMetadataSchema,
  orderItemMetadataSchema,
  collectionItemMetadataSchema,
  syncOrderSchema,
} from "@myakiba/schemas/sync";
import { createLogger } from "evlog";

const syncQueue = new Queue("sync-queue", {
  connection: {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    enableOfflineQueue: false,
  },
});

syncQueue.on("error", (err: Error) => {
  const queueLog = createLogger({
    action: "sync.queue",
    outcome: "error",
    queue: { name: "sync-queue" },
  });
  queueLog.error(err);
  queueLog.emit();
});

type SyncSessionUpdatePayload = Partial<
  Pick<
    typeof syncSession.$inferInsert,
    "status" | "statusMessage" | "jobId" | "orderId" | "successCount" | "failCount" | "completedAt"
  >
>;

class SyncService {
  private deriveTerminalStateFromSessionStatus(
    sessionStatus: SyncSessionStatus,
  ): SyncTerminalState {
    return sessionStatus === "completed" || sessionStatus === "partial" ? "success" : "error";
  }

  private async markSyncSessionAsFailed(
    syncSessionId: string,
    statusMessage: string,
  ): Promise<void> {
    await this.updateSyncSession(syncSessionId, {
      status: "failed",
      statusMessage,
      completedAt: new Date(),
    });
  }

  private async writeQueuedJobStatus(jobId: string, statusMessage: string): Promise<void> {
    await writeJobStatusSnapshotAndPublish(redis, jobId, {
      status: statusMessage,
      finished: false,
      createdAt: new Date().toISOString(),
      terminalState: null,
    });
  }

  async getExistingItemIdsInCollection(
    itemIds: string[],
    userId: string,
  ): Promise<{ itemId: string }[]> {
    if (!itemIds || itemIds.length === 0) {
      return [];
    }

    return await db
      .select({ itemId: collection.itemId })
      .from(collection)
      .where(and(inArray(collection.itemId, itemIds), eq(collection.userId, userId)));
  }

  async getExistingItemsByExternalIds(
    externalIds: number[],
  ): Promise<{ id: string; externalId: number; title: string }[]> {
    if (!externalIds || externalIds.length === 0) {
      return [];
    }

    const existingItems = await db
      .select({ id: item.id, externalId: item.externalId, title: item.title })
      .from(item)
      .where(and(eq(item.source, "mfc"), inArray(item.externalId, externalIds)));

    return existingItems.filter(
      (existingItem): existingItem is { id: string; externalId: number; title: string } =>
        existingItem.externalId !== null,
    );
  }

  async getExistingItemsWithReleases(itemIds: string[]): Promise<{
    items: { id: string; title: string }[];
    releases: Map<string, string>;
    releaseDates: Map<string, string>;
  }> {
    if (!itemIds || itemIds.length === 0) {
      return { items: [], releases: new Map(), releaseDates: new Map() };
    }

    const items = await db
      .select({ id: item.id, title: item.title })
      .from(item)
      .where(inArray(item.id, itemIds));

    const releases = new Map<string, string>();
    const releaseDates = new Map<string, string>();
    const releaseResult = await db
      .selectDistinctOn([item_release.itemId], {
        itemId: item_release.itemId,
        releaseId: item_release.id,
        releaseDate: item_release.date,
      })
      .from(item_release)
      .where(inArray(item_release.itemId, itemIds))
      .orderBy(item_release.itemId, desc(item_release.date), desc(item_release.createdAt));

    for (const row of releaseResult) {
      releases.set(row.itemId, row.releaseId);
      const releaseDate = toDateOnlyString(row.releaseDate);
      if (releaseDate) {
        releaseDates.set(row.itemId, releaseDate);
      }
    }

    return { items, releases, releaseDates };
  }

  async getOrderByIdForUser(orderId: string, userId: string) {
    const [existingOrder] = await db
      .select()
      .from(order)
      .where(and(eq(order.id, orderId), eq(order.userId, userId)));

    return existingOrder ?? null;
  }

  async insertToCollectionAndOrders(
    collectionItems: CollectionInsertType[],
    orderItems?: OrderInsertType[],
  ): Promise<void> {
    await db.transaction(async (tx) => {
      if (orderItems && orderItems.length > 0) {
        await tx.insert(order).values(orderItems);
        await tx.insert(collection).values(collectionItems);
      } else {
        await tx.insert(collection).values(collectionItems);
      }
    });
  }

  assignOrderIds(items: InternalCsvItem[]): InternalCsvItem[] {
    return items.map((item) => ({
      ...item,
      orderId: item.status === "Ordered" ? createId() : item.orderId,
    }));
  }

  async processItems(items: InternalCsvItem[], userId: string) {
    const itemExternalIds = items.map((item: InternalCsvItem) => item.itemExternalId);

    const existingItems = await this.getExistingItemsByExternalIds(itemExternalIds);
    const existingItemIds = existingItems.map((existingItem) => existingItem.id);

    const idsInCollection = await this.getExistingItemIdsInCollection(existingItemIds, userId);

    const idsInCollectionSet = new Set(
      idsInCollection.map((collectionItem) => collectionItem.itemId),
    );

    const externalIdToInternalId = new Map(
      existingItems.map((existingItem) => [existingItem.externalId, existingItem.id]),
    );

    const itemsNeedingInsert = existingItems.filter(
      (existingItem) => !idsInCollectionSet.has(existingItem.id),
    );

    const itemIdsNeedingInsert = itemsNeedingInsert.map((existingItem) => existingItem.id);

    const { releases: existingItemsReleases, releaseDates: existingItemsReleaseDates } =
      await this.getExistingItemsWithReleases(itemIdsNeedingInsert);

    const csvItemsToInsert = items.filter((item: InternalCsvItem) =>
      itemsNeedingInsert.some((existingItem) => existingItem.externalId === item.itemExternalId),
    );

    const idsToScrape = itemExternalIds.filter(
      (externalId) => !existingItems.some((existingItem) => existingItem.externalId === externalId),
    );
    const csvItemsToScrape = items.filter((item: InternalCsvItem) =>
      idsToScrape.includes(item.itemExternalId),
    );

    const orderItems: OrderInsertType[] = [];
    csvItemsToInsert.forEach((item) => {
      if (item.status === "Ordered") {
        const itemTitle = existingItems.find(
          (existingItem) => existingItem.externalId === item.itemExternalId,
        )?.title;
        const itemId = externalIdToInternalId.get(item.itemExternalId);

        if (itemId) {
          orderItems.push({
            id: item.orderId!,
            userId: userId,
            title: itemTitle ? itemTitle : `Order ${item.orderId}`,
            shop: item.shop,
            orderDate: item.orderDate,
            releaseDate: existingItemsReleaseDates.get(itemId) ?? null,
            paymentDate: item.payment_date,
            shippingDate: item.shipping_date,
            collectionDate: item.collecting_date,
            shippingMethod: item.shipping_method,
          });
        }
      }
    });

    const collectionItems = csvItemsToInsert
      .map((i): CollectionInsertType | null => {
        const internalItemId = externalIdToInternalId.get(i.itemExternalId);
        if (!internalItemId) {
          return null;
        }

        return {
          userId: userId,
          itemId: internalItemId,
          status: i.status,
          count: i.count,
          score: i.score && i.score.trim() !== "" ? i.score : "0.0",
          paymentDate: i.payment_date,
          shippingDate: i.shipping_date,
          collectionDate: i.collecting_date,
          price: i.price && i.price.trim() !== "" ? parseMoneyToMinorUnits(i.price) : 0,
          shop: i.shop,
          shippingMethod: i.shipping_method,
          notes: i.note,
          releaseId: existingItemsReleases.get(internalItemId) ?? null,
          orderId: i.orderId,
          orderDate: i.orderDate,
        };
      })
      .filter((item): item is CollectionInsertType => item !== null);

    return {
      collectionItems,
      orderItems,
      csvItemsToScrape,
      existingItemExternalIds: csvItemsToInsert.map((i) => i.itemExternalId),
    };
  }

  async queueCSVSyncJob(
    items: InternalCsvItem[],
    userId: string,
    syncSessionId: string,
    existingCount: number,
  ) {
    let queuedJobId: string | null = null;
    try {
      const job = await syncQueue.add(
        "sync-job",
        {
          type: "csv" as const,
          userId: userId,
          syncSessionId,
          existingCount,
          items: items,
        },
        {
          removeOnComplete: true,
          removeOnFail: true,
          jobId: createId(),
        },
      );

      if (!job?.id) {
        throw new Error("FAILED_TO_QUEUE_CSV_SYNC_JOB");
      }

      queuedJobId = job.id;
      const { error: jobStatusError } = await tryCatch(
        this.writeQueuedJobStatus(
          job.id,
          "Your CSV sync job has been added to queue. Please wait...",
        ),
      );

      if (jobStatusError) {
        await job.remove().catch(() => undefined);
        throw new Error("FAILED_TO_SET_JOB_STATUS_IN_REDIS");
      }

      const updated = await this.updateSyncSession(syncSessionId, {
        jobId: job.id,
      });
      if (!updated) {
        await job.remove().catch(() => undefined);
        throw new Error("SYNC_SESSION_NOT_FOUND");
      }

      return job.id;
    } catch (error) {
      const failureMessage =
        error instanceof Error && error.message === "FAILED_TO_SET_JOB_STATUS_IN_REDIS"
          ? "Sync failed before processing started: unable to initialize job status."
          : "Sync failed before processing started: unable to queue job.";
      await this.markSyncSessionAsFailed(syncSessionId, failureMessage);

      if (queuedJobId) {
        const queuedJob = await syncQueue.getJob(queuedJobId);
        await queuedJob?.remove().catch(() => undefined);
      }
      throw error;
    }
  }

  async queueOrderSyncJob(
    userId: string,
    order: UpdatedSyncOrder,
    itemsToScrape: UpdatedSyncOrderItem[],
    itemsToInsert: UpdatedSyncOrderItem[],
    syncSessionId: string,
    existingCount: number,
  ) {
    return this.queueOrderLikeSyncJob({
      type: "order",
      userId,
      order,
      itemsToScrape,
      itemsToInsert,
      syncSessionId,
      existingCount,
      queueErrorCode: "FAILED_TO_QUEUE_ORDER_SYNC_JOB",
      statusMessage: "Your order sync job has been added to queue. Please wait...",
    });
  }

  async queueOrderItemSyncJob(
    userId: string,
    order: UpdatedSyncOrder,
    itemsToScrape: UpdatedSyncOrderItem[],
    itemsToInsert: UpdatedSyncOrderItem[],
    syncSessionId: string,
    existingCount: number,
  ) {
    return this.queueOrderLikeSyncJob({
      type: "order-item",
      userId,
      order,
      itemsToScrape,
      itemsToInsert,
      syncSessionId,
      existingCount,
      queueErrorCode: "FAILED_TO_QUEUE_ORDER_ITEM_SYNC_JOB",
      statusMessage: "Your order item sync job has been added to queue. Please wait...",
    });
  }

  private async queueOrderLikeSyncJob(params: {
    readonly type: "order" | "order-item";
    readonly userId: string;
    readonly order: UpdatedSyncOrder;
    readonly itemsToScrape: UpdatedSyncOrderItem[];
    readonly itemsToInsert: UpdatedSyncOrderItem[];
    readonly syncSessionId: string;
    readonly existingCount: number;
    readonly queueErrorCode:
      | "FAILED_TO_QUEUE_ORDER_SYNC_JOB"
      | "FAILED_TO_QUEUE_ORDER_ITEM_SYNC_JOB";
    readonly statusMessage: string;
  }) {
    // `order` and `order-item` jobs share the same worker payload shape. The worker decides
    // whether to create or append based on `type`, so this helper keeps the queue contract in sync.
    let queuedJobId: string | null = null;
    try {
      const job = await syncQueue.add(
        "sync-job",
        {
          type: params.type,
          userId: params.userId,
          syncSessionId: params.syncSessionId,
          order: {
            details: params.order,
            itemsToScrape: params.itemsToScrape,
            itemsToInsert: params.itemsToInsert,
            existingCount: params.existingCount,
          },
        },
        {
          removeOnComplete: true,
          removeOnFail: true,
          jobId: createId(),
        },
      );

      if (!job?.id) {
        throw new Error(params.queueErrorCode);
      }

      queuedJobId = job.id;
      const { error: jobStatusError } = await tryCatch(
        this.writeQueuedJobStatus(job.id, params.statusMessage),
      );

      if (jobStatusError) {
        await job.remove().catch(() => undefined);
        throw new Error("FAILED_TO_SET_JOB_STATUS_IN_REDIS");
      }

      const updated = await this.updateSyncSession(params.syncSessionId, {
        jobId: job.id,
      });
      if (!updated) {
        await job.remove().catch(() => undefined);
        throw new Error("SYNC_SESSION_NOT_FOUND");
      }

      return job.id;
    } catch (error) {
      const failureMessage =
        error instanceof Error && error.message === "FAILED_TO_SET_JOB_STATUS_IN_REDIS"
          ? "Sync failed before processing started: unable to initialize job status."
          : "Sync failed before processing started: unable to queue job.";
      await this.markSyncSessionAsFailed(params.syncSessionId, failureMessage);

      if (queuedJobId) {
        const queuedJob = await syncQueue.getJob(queuedJobId);
        await queuedJob?.remove().catch(() => undefined);
      }
      throw error;
    }
  }

  async queueCollectionSyncJob(
    userId: string,
    itemsToScrape: UpdatedSyncCollection[],
    itemsToInsert: UpdatedSyncCollection[],
    syncSessionId: string,
    existingCount: number,
  ) {
    let queuedJobId: string | null = null;
    try {
      const job = await syncQueue.add(
        "sync-job",
        {
          type: "collection" as const,
          userId: userId,
          syncSessionId,
          collection: {
            itemsToScrape: itemsToScrape,
            itemsToInsert: itemsToInsert,
            existingCount,
          },
        },
        {
          removeOnComplete: true,
          removeOnFail: true,
          jobId: createId(),
        },
      );

      if (!job?.id) {
        throw new Error("FAILED_TO_QUEUE_COLLECTION_SYNC_JOB");
      }

      queuedJobId = job.id;
      const { error: jobStatusError } = await tryCatch(
        this.writeQueuedJobStatus(
          job.id,
          "Your collection sync job has been added to queue. Please wait...",
        ),
      );

      if (jobStatusError) {
        await job.remove().catch(() => undefined);
        throw new Error("FAILED_TO_SET_JOB_STATUS_IN_REDIS");
      }

      const updated = await this.updateSyncSession(syncSessionId, {
        jobId: job.id,
      });
      if (!updated) {
        await job.remove().catch(() => undefined);
        throw new Error("SYNC_SESSION_NOT_FOUND");
      }

      return job.id;
    } catch (error) {
      const failureMessage =
        error instanceof Error && error.message === "FAILED_TO_SET_JOB_STATUS_IN_REDIS"
          ? "Sync failed before processing started: unable to initialize job status."
          : "Sync failed before processing started: unable to queue job.";
      await this.markSyncSessionAsFailed(syncSessionId, failureMessage);

      if (queuedJobId) {
        const queuedJob = await syncQueue.getJob(queuedJobId);
        await queuedJob?.remove().catch(() => undefined);
      }
      throw error;
    }
  }

  async getJobStatus(jobId: string, userId: string): Promise<SyncJobStatus> {
    const cached = await redis.get(getJobStatusSnapshotKey(jobId));
    if (cached) {
      const parsedStatus = parseJobStatusPayload(cached);

      if (parsedStatus) {
        if (parsedStatus.finished && parsedStatus.terminalState === null) {
          const [cachedSession] = await db
            .select({ status: syncSession.status })
            .from(syncSession)
            .where(and(eq(syncSession.jobId, jobId), eq(syncSession.userId, userId)));

          if (cachedSession) {
            return {
              ...parsedStatus,
              terminalState: this.deriveTerminalStateFromSessionStatus(cachedSession.status),
            };
          }
        }

        return syncJobStatusSchema.parse(parsedStatus);
      }

      createLogger({
        action: "sync.getJobStatus",
        outcome: "warn",
        jobId,
        message: "Corrupt Redis job status cache; falling back to DB",
      }).emit();
    }

    // Redis key expired — fall back to the persistent sync session record
    const [session] = await db
      .select({
        status: syncSession.status,
        statusMessage: syncSession.statusMessage,
        createdAt: syncSession.createdAt,
      })
      .from(syncSession)
      .where(and(eq(syncSession.jobId, jobId), eq(syncSession.userId, userId)));

    if (!session) {
      throw new Error("SYNC_JOB_NOT_FOUND");
    }

    const finishedStatuses: ReadonlySet<SyncSessionStatus> = new Set([
      "completed",
      "failed",
      "partial",
    ]);
    const finished = finishedStatuses.has(session.status);

    const statusMessage = session.statusMessage ? session.statusMessage : `Sync ${session.status}`;

    const terminalState = finished
      ? this.deriveTerminalStateFromSessionStatus(session.status)
      : null;

    return {
      status: statusMessage,
      finished,
      createdAt: session.createdAt.toISOString(),
      terminalState,
    };
  }

  // ── Sync Session Methods ──────────────────────────────────────────────

  async createSyncSession(
    userId: string,
    syncType: SyncType,
    itemExternalIds: readonly number[],
    options?: {
      readonly orderId?: string;
      readonly orderPayload?: UpdatedSyncOrder;
      readonly itemMetadata?: ReadonlyMap<number, Record<string, unknown>>;
      readonly existingItemExternalIds?: readonly number[];
    },
  ): Promise<string> {
    const sessionId = createId();
    const existingIds = options?.existingItemExternalIds ?? [];

    await db.transaction(async (tx) => {
      await tx.insert(syncSession).values({
        id: sessionId,
        userId,
        syncType,
        orderId: options?.orderId ?? null,
        orderPayload: options?.orderPayload ?? null,
        totalItems: itemExternalIds.length + existingIds.length,
        successCount: existingIds.length,
      });

      const pendingRows = itemExternalIds.map((externalId) => ({
        syncSessionId: sessionId,
        itemExternalId: externalId,
        metadata: options?.itemMetadata?.get(externalId) ?? null,
      }));

      const scrapedRows = existingIds.map((externalId) => ({
        syncSessionId: sessionId,
        itemExternalId: externalId,
        status: "scraped" as const,
        metadata: options?.itemMetadata?.get(externalId) ?? null,
      }));

      const allRows = [...pendingRows, ...scrapedRows];
      if (allRows.length > 0) {
        await tx.insert(syncSessionItem).values(allRows);
      }
    });

    return sessionId;
  }

  async getSyncSessions(
    userId: string,
    page: number,
    limit: number,
    statusFilter?: readonly SyncSessionStatus[],
    syncTypeFilter?: readonly SyncType[],
  ): Promise<{ sessions: DbSyncSessionRow[]; total: number }> {
    const offset = (page - 1) * limit;

    const conditions = [eq(syncSession.userId, userId)];
    if (statusFilter && statusFilter.length > 0)
      conditions.push(inArray(syncSession.status, statusFilter));
    if (syncTypeFilter && syncTypeFilter.length > 0)
      conditions.push(inArray(syncSession.syncType, syncTypeFilter));
    const whereClause = and(...conditions);

    const [sessions, [{ total }]] = await Promise.all([
      db
        .select()
        .from(syncSession)
        .where(whereClause)
        .orderBy(
          sql`CASE WHEN ${syncSession.status} IN ('pending', 'processing') THEN 0 ELSE 1 END`,
          desc(syncSession.createdAt),
        )
        .limit(limit)
        .offset(offset),
      db.select({ total: count() }).from(syncSession).where(whereClause),
    ]);

    return { sessions, total };
  }

  async getSyncSessionDetail(
    sessionId: string,
    userId: string,
    page?: number,
    limit?: number,
  ): Promise<{
    session: DbSyncSessionRow;
    items: DbEnrichedSyncSessionItemRow[];
    totalItems: number;
  } | null> {
    const [session] = await db
      .select()
      .from(syncSession)
      .where(and(eq(syncSession.id, sessionId), eq(syncSession.userId, userId)));

    if (!session) return null;

    const baseQuery = db
      .select({
        id: syncSessionItem.id,
        syncSessionId: syncSessionItem.syncSessionId,
        itemExternalId: syncSessionItem.itemExternalId,
        metadata: syncSessionItem.metadata,
        status: syncSessionItem.status,
        errorReason: syncSessionItem.errorReason,
        retryCount: syncSessionItem.retryCount,
        createdAt: syncSessionItem.createdAt,
        updatedAt: syncSessionItem.updatedAt,
        itemId: item.id,
        itemTitle: item.title,
        itemImage: item.image,
      })
      .from(syncSessionItem)
      .leftJoin(
        item,
        and(eq(item.externalId, syncSessionItem.itemExternalId), eq(item.source, "mfc")),
      )
      .where(eq(syncSessionItem.syncSessionId, sessionId))
      .orderBy(syncSessionItem.createdAt);

    const countQuery = db
      .select({ total: count() })
      .from(syncSessionItem)
      .where(eq(syncSessionItem.syncSessionId, sessionId));

    const usePagination = page !== undefined && limit !== undefined;
    const offset = usePagination ? (page - 1) * limit : 0;

    const [rows, [{ total }]] = await Promise.all([
      usePagination ? baseQuery.limit(limit).offset(offset) : baseQuery,
      countQuery,
    ]);

    const items: DbEnrichedSyncSessionItemRow[] = rows.map((row) => ({
      ...row,
      itemId: row.itemId ?? null,
      itemTitle: row.itemTitle ?? null,
      itemImage: row.itemImage ?? null,
    }));

    return { session, items, totalItems: total };
  }

  async updateSyncSession(
    sessionId: string,
    updates: Readonly<SyncSessionUpdatePayload>,
  ): Promise<boolean> {
    const result = await db
      .update(syncSession)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(syncSession.id, sessionId))
      .returning({ id: syncSession.id });
    return result.length > 0;
  }

  async updateSyncSessionItem(
    syncSessionId: string,
    itemExternalId: number,
    itemStatus: SyncSessionItemStatus,
    errorReason?: string,
  ): Promise<void> {
    await db
      .update(syncSessionItem)
      .set({
        status: itemStatus,
        errorReason: errorReason ?? null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(syncSessionItem.syncSessionId, syncSessionId),
          eq(syncSessionItem.itemExternalId, itemExternalId),
        ),
      );
  }

  async retryFailedItems(
    sessionId: string,
    userId: string,
  ): Promise<{ jobId: string; itemCount: number }> {
    const [sessionData] = await db
      .select()
      .from(syncSession)
      .where(and(eq(syncSession.id, sessionId), eq(syncSession.userId, userId)));

    if (!sessionData) throw new Error("SYNC_SESSION_NOT_FOUND");

    // Atomically claim failed rows via UPDATE ... RETURNING. This prevents stale
    // pre-read snapshots and ensures concurrent retry calls cannot claim the same rows.
    const itemsToRetry = await db.transaction(async (tx) => {
      const claimedRows = await tx
        .update(syncSessionItem)
        .set({
          status: "pending",
          errorReason: null,
          retryCount: sql`${syncSessionItem.retryCount} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(eq(syncSessionItem.syncSessionId, sessionId), eq(syncSessionItem.status, "failed")),
        )
        .returning();

      if (claimedRows.length === 0) throw new Error("NO_FAILED_ITEMS_TO_RETRY");

      await tx
        .update(syncSession)
        .set({
          status: "processing",
          completedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(syncSession.id, sessionId));

      return [...claimedRows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    });

    const retryExternalIds = itemsToRetry.map((i) => i.itemExternalId);
    let queuedJobId: string | null = null;

    try {
      const jobData = await this.buildRetryJobData(
        sessionData.syncType,
        userId,
        sessionId,
        itemsToRetry,
        sessionData.orderId,
        sessionData.orderPayload,
        sessionData.successCount,
      );

      const job = await syncQueue.add("sync-job", jobData, {
        removeOnComplete: true,
        removeOnFail: true,
        jobId: createId(),
      });

      if (!job?.id) throw new Error("FAILED_TO_QUEUE_RETRY_JOB");
      queuedJobId = job.id;

      const { error: jobStatusError } = await tryCatch(
        this.writeQueuedJobStatus(job.id, `Retrying ${retryExternalIds.length} failed items...`),
      );

      if (jobStatusError) {
        await job.remove().catch(() => undefined);
        throw new Error("FAILED_TO_SET_JOB_STATUS_IN_REDIS");
      }

      const updated = await this.updateSyncSession(sessionId, {
        jobId: job.id,
      });
      if (!updated) {
        await job.remove().catch(() => undefined);
        throw new Error("SYNC_SESSION_NOT_FOUND");
      }

      return { jobId: job.id, itemCount: retryExternalIds.length };
    } catch (error) {
      await db.transaction(async (tx) => {
        if (retryExternalIds.length > 0) {
          await tx
            .update(syncSessionItem)
            .set({
              status: "failed",
              errorReason: "Retry failed before processing started",
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(syncSessionItem.syncSessionId, sessionId),
                inArray(syncSessionItem.itemExternalId, retryExternalIds),
                eq(syncSessionItem.status, "pending"),
              ),
            );
        }

        const failureMessage =
          error instanceof Error && error.message === "ORDER_NOT_FOUND_FOR_RETRY"
            ? "Retry failed before processing started: original order is no longer available."
            : error instanceof Error && error.message === "FAILED_TO_SET_JOB_STATUS_IN_REDIS"
              ? "Retry failed before processing started: unable to initialize job status."
              : "Retry failed before processing started: unable to queue retry job.";

        await tx
          .update(syncSession)
          .set({
            status: "failed",
            statusMessage: failureMessage,
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(syncSession.id, sessionId));
      });

      if (queuedJobId) {
        const queuedJob = await syncQueue.getJob(queuedJobId);
        await queuedJob?.remove().catch(() => undefined);
      }
      throw error;
    }
  }

  private async buildRetryJobData(
    syncType: SyncType,
    userId: string,
    syncSessionId: string,
    itemsToRetry: readonly DbSyncSessionItemRow[],
    orderId: string | null,
    storedOrderPayload: unknown,
    existingCount: number,
  ) {
    switch (syncType) {
      case "csv":
        return {
          type: "csv" as const,
          userId,
          syncSessionId,
          existingCount,
          items: itemsToRetry.map((item) => {
            const parsed = csvItemMetadataSchema.safeParse(item.metadata);
            if (parsed.success) {
              return { itemExternalId: item.itemExternalId, ...parsed.data };
            }
            return {
              itemExternalId: item.itemExternalId,
              status: "Owned",
              count: 1,
              score: "0.0",
              payment_date: null,
              shipping_date: null,
              collecting_date: null,
              price: "0",
              shop: "",
              shipping_method: "n/a" as const,
              note: "",
              orderId: null,
              orderDate: null,
            };
          }),
        };

      case "order": {
        // orderId may be null if the initial sync failed before the order was created.
        // Fall back to extracting it from the stored order payload.
        let resolvedOrderId = orderId;
        if (!resolvedOrderId && storedOrderPayload) {
          const payloadParsed = syncOrderSchema.safeParse(storedOrderPayload);
          if (payloadParsed.success) resolvedOrderId = payloadParsed.data.id;
        }
        if (!resolvedOrderId) throw new Error("ORDER_NOT_FOUND_FOR_RETRY");

        // Try the order table first (exists when at least one item succeeded).
        // Fall back to the stored payload (covers total scrape failure).
        const [existingOrder] = await db.select().from(order).where(eq(order.id, resolvedOrderId));

        let orderDetails: UpdatedSyncOrder;
        if (existingOrder) {
          orderDetails = {
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
        } else {
          const parsedPayload = syncOrderSchema.safeParse(storedOrderPayload);
          if (!parsedPayload.success) throw new Error("ORDER_NOT_FOUND_FOR_RETRY");
          orderDetails = parsedPayload.data;
        }

        return {
          type: "order" as const,
          userId,
          syncSessionId,
          order: {
            details: orderDetails,
            existingCount,
            itemsToScrape: itemsToRetry.map((item) => {
              const parsed = orderItemMetadataSchema.safeParse(item.metadata);
              if (parsed.success) {
                return {
                  userId,
                  orderId: resolvedOrderId,
                  releaseId: null,
                  itemId: null,
                  itemExternalId: item.itemExternalId,
                  ...parsed.data,
                };
              }
              return {
                userId,
                orderId: resolvedOrderId,
                releaseId: null,
                itemId: null,
                itemExternalId: item.itemExternalId,
                price: 0,
                count: 1,
                status: "Ordered" as const,
                condition: "New" as const,
                shippingMethod: "n/a" as const,
                orderDate: orderDetails.orderDate,
                paymentDate: orderDetails.paymentDate,
                shippingDate: orderDetails.shippingDate,
                collectionDate: orderDetails.collectionDate,
              };
            }),
            itemsToInsert: [],
          },
        };
      }

      case "order-item": {
        let resolvedOrderId = orderId;
        if (!resolvedOrderId && storedOrderPayload) {
          const payloadParsed = syncOrderSchema.safeParse(storedOrderPayload);
          if (payloadParsed.success) resolvedOrderId = payloadParsed.data.id;
        }
        if (!resolvedOrderId) throw new Error("ORDER_NOT_FOUND_FOR_RETRY");

        const existingOrder = await this.getOrderByIdForUser(resolvedOrderId, userId);
        if (!existingOrder) throw new Error("ORDER_NOT_FOUND_FOR_RETRY");

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

        return {
          type: "order-item" as const,
          userId,
          syncSessionId,
          order: {
            details: orderDetails,
            existingCount,
            itemsToScrape: itemsToRetry.map((item) => {
              const parsed = orderItemMetadataSchema.safeParse(item.metadata);
              if (parsed.success) {
                return {
                  userId,
                  orderId: resolvedOrderId,
                  releaseId: null,
                  itemId: null,
                  itemExternalId: item.itemExternalId,
                  ...parsed.data,
                };
              }
              return {
                userId,
                orderId: resolvedOrderId,
                releaseId: null,
                itemId: null,
                itemExternalId: item.itemExternalId,
                price: 0,
                count: 1,
                status: existingOrder.status,
                condition: "New" as const,
                shippingMethod: existingOrder.shippingMethod,
                orderDate: existingOrder.orderDate,
                paymentDate: existingOrder.paymentDate,
                shippingDate: existingOrder.shippingDate,
                collectionDate: existingOrder.collectionDate,
              };
            }),
            itemsToInsert: [],
          },
        };
      }

      case "collection":
        return {
          type: "collection" as const,
          userId,
          syncSessionId,
          collection: {
            existingCount,
            itemsToScrape: itemsToRetry.map((item) => {
              const parsed = collectionItemMetadataSchema.safeParse(item.metadata);
              if (parsed.success) {
                return {
                  userId,
                  releaseId: null,
                  itemId: null,
                  itemExternalId: item.itemExternalId,
                  ...parsed.data,
                };
              }
              return {
                userId,
                releaseId: null,
                itemId: null,
                itemExternalId: item.itemExternalId,
                price: 0,
                count: 1,
                score: "0.0",
                shop: "",
                orderDate: null,
                paymentDate: null,
                shippingDate: null,
                collectionDate: null,
                shippingMethod: "n/a" as const,
                tags: [] as string[],
                condition: "New" as const,
                notes: "",
              };
            }),
            itemsToInsert: [],
          },
        };
    }
  }
}

export default new SyncService();
