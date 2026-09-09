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
  JobData,
  SyncJobProgress,
  QueuedCollectionItem,
  NormalizedInternalCsvItem,
  UpdatedSyncCollection,
  UpdatedSyncOrder,
  UpdatedSyncOrderItem,
} from "@myakiba/contracts/sync/schema";
import { sessionStatusToPhase, sessionStatusToTerminalState } from "@myakiba/contracts/sync/schema";
import type { SyncJobStatus, CollectionInsertType, ExistingItemWithLatestRelease } from "./model";
import type { OrderInsertType } from "../orders/model";
import type {
  SyncSessionItemStatus,
  SyncSessionStatus,
  SyncType,
} from "@myakiba/contracts/shared/types";
import { SYNC_STATUS_MESSAGES } from "@myakiba/contracts/sync/messages";
import { SYNC_QUEUE_NAME } from "@myakiba/contracts/sync/constants";
import { Queue } from "bullmq";
import { createId } from "@paralleldrive/cuid2";
import { env } from "@myakiba/env/server";
import { tryCatch } from "@myakiba/utils/result";
import {
  getJobStatusSnapshotKey,
  parseJobStatusPayload,
  writeJobStatusSnapshotAndPublish,
} from "@myakiba/redis/job-status";
import { redis } from "@myakiba/redis/client";
import { createLogger } from "evlog";
import { prepareCsvItems } from "./csv";

