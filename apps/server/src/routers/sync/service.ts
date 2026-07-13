import { db } from "@myakiba/db/client";
import {
  item as itemTable,
  collection as collectionTable,
  item_release,
  order as orderTable,
  syncSession,
  syncSessionItem,
} from "@myakiba/db/schema/figure";
import type { DbEnrichedSyncSessionItemRow, DbSyncSessionRow } from "@myakiba/db/schema/figure";
import { and, inArray, eq, desc, count, sql } from "drizzle-orm";
import { syncJobStatusSchema } from "./model";
import type {
  SyncJobProgress,
  QueuedCollectionItem,
  NormalizedInternalCsvItem,
  UpdatedSyncCollection,
  UpdatedSyncOrder,
  UpdatedSyncOrderItem,
} from "@myakiba/contracts/sync/schema";
import { sessionStatusToPhase, sessionStatusToTerminalState } from "@myakiba/contracts/sync/schema";
import type { SyncJobStatus, CollectionInsertType } from "./model";
import type { OrderInsertType } from "../orders/model";
import type {
  SyncSessionItemStatus,
  SyncSessionStatus,
  SyncType,
} from "@myakiba/contracts/shared/types";
import { SYNC_STATUS_MESSAGES } from "@myakiba/contracts/sync/messages";
import { Queue } from "bullmq";
import { createId } from "@paralleldrive/cuid2";
import { env } from "@myakiba/env/server";
import { parseMoneyToMinorUnits } from "@myakiba/utils/currency";
import { tryCatch } from "@myakiba/utils/result";
import {
  getJobStatusSnapshotKey,
  parseJobStatusPayload,
  writeJobStatusSnapshotAndPublish,
} from "@myakiba/redis/job-status";
import { redis } from "@myakiba/redis/client";
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

type ExistingItemWithLatestRelease = Readonly<{
  id: string;
  externalId: number;
  title: string;
  releaseId: string | null;
  releaseDate: string | null;
}>;

type CsvSyncCandidate = ExistingItemWithLatestRelease &
  Readonly<{
    isInCollection: boolean;
  }>;

const resolveFallbackJobStatusMessage = ({
  status,
  statusMessage,
  totalItems,
  successCount,
  failCount,
}: {
  readonly status: SyncSessionStatus;
  readonly statusMessage: string | null;
  readonly totalItems: number;
  readonly successCount: number;
  readonly failCount: number;
}): string => {
  if (statusMessage) {
    return statusMessage;
  }

  switch (status) {
    case "completed":
      return SYNC_STATUS_MESSAGES.completed(successCount, totalItems);
    case "partial":
      return SYNC_STATUS_MESSAGES.partial(successCount, totalItems, failCount);
    case "failed":
      if (successCount + failCount === 0) {
        return SYNC_STATUS_MESSAGES.failedBeforeStart;
      }
      return successCount > 0
        ? SYNC_STATUS_MESSAGES.failedPersist
        : SYNC_STATUS_MESSAGES.failedScrape;
    case "pending":
      return SYNC_STATUS_MESSAGES.queued;
    case "processing":
      return totalItems > 0
        ? SYNC_STATUS_MESSAGES.starting(totalItems)
        : SYNC_STATUS_MESSAGES.queued;
  }
};

