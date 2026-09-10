import { db } from "@myakiba/db/client";
import { advanceOrderReleaseDatesForCollectionItems } from "@myakiba/db/order-release-date";
import {
  item as itemTable,
  collection as collectionTable,
  item_release,
  order as orderTable,
  syncSession,
  syncSessionItem,
} from "@myakiba/db/schema/figure";
import type { DbEnrichedSyncSessionItemRow } from "@myakiba/db/schema/figure";
import { and, inArray, eq, desc, count, sql } from "drizzle-orm";
import { syncJobStatusSchema } from "./model";
import type { JobData, SyncJobProgress } from "@myakiba/contracts/sync/schema";
import {
  jobDataSchema,
  sessionStatusToPhase,
  sessionStatusToTerminalState,
} from "@myakiba/contracts/sync/schema";
import type { SyncSessionRow } from "@myakiba/contracts/sync/types";
import type { SyncJobStatus, CollectionInsertType, ExistingItemWithLatestRelease } from "./model";
import type { OrderInsertType } from "../orders/model";
import type {
  SyncSessionItemStatus,
  SyncSessionStatus,
  SyncType,
} from "@myakiba/contracts/shared/types";
import { SYNC_STATUS_MESSAGES } from "@myakiba/contracts/sync/messages";
import {
  ACTIVE_SYNC_SESSION_STATUS_SET,
  SYNC_QUEUE_NAME,
  SYNC_SESSION_RETRY_WINDOW_MS,
} from "@myakiba/contracts/sync/constants";
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
import { buildRetryJobData } from "./retry";

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
    | "status"
    | "statusMessage"
    | "jobId"
    | "orderId"
    | "successCount"
    | "failCount"
    | "completedAt"
    | "requestPayload"
  >
>;

type SyncTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

type SyncSessionCreation = {
  readonly id: string;
  readonly userId: string;
  readonly syncType: SyncType;
  readonly itemExternalIds: readonly number[];
  readonly orderId?: string;
  readonly existingItemExternalIds?: readonly number[];
};

type RetrySyncSessionResult =
  | { readonly outcome: "queued"; readonly jobId: string }
  | { readonly outcome: "not_found" }
  | { readonly outcome: "expired" }
  | { readonly outcome: "unavailable" };