const syncQueue = new Queue<JobData>(SYNC_QUEUE_NAME, {
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
    queue: { name: SYNC_QUEUE_NAME },
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
  private async failPendingSyncSession(
    syncSessionId: string,
    statusMessage: string,
  ): Promise<void> {
    const failed = await db.transaction(async (tx) => {
      const [session] = await tx
        .update(syncSession)
        .set({
          status: sql`CASE WHEN ${syncSession.successCount} > 0 THEN 'partial' ELSE 'failed' END`,
          statusMessage,
          failCount: sql`${syncSession.totalItems} - ${syncSession.successCount}`,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(syncSession.id, syncSessionId), eq(syncSession.status, "pending")))
        .returning({ id: syncSession.id });
      if (!session) return false;

      await tx
        .update(syncSessionItem)
        .set({
          status: "failed",
          errorReason: statusMessage,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(syncSessionItem.syncSessionId, syncSessionId),
            eq(syncSessionItem.status, "pending"),
          ),
        );
      return true;
    });
    if (failed) await redis.del(getJobStatusSnapshotKey(syncSessionId)).catch(() => {});
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

  async getOrderByIdForUser(orderId: string, userId: string) {
    const [existingOrder] = await db
      .select()
      .from(orderTable)
      .where(and(eq(orderTable.id, orderId), eq(orderTable.userId, userId)));

    return existingOrder ?? null;
  }

  async completeSyncSessionWithoutWorker({
    collectionItems,
    orderItems = [],
    syncSessionId,
    orderId,
  }: {
    readonly collectionItems: CollectionInsertType[];
    readonly orderItems?: OrderInsertType[];
    readonly syncSessionId: string;
    readonly orderId?: string;
  }): Promise<void> {
    try {
      await db.transaction(async (tx) => {
        if (orderItems.length > 0) {
          await tx.insert(orderTable).values(orderItems);
        }
        await tx.insert(collectionTable).values(collectionItems);

        await tx
          .update(syncSessionItem)
          .set({ status: "scraped", errorReason: null, updatedAt: new Date() })
          .where(
            and(
              eq(syncSessionItem.syncSessionId, syncSessionId),
              eq(syncSessionItem.status, "pending"),
            ),
          );

        await tx
          .update(syncSession)
          .set({
            status: "completed",
            statusMessage: SYNC_STATUS_MESSAGES.insertedWithoutScrape,
            successCount: sql`${syncSession.totalItems}`,
            failCount: 0,
            orderId,
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(syncSession.id, syncSessionId));
      });
    } catch (error) {
      await tryCatch(
        this.failPendingSyncSession(syncSessionId, SYNC_STATUS_MESSAGES.failedPersist),
      );
      throw error;
    }
  }

  async processItems(items: NormalizedInternalCsvItem[], userId: string) {
    const itemExternalIds = items.map((item) => item.itemExternalId);
    const existingItems =
      await this.getExistingItemsWithLatestReleaseByExternalIds(itemExternalIds);
    return prepareCsvItems(items, existingItems, userId);
  }

  async queueCSVSyncJob(
    items: NormalizedInternalCsvItem[],
    itemsToInsert: QueuedCollectionItem[],
    ordersToInsert: UpdatedSyncOrder[],
    userId: string,
    syncSessionId: string,
  ) {
    try {
      const updated = await this.updateSyncSession(syncSessionId, {
        jobId: syncSessionId,
      });
      if (!updated) throw new Error("SYNC_SESSION_NOT_FOUND");
      await this.writeQueuedJobStatusBestEffort(syncSessionId, syncSessionId);
      await syncQueue.add(
        "sync-job",
        {
          type: "csv",
          payloadVersion: 2,
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

      return syncSessionId;
    } catch (error) {
      await this.failPendingSyncSession(syncSessionId, SYNC_STATUS_MESSAGES.failedBeforeStart);

      throw error;
    }
  }

  async queueOrderLikeSyncJob(params: {
    readonly type: "order" | "order-item";
    readonly userId: string;
    readonly order: UpdatedSyncOrder;
    readonly itemsToScrape: UpdatedSyncOrderItem[];
    readonly itemsToInsert: QueuedCollectionItem[];
    readonly syncSessionId: string;
  }) {
    try {
      const updated = await this.updateSyncSession(params.syncSessionId, {
        jobId: params.syncSessionId,
      });
      if (!updated) throw new Error("SYNC_SESSION_NOT_FOUND");
      await this.writeQueuedJobStatusBestEffort(params.syncSessionId, params.syncSessionId);
      await syncQueue.add(
        "sync-job",
        {
          type: params.type,
          payloadVersion: 2,
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

      return params.syncSessionId;
    } catch (error) {
      await this.failPendingSyncSession(
        params.syncSessionId,
        SYNC_STATUS_MESSAGES.failedBeforeStart,
      );

      throw error;
    }
  }

  async queueCollectionSyncJob(
    userId: string,
    itemsToScrape: UpdatedSyncCollection[],
    itemsToInsert: QueuedCollectionItem[],
    syncSessionId: string,
  ) {
    try {
      const updated = await this.updateSyncSession(syncSessionId, {
        jobId: syncSessionId,
      });
      if (!updated) throw new Error("SYNC_SESSION_NOT_FOUND");
      await this.writeQueuedJobStatusBestEffort(syncSessionId, syncSessionId);
      await syncQueue.add(
        "sync-job",
        {
          type: "collection",
          payloadVersion: 2,
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

      return syncSessionId;
    } catch (error) {
      await this.failPendingSyncSession(syncSessionId, SYNC_STATUS_MESSAGES.failedBeforeStart);

      throw error;
    }
  }

  async queueItemSyncJob(
    userId: string,
    itemExternalIds: number[],
    existingCount: number,
    syncSessionId: string,
  ) {
    try {
      // Save the job ID before queueing the job so the worker can find the session.
      const updated = await this.updateSyncSession(syncSessionId, { jobId: syncSessionId });
      if (!updated) throw new Error("SYNC_SESSION_NOT_FOUND");
      await this.writeQueuedJobStatusBestEffort(syncSessionId, syncSessionId);
      await syncQueue.add(
        "sync-job",
        {
          type: "item",
          payloadVersion: 2,
          userId,
          syncSessionId,
          itemExternalIds,
          existingCount,
        },
        {
          removeOnComplete: true,
          removeOnFail: true,
          jobId: syncSessionId,
        },
      );
      return syncSessionId;
    } catch (error) {
      await this.failPendingSyncSession(syncSessionId, SYNC_STATUS_MESSAGES.failedBeforeStart);
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

  // Sync session methods

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
    const existingIdSet = new Set(existingIds);
    // Number row IDs in submitted order so history keeps that order when sorted by createdAt and id.
    const rows =
      syncType === "item"
        ? itemExternalIds.map((externalId, index) => ({
            id: `${sessionId}-${String(index).padStart(2, "0")}`,
            syncSessionId: sessionId,
            itemExternalId: externalId,
            status: existingIdSet.has(externalId) ? ("scraped" as const) : ("pending" as const),
          }))
        : [...itemExternalIds, ...existingIds].map((externalId) => ({
            syncSessionId: sessionId,
            itemExternalId: externalId,
          }));

    await db.transaction(async (tx) => {
      await tx.insert(syncSession).values({
        id: sessionId,
        userId,
        syncType,
        orderId: options?.orderId ?? null,
        totalItems: rows.length,
        successCount: syncType === "item" ? existingIds.length : 0,
      });

      if (rows.length > 0) {
        await tx.insert(syncSessionItem).values(rows);
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
    statusFilter?: readonly SyncSessionItemStatus[],
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

    const itemConditions = [eq(syncSessionItem.syncSessionId, sessionId)];
    if (statusFilter && statusFilter.length > 0) {
      itemConditions.push(inArray(syncSessionItem.status, statusFilter));
    }
    const itemsWhereClause = and(...itemConditions);

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
      .where(itemsWhereClause)
      .orderBy(syncSessionItem.createdAt, syncSessionItem.id);

    const countQuery = db.select({ total: count() }).from(syncSessionItem).where(itemsWhereClause);

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