class SyncService {
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
    const now = new Date().toISOString();
    await writeJobStatusSnapshotAndPublish(redis, jobId, {
      jobId,
      phase: "queued",
      statusMessage,
      progress: null,
      recentItems: [],
      error: null,
      startedAt: now,
      updatedAt: now,
      terminalState: null,
    });
  }

  private async writeQueuedJobStatusBestEffort(
    jobId: string,
    syncSessionId: string,
  ): Promise<void> {
    const { error } = await tryCatch(this.writeQueuedJobStatus(jobId, SYNC_STATUS_MESSAGES.queued));
    if (!error) return;

    const cacheLog = createLogger({
      action: "sync.queueStatusCache",
      outcome: "warn",
      jobId,
      syncSessionId,
      message: "Failed to publish queued status; durable session remains available",
    });
    cacheLog.error(error);
    cacheLog.emit();
  }

  async getExistingItemsWithLatestReleaseByExternalIds(
    externalIds: readonly number[],
  ): Promise<readonly ExistingItemWithLatestRelease[]> {
    if (!externalIds || externalIds.length === 0) {
      return [];
    }

    const existingItems = await db
      .selectDistinctOn([itemTable.id], {
        id: itemTable.id,
        externalId: itemTable.externalId,
        title: itemTable.title,
        releaseId: item_release.id,
        releaseDate: item_release.date,
      })
      .from(itemTable)
      .leftJoin(item_release, eq(item_release.itemId, itemTable.id))
      .where(and(eq(itemTable.source, "mfc"), inArray(itemTable.externalId, [...externalIds])))
      .orderBy(itemTable.id, desc(item_release.date), desc(item_release.createdAt));

    return existingItems.filter(
      (existingItem): existingItem is ExistingItemWithLatestRelease =>
        existingItem.externalId !== null,
    );
  }

  async getCsvSyncCandidates(
    externalIds: readonly number[],
    userId: string,
  ): Promise<readonly CsvSyncCandidate[]> {
    if (!externalIds || externalIds.length === 0) {
      return [];
    }

    const existingItems = await db
      .selectDistinctOn([itemTable.id], {
        id: itemTable.id,
        externalId: itemTable.externalId,
        title: itemTable.title,
        releaseId: item_release.id,
        releaseDate: item_release.date,
        isInCollection: sql<boolean>`exists (
          select 1
          from ${collectionTable}
          where ${collectionTable.itemId} = ${itemTable.id}
            and ${collectionTable.userId} = ${userId}
        )`,
      })
      .from(itemTable)
      .leftJoin(item_release, eq(item_release.itemId, itemTable.id))
      .where(and(eq(itemTable.source, "mfc"), inArray(itemTable.externalId, [...externalIds])))
      .orderBy(itemTable.id, desc(item_release.date), desc(item_release.createdAt));

    return existingItems.filter(
      (existingItem): existingItem is CsvSyncCandidate => existingItem.externalId !== null,
    );
  }

  async getOrderByIdForUser(orderId: string, userId: string) {
    const [existingOrder] = await db
      .select()
      .from(orderTable)
      .where(and(eq(orderTable.id, orderId), eq(orderTable.userId, userId)));

    return existingOrder ?? null;
  }

  async insertToCollectionAndOrders(
    collectionItems: CollectionInsertType[],
    orderItems?: OrderInsertType[],
  ): Promise<void> {
    await db.transaction(async (tx) => {
      if (orderItems && orderItems.length > 0) {
        await tx.insert(orderTable).values(orderItems);
        await tx.insert(collectionTable).values(collectionItems);
      } else {
        await tx.insert(collectionTable).values(collectionItems);
      }
    });
  }

  assignOrderIds(
    items: Omit<NormalizedInternalCsvItem, "collectionId">[],
  ): NormalizedInternalCsvItem[] {
    return items.map((item) => ({
      ...item,
      collectionId: createId(),
      orderId: item.status === "Ordered" ? createId() : item.orderId,
    }));
  }

  async processItems(items: NormalizedInternalCsvItem[], userId: string) {
    const itemExternalIds = items.map((item) => item.itemExternalId);

    const existingCandidates = await this.getCsvSyncCandidates(itemExternalIds, userId);

    const existingItems = existingCandidates.map(({ id, externalId, title }) => ({
      id,
      externalId,
      title,
    }));

    const idsInCollectionSet = new Set(
      existingCandidates
        .filter((existingCandidate) => existingCandidate.isInCollection)
        .map((existingCandidate) => existingCandidate.id),
    );

    const externalIdToInternalId = new Map(
      existingItems.map((existingItem) => [existingItem.externalId, existingItem.id]),
    );

    const itemsNeedingInsert = existingItems.filter(
      (existingItem) => !idsInCollectionSet.has(existingItem.id),
    );

    const itemIdsNeedingInsert = itemsNeedingInsert.map((existingItem) => existingItem.id);
    const itemIdsNeedingInsertSet = new Set(itemIdsNeedingInsert);
    const existingItemsReleases = new Map<string, string>();
    const existingItemsReleaseDates = new Map<string, string>();
    for (const existingCandidate of existingCandidates) {
      if (!itemIdsNeedingInsertSet.has(existingCandidate.id)) {
        continue;
      }
      if (existingCandidate.releaseId) {
        existingItemsReleases.set(existingCandidate.id, existingCandidate.releaseId);
      }
      if (existingCandidate.releaseDate) {
        existingItemsReleaseDates.set(existingCandidate.id, existingCandidate.releaseDate);
      }
    }

    const csvItemsToInsert = items.filter((item) =>
      itemsNeedingInsert.some((existingItem) => existingItem.externalId === item.itemExternalId),
    );

    const idsToScrape = new Set(
      itemExternalIds.filter(
        (externalId) =>
          !existingItems.some((existingItem) => existingItem.externalId === externalId),
      ),
    );
    const csvItemsToScrape = items.filter((item) => idsToScrape.has(item.itemExternalId));

    const orderItems: UpdatedSyncOrder[] = [];
    csvItemsToInsert.forEach((item) => {
      if (item.status === "Ordered") {
        const itemTitle = existingItems.find(
          (existingItem) => existingItem.externalId === item.itemExternalId,
        )?.title;
        const itemId = externalIdToInternalId.get(item.itemExternalId);

        if (itemId && item.orderId) {
          orderItems.push({
            id: item.orderId,
            userId,
            status: "Ordered",
            title: itemTitle || `Order ${item.orderId}`,
            shop: item.shop,
            orderDate: item.orderDate,
            releaseDate: existingItemsReleaseDates.get(itemId) ?? null,
            paymentDate: item.payment_date,
            shippingDate: item.shipping_date,
            collectionDate: item.collecting_date,
            shippingMethod: item.shipping_method,
            shippingFee: 0,
            taxes: 0,
            duties: 0,
            tariffs: 0,
            miscFees: 0,
            notes: "",
          });
        }
      }
    });

    const collectionItems = csvItemsToInsert
      .map((i): QueuedCollectionItem | null => {
        const internalItemId = externalIdToInternalId.get(i.itemExternalId);
        if (!internalItemId) {
          return null;
        }

        return {
          id: i.collectionId,
          userId,
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
          tags: [],
          condition: "New",
          notes: i.note,
          releaseId: existingItemsReleases.get(internalItemId) ?? null,
          orderId: i.orderId,
          orderDate: i.orderDate,
        };
      })
      .filter((item): item is QueuedCollectionItem => item !== null);

    return {
      collectionItems,
      orderItems,
      csvItemsToScrape,
      existingItemExternalIds: csvItemsToInsert.map((i) => i.itemExternalId),
    };
  }

  async queueCSVSyncJob(
    items: NormalizedInternalCsvItem[],
    itemsToInsert: QueuedCollectionItem[],
    ordersToInsert: UpdatedSyncOrder[],
    userId: string,
    syncSessionId: string,
  ) {
    let queuedJobId: string | null = null;
    try {
      const job = await syncQueue.add(
        "sync-job",
        {
          type: "csv" as const,
          payloadVersion: 2 as const,
          userId,
          syncSessionId,
          items,
          itemsToInsert,
          ordersToInsert,
        },
        {
          removeOnComplete: true,
          removeOnFail: true,
          jobId: syncSessionId,
        },
      );

      if (!job?.id) {
        throw new Error("FAILED_TO_QUEUE_CSV_SYNC_JOB");
      }

      queuedJobId = job.id;
      const updated = await this.updateSyncSession(syncSessionId, {
        jobId: job.id,
      });
      if (!updated) {
        await job.remove().catch(() => {});
        throw new Error("SYNC_SESSION_NOT_FOUND");
      }

      await this.writeQueuedJobStatusBestEffort(job.id, syncSessionId);

      return job.id;
    } catch (error) {
      await this.markSyncSessionAsFailed(syncSessionId, SYNC_STATUS_MESSAGES.failedBeforeStart);

      if (queuedJobId) {
        const queuedJob = await syncQueue.getJob(queuedJobId);
        await queuedJob?.remove().catch(() => {});
      }
      throw error;
    }
  }

  async queueOrderSyncJob(
    userId: string,
    order: UpdatedSyncOrder,
    itemsToScrape: UpdatedSyncOrderItem[],
    itemsToInsert: QueuedCollectionItem[],
    syncSessionId: string,
  ) {
    return this.queueOrderLikeSyncJob({
      type: "order",
      userId,
      order,
      itemsToScrape,
      itemsToInsert,
      syncSessionId,
      queueErrorCode: "FAILED_TO_QUEUE_ORDER_SYNC_JOB",
    });
  }

  async queueOrderItemSyncJob(
    userId: string,
    order: UpdatedSyncOrder,
    itemsToScrape: UpdatedSyncOrderItem[],
    itemsToInsert: QueuedCollectionItem[],
    syncSessionId: string,
  ) {
    return this.queueOrderLikeSyncJob({
      type: "order-item",
      userId,
      order,
      itemsToScrape,
      itemsToInsert,
      syncSessionId,
      queueErrorCode: "FAILED_TO_QUEUE_ORDER_ITEM_SYNC_JOB",
    });
  }

  private async queueOrderLikeSyncJob(params: {
    readonly type: "order" | "order-item";
    readonly userId: string;
    readonly order: UpdatedSyncOrder;
    readonly itemsToScrape: UpdatedSyncOrderItem[];
    readonly itemsToInsert: QueuedCollectionItem[];
    readonly syncSessionId: string;
    readonly queueErrorCode:
      | "FAILED_TO_QUEUE_ORDER_SYNC_JOB"
      | "FAILED_TO_QUEUE_ORDER_ITEM_SYNC_JOB";
  }) {
    // `order` and `order-item` jobs share the same worker payload shape. The worker decides
    // whether to create or append based on `type`, so this helper keeps the queue contract in sync.
    let queuedJobId: string | null = null;
    try {
      const job = await syncQueue.add(
        "sync-job",
        {
          type: params.type,
          payloadVersion: 2 as const,
          userId: params.userId,
          syncSessionId: params.syncSessionId,
          order: {
            details: params.order,
            itemsToScrape: params.itemsToScrape,
            itemsToInsert: params.itemsToInsert,
          },
        },
        {
          removeOnComplete: true,
          removeOnFail: true,
          jobId: params.syncSessionId,
        },
      );

      if (!job?.id) {
        throw new Error(params.queueErrorCode);
      }

      queuedJobId = job.id;
      const updated = await this.updateSyncSession(params.syncSessionId, {
        jobId: job.id,
      });
      if (!updated) {
        await job.remove().catch(() => {});
        throw new Error("SYNC_SESSION_NOT_FOUND");
      }

      await this.writeQueuedJobStatusBestEffort(job.id, params.syncSessionId);

      return job.id;
    } catch (error) {
      await this.markSyncSessionAsFailed(
        params.syncSessionId,
        SYNC_STATUS_MESSAGES.failedBeforeStart,
      );

      if (queuedJobId) {
        const queuedJob = await syncQueue.getJob(queuedJobId);
        await queuedJob?.remove().catch(() => {});
      }
      throw error;
    }
  }

  async queueCollectionSyncJob(
    userId: string,
    itemsToScrape: UpdatedSyncCollection[],
    itemsToInsert: QueuedCollectionItem[],
    syncSessionId: string,
  ) {
    let queuedJobId: string | null = null;
    try {
      const job = await syncQueue.add(
        "sync-job",
        {
          type: "collection" as const,
          payloadVersion: 2 as const,
          userId,
          syncSessionId,
          collection: {
            itemsToScrape,
            itemsToInsert,
          },
        },
        {
          removeOnComplete: true,
          removeOnFail: true,
          jobId: syncSessionId,
        },
      );

      if (!job?.id) {
        throw new Error("FAILED_TO_QUEUE_COLLECTION_SYNC_JOB");
      }

      queuedJobId = job.id;
      const updated = await this.updateSyncSession(syncSessionId, {
        jobId: job.id,
      });
      if (!updated) {
        await job.remove().catch(() => {});
        throw new Error("SYNC_SESSION_NOT_FOUND");
      }

      await this.writeQueuedJobStatusBestEffort(job.id, syncSessionId);

      return job.id;
    } catch (error) {
      await this.markSyncSessionAsFailed(syncSessionId, SYNC_STATUS_MESSAGES.failedBeforeStart);

      if (queuedJobId) {
        const queuedJob = await syncQueue.getJob(queuedJobId);
        await queuedJob?.remove().catch(() => {});
      }
      throw error;
    }
  }

  async getJobStatus(jobId: string, userId: string): Promise<SyncJobStatus> {
    const [session] = await db
      .select({
        status: syncSession.status,
        statusMessage: syncSession.statusMessage,
        totalItems: syncSession.totalItems,
        successCount: syncSession.successCount,
        failCount: syncSession.failCount,
        createdAt: syncSession.createdAt,
        updatedAt: syncSession.updatedAt,
      })
      .from(syncSession)
      .where(and(eq(syncSession.jobId, jobId), eq(syncSession.userId, userId)));

    if (!session) {
      throw new Error("SYNC_JOB_NOT_FOUND");
    }

    const cached = await redis.get(getJobStatusSnapshotKey(jobId));
    if (cached) {
      const parsedStatus = parseJobStatusPayload(cached);

      if (parsedStatus) {
        // Defensive backfill: if the worker crashed between marking the session
        // terminal and writing a terminal-state snapshot, derive it from the session.
        const isPhaseTerminal =
          parsedStatus.phase === "completed" || parsedStatus.phase === "failed";
        if (isPhaseTerminal && parsedStatus.terminalState === null) {
          return syncJobStatusSchema.parse({
            ...parsedStatus,
            terminalState: sessionStatusToTerminalState(session.status),
          });
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

    // Redis key expired — synthesize a v2 snapshot from the durable session row.
    const statusMessage = resolveFallbackJobStatusMessage(session);
    const terminalState = sessionStatusToTerminalState(session.status);
    const progress: SyncJobProgress | null =
      session.totalItems > 0
        ? {
            processed: session.successCount + session.failCount,
            total: session.totalItems,
            succeeded: session.successCount,
            failed: session.failCount,
          }
        : null;

    return {
      jobId,
      phase: sessionStatusToPhase(session.status),
      statusMessage,
      progress,
      recentItems: [],
      error: null,
      startedAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
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
        totalItems: itemExternalIds.length + existingIds.length,
        successCount: existingIds.length,
      });

      const pendingRows = itemExternalIds.map((externalId) => ({
        syncSessionId: sessionId,
        itemExternalId: externalId,
      }));

      const scrapedRows = existingIds.map((externalId) => ({
        syncSessionId: sessionId,
        itemExternalId: externalId,
        status: "scraped" as const,
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
          desc(syncSession.id),
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
        status: syncSessionItem.status,
        errorReason: syncSessionItem.errorReason,
        createdAt: syncSessionItem.createdAt,
        updatedAt: syncSessionItem.updatedAt,
        itemId: itemTable.id,
        itemTitle: itemTable.title,
        itemImage: itemTable.image,
      })
      .from(syncSessionItem)
      .leftJoin(
        itemTable,
        and(eq(itemTable.externalId, syncSessionItem.itemExternalId), eq(itemTable.source, "mfc")),
      )
      .where(eq(syncSessionItem.syncSessionId, sessionId))
      .orderBy(syncSessionItem.createdAt, syncSessionItem.id);

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
}

export default new SyncService();