type RetrySyncSessionPreparation =
  | Exclude<RetrySyncSessionResult, { readonly outcome: "queued" }>
  | {
      readonly outcome: "prepared";
      readonly jobId: string;
      readonly jobData: JobData;
    };

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
  private async insertSyncSession(
    tx: SyncTransaction,
    {
      id,
      userId,
      syncType,
      itemExternalIds,
      orderId,
      existingItemExternalIds = [],
    }: SyncSessionCreation,
  ): Promise<void> {
    const existingIdSet = new Set(existingItemExternalIds);
    // Number row IDs in submitted order so history keeps that order when sorted by createdAt and id.
    const rows =
      syncType === "item"
        ? itemExternalIds.map((externalId, index) => ({
            id: `${id}-${String(index).padStart(2, "0")}`,
            syncSessionId: id,
            itemExternalId: externalId,
            status: existingIdSet.has(externalId) ? ("scraped" as const) : ("pending" as const),
          }))
        : [...itemExternalIds, ...existingItemExternalIds].map((externalId) => ({
            syncSessionId: id,
            itemExternalId: externalId,
          }));

    await tx.insert(syncSession).values({
      id,
      userId,
      syncType,
      orderId: orderId ?? null,
      totalItems: rows.length,
      successCount: syncType === "item" ? existingItemExternalIds.length : 0,
    });

    if (rows.length > 0) {
      await tx.insert(syncSessionItem).values(rows);
    }
  }

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
    database: Pick<typeof db, "selectDistinctOn"> = db,
  ): Promise<readonly ExistingItemWithLatestRelease[]> {
    if (externalIds.length === 0) {
      return [];
    }

    const existingItems = await database
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
    session,
    collectionItems,
    orderItems = [],
    requestPayload,
  }: {
    readonly session: SyncSessionCreation;
    readonly collectionItems: CollectionInsertType[];
    readonly orderItems?: OrderInsertType[];
    readonly requestPayload: JobData;
  }): Promise<void> {
    const syncSessionId = session.id;
    try {
      const orderId =
        requestPayload.type === "order" || requestPayload.type === "order-item"
          ? requestPayload.order.details.id
          : undefined;

      await db.transaction(async (tx) => {
        await this.insertSyncSession(tx, session);

        if (orderItems.length > 0) {
          await tx.insert(orderTable).values(orderItems);
        }

        const insertedCollectionItems = await tx
          .insert(collectionTable)
          .values(collectionItems)
          .returning({ id: collectionTable.id });

        if (requestPayload.type === "order-item") {
          await advanceOrderReleaseDatesForCollectionItems(
            tx,
            insertedCollectionItems.map(({ id }) => id),
          );
        }

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
            requestPayload,
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
        db.transaction(async (tx) => {
          await this.insertSyncSession(tx, session);
          await tx
            .update(syncSessionItem)
            .set({
              status: "failed",
              errorReason: SYNC_STATUS_MESSAGES.failedPersist,
              updatedAt: new Date(),
            })
            .where(eq(syncSessionItem.syncSessionId, syncSessionId));
          await tx
            .update(syncSession)
            .set({
              requestPayload,
              status: "failed",
              statusMessage: SYNC_STATUS_MESSAGES.failedPersist,
              failCount: sql`${syncSession.totalItems}`,
              completedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(syncSession.id, syncSessionId));
        }),
      );
      throw error;
    }
  }

  async queueSyncJob(jobData: JobData): Promise<string> {
    const jobId = jobData.syncSessionId;

    try {
      // Save the job ID before queueing the job so the worker can find the session.
      const updated = await this.updateSyncSession(jobData.syncSessionId, {
        jobId,
        requestPayload: jobData,
      });
      if (!updated) throw new Error("SYNC_SESSION_NOT_FOUND");
      await this.writeQueuedJobStatusBestEffort(jobId, jobData.syncSessionId);
      await syncQueue.add("sync-job", jobData, {
        removeOnComplete: true,
        removeOnFail: true,
        jobId,
      });

      return jobId;
    } catch (error) {
      await this.failPendingSyncSession(
        jobData.syncSessionId,
        SYNC_STATUS_MESSAGES.failedBeforeStart,
      );
      throw error;
    }
  }

  async retrySyncSession(sessionId: string, userId: string): Promise<RetrySyncSessionResult> {
    const prepared = await db.transaction(async (tx): Promise<RetrySyncSessionPreparation> => {
      const [session] = await tx
        .select()
        .from(syncSession)
        .where(and(eq(syncSession.id, sessionId), eq(syncSession.userId, userId)))
        .for("update");

      if (!session) return { outcome: "not_found" };
      if (ACTIVE_SYNC_SESSION_STATUS_SET.has(session.status)) {
        return { outcome: "unavailable" };
      }
      if (session.status === "completed" || session.failCount === 0 || !session.requestPayload) {
        return { outcome: "unavailable" };
      }
      if (session.createdAt.getTime() + SYNC_SESSION_RETRY_WINDOW_MS <= Date.now()) {
        return { outcome: "expired" };
      }

      const parsedPayload = jobDataSchema.safeParse(session.requestPayload);
      if (!parsedPayload.success) return { outcome: "unavailable" };

      if (
        parsedPayload.data.type === "order-item" ||
        (parsedPayload.data.type === "order" && session.successCount > 0)
      ) {
        const [existingOrder] = await tx
          .select({ id: orderTable.id })
          .from(orderTable)
          .where(
            and(
              eq(orderTable.id, parsedPayload.data.order.details.id),
              eq(orderTable.userId, userId),
            ),
          );
        if (!existingOrder) return { outcome: "unavailable" };
      }

      const failedItems = await tx
        .select({ itemExternalId: syncSessionItem.itemExternalId })
        .from(syncSessionItem)
        .where(
          and(eq(syncSessionItem.syncSessionId, sessionId), eq(syncSessionItem.status, "failed")),
        );
      const failedItemExternalIds = new Set(failedItems.map((item) => item.itemExternalId));
      const existingItems =
        parsedPayload.data.type === "item"
          ? []
          : await this.getExistingItemsWithLatestReleaseByExternalIds(
              [...failedItemExternalIds],
              tx,
            );
      const jobData = buildRetryJobData(parsedPayload.data, failedItemExternalIds, existingItems);

      const jobId = createId();
      await tx
        .update(syncSessionItem)
        .set({ status: "pending", errorReason: null, updatedAt: new Date() })
        .where(
          and(eq(syncSessionItem.syncSessionId, sessionId), eq(syncSessionItem.status, "failed")),
        );
      await tx
        .update(syncSession)
        .set({
          jobId,
          status: "pending",
          statusMessage: SYNC_STATUS_MESSAGES.retryQueued,
          failCount: 0,
          completedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(syncSession.id, sessionId));

      return { outcome: "prepared", jobId, jobData };
    });

    if (prepared.outcome !== "prepared") return prepared;

    try {
      await syncQueue.add("sync-job", prepared.jobData, {
        removeOnComplete: true,
        removeOnFail: true,
        jobId: prepared.jobId,
      });
      return { outcome: "queued", jobId: prepared.jobId };
    } catch (error) {
      await tryCatch(
        this.failPendingSyncSession(sessionId, SYNC_STATUS_MESSAGES.failedBeforeStart),
      );
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

  async createSyncSession(session: SyncSessionCreation): Promise<void> {
    await db.transaction(async (tx) => {
      await this.insertSyncSession(tx, session);
    });
  }

  async getSyncSessions(
    userId: string,
    page: number,
    limit: number,
    statusFilter?: readonly SyncSessionStatus[],
    syncTypeFilter?: readonly SyncType[],
  ): Promise<{ sessions: SyncSessionRow[]; total: number }> {
    const offset = (page - 1) * limit;

    const conditions = [eq(syncSession.userId, userId)];
    if (statusFilter && statusFilter.length > 0)
      conditions.push(inArray(syncSession.status, statusFilter));
    if (syncTypeFilter && syncTypeFilter.length > 0)
      conditions.push(inArray(syncSession.syncType, syncTypeFilter));
    const whereClause = and(...conditions);

    const [sessionRecords, [{ total }]] = await Promise.all([
      db
        .select({
          id: syncSession.id,
          userId: syncSession.userId,
          syncType: syncSession.syncType,
          jobId: syncSession.jobId,
          status: syncSession.status,
          statusMessage: syncSession.statusMessage,
          orderId: syncSession.orderId,
          totalItems: syncSession.totalItems,
          successCount: syncSession.successCount,
          failCount: syncSession.failCount,
          createdAt: syncSession.createdAt,
          updatedAt: syncSession.updatedAt,
          completedAt: syncSession.completedAt,
          hasRequestPayload: sql<boolean>`${syncSession.requestPayload} is not null`,
        })
        .from(syncSession)
        .where(whereClause)
        .orderBy(
          sql`CASE WHEN ${syncSession.status} IN ('pending', 'processing') THEN 0 ELSE 1 END`,
          desc(syncSession.updatedAt),
          desc(syncSession.id),
        )
        .limit(limit)
        .offset(offset),
      db.select({ total: count() }).from(syncSession).where(whereClause),
    ]);

    const now = Date.now();
    return {
      sessions: sessionRecords.map(({ hasRequestPayload, ...session }) => {
        const targetOrderIsAvailable =
          !(
            session.syncType === "order-item" ||
            (session.syncType === "order" && session.successCount > 0)
          ) || session.orderId !== null;

        return {
          ...session,
          retrySupported: hasRequestPayload,
          canRetry:
            hasRequestPayload &&
            targetOrderIsAvailable &&
            session.failCount > 0 &&
            (session.status === "failed" || session.status === "partial") &&
            session.createdAt.getTime() + SYNC_SESSION_RETRY_WINDOW_MS > now,
          isRetrying:
            session.jobId !== null &&
            session.jobId !== session.id &&
            ACTIVE_SYNC_SESSION_STATUS_SET.has(session.status),
        };
      }),
      total,
    };
  }

  async getSyncSessionDetail(
    sessionId: string,
    userId: string,
    page?: number,
    limit?: number,
    statusFilter?: readonly SyncSessionItemStatus[],
  ): Promise<{
    session: SyncSessionRow;
    items: DbEnrichedSyncSessionItemRow[];
    totalItems: number;
  } | null> {
    const [sessionRecord] = await db
      .select({
        id: syncSession.id,
        userId: syncSession.userId,
        syncType: syncSession.syncType,
        jobId: syncSession.jobId,
        status: syncSession.status,
        statusMessage: syncSession.statusMessage,
        orderId: syncSession.orderId,
        totalItems: syncSession.totalItems,
        successCount: syncSession.successCount,
        failCount: syncSession.failCount,
        createdAt: syncSession.createdAt,
        updatedAt: syncSession.updatedAt,
        completedAt: syncSession.completedAt,
        hasRequestPayload: sql<boolean>`${syncSession.requestPayload} is not null`,
      })
      .from(syncSession)
      .where(and(eq(syncSession.id, sessionId), eq(syncSession.userId, userId)));

    if (!sessionRecord) return null;
    const { hasRequestPayload, ...session } = sessionRecord;
    const targetOrderIsAvailable =
      !(
        session.syncType === "order-item" ||
        (session.syncType === "order" && session.successCount > 0)
      ) || session.orderId !== null;
    const canRetry =
      hasRequestPayload &&
      targetOrderIsAvailable &&
      session.failCount > 0 &&
      (session.status === "failed" || session.status === "partial") &&
      session.createdAt.getTime() + SYNC_SESSION_RETRY_WINDOW_MS > Date.now();

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

    return {
      session: {
        ...session,
        retrySupported: hasRequestPayload,
        canRetry,
        isRetrying:
          session.jobId !== null &&
          session.jobId !== session.id &&
          ACTIVE_SYNC_SESSION_STATUS_SET.has(session.status),
      },
      items,
      totalItems: total,
    };
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
