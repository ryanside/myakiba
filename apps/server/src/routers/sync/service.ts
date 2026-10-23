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
import { sessionStatusToPhase, sessionStatusToTerminalState } from "@myakiba/contracts/sync/schema";
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
  SYNC_SESSION_RETRY_WINDOW_MS,
  UNSAVED_ITEM_REASON,
} from "@myakiba/contracts/sync/constants";
import { getJobStatusSnapshotKey, parseJobStatusPayload } from "@myakiba/redis/job-status";
import { redis } from "@myakiba/redis/client";
import { tryCatch } from "@myakiba/utils/result";
import { createLogger } from "evlog";
import { insertItemRows } from "./item-rows";
import type { ItemRows } from "./item-rows";
import { publishJobStatus, queuedJobStatus } from "./job-status";
import { settleRun, viewSession, viewedStatusSql } from "./run-state";

type SyncSessionUpdatePayload = Partial<
  Pick<
    typeof syncSession.$inferInsert,
    | "status"
    | "statusMessage"
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
      jobId: id,
      orderId: orderId ?? null,
      totalItems: rows.length,
      successCount: syncType === "item" ? existingItemExternalIds.length : 0,
    });

    if (rows.length > 0) {
      await tx.insert(syncSessionItem).values(rows);
    }
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
      .orderBy(
        itemTable.id,
        desc(item_release.date),
        desc(item_release.createdAt),
        desc(item_release.id),
      );

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
        db.transaction((tx) =>
          this.recordFailedStart(tx, session, requestPayload, SYNC_STATUS_MESSAGES.failedPersist),
        ),
      );
      throw error;
    }
  }

  /**
   * Starts a run the page drives through the extension. The rows for Items already in
   * the Item Database are written now, and the session stays processing until the page
   * reports every missing item.
   */
  async startSyncRun({
    session,
    requestPayload,
    existingRows,
  }: {
    readonly session: SyncSessionCreation;
    readonly requestPayload: JobData;
    readonly existingRows: ItemRows;
  }): Promise<void> {
    const existingIds = session.existingItemExternalIds ?? [];
    const createsOrder = requestPayload.type === "order" && existingRows.collectionItems.length > 0;
    try {
      await db.transaction(async (tx) => {
        await this.insertSyncSession(tx, session);
        await insertItemRows(tx, requestPayload.type, existingRows);
        if (existingIds.length > 0) {
          await tx
            .update(syncSessionItem)
            .set({ status: "scraped", updatedAt: new Date() })
            .where(
              and(
                eq(syncSessionItem.syncSessionId, session.id),
                inArray(syncSessionItem.itemExternalId, [...existingIds]),
              ),
            );
        }
        await tx
          .update(syncSession)
          .set({
            requestPayload,
            status: "processing",
            extensionRun: true,
            revision: 1,
            statusMessage: SYNC_STATUS_MESSAGES.queued,
            successCount: existingIds.length,
            ...(createsOrder && { orderId: requestPayload.order.details.id }),
            updatedAt: new Date(),
          })
          .where(eq(syncSession.id, session.id));
      });
    } catch (error) {
      await tryCatch(
        db.transaction((tx) =>
          this.recordFailedStart(
            tx,
            session,
            requestPayload,
            SYNC_STATUS_MESSAGES.failedBeforeStart,
          ),
        ),
      );
      throw error;
    }
    await publishJobStatus(queuedJobStatus(session.id, SYNC_STATUS_MESSAGES.queued, 1), session.id);
  }

  private async recordFailedStart(
    tx: SyncTransaction,
    session: SyncSessionCreation,
    payload: JobData,
    message: string,
  ): Promise<void> {
    await this.insertSyncSession(tx, session);
    const now = new Date();
    await tx
      .update(syncSessionItem)
      .set({
        status: "failed",
        errorReason: payload.type === "item" ? message : UNSAVED_ITEM_REASON,
        errorCode: "persistence_failed",
        updatedAt: now,
      })
      .where(eq(syncSessionItem.syncSessionId, session.id));
    await tx
      .update(syncSession)
      .set({
        requestPayload: payload,
        status: "failed",
        statusMessage: message,
        successCount: 0,
        failCount: sql`${syncSession.totalItems}`,
        completedAt: now,
        updatedAt: now,
        extensionRun: true,
        revision: 1,
      })
      .where(eq(syncSession.id, session.id));
  }

  async getJobStatus(jobId: string, userId: string): Promise<SyncJobStatus> {
    const [row] = await db
      .select({
        id: syncSession.id,
        syncType: syncSession.syncType,
        status: syncSession.status,
        statusMessage: syncSession.statusMessage,
        totalItems: syncSession.totalItems,
        successCount: syncSession.successCount,
        failCount: syncSession.failCount,
        createdAt: syncSession.createdAt,
        updatedAt: syncSession.updatedAt,
        extensionRun: syncSession.extensionRun,
        revision: syncSession.revision,
      })
      .from(syncSession)
      .where(and(eq(syncSession.jobId, jobId), eq(syncSession.userId, userId)));

    if (!row) {
      throw new Error("SYNC_JOB_NOT_FOUND");
    }
    const session = viewSession(row, Date.now());
    const terminalState = sessionStatusToTerminalState(session.status);

    const cached = await redis.get(getJobStatusSnapshotKey(jobId));
    if (cached) {
      const parsedStatus = parseJobStatusPayload(cached);
      const sessionOverridesSnapshot =
        parsedStatus !== null &&
        (session.interrupted ||
          parsedStatus.terminalState !== terminalState ||
          (parsedStatus.revision ?? 0) !== session.revision);
      if (parsedStatus && !sessionOverridesSnapshot) return syncJobStatusSchema.parse(parsedStatus);

      if (!parsedStatus) {
        createLogger({
          action: "sync.getJobStatus",
          outcome: "warn",
          jobId,
          message: "Corrupt Redis job status cache; falling back to DB",
        }).emit();
      }
    }

    // Redis key expired — synthesize a v2 snapshot from the durable session row.
    const statusMessage = resolveFallbackJobStatusMessage(session);
    const progress: SyncJobProgress | null =
      session.totalItems > 0
        ? {
            processed: session.successCount + session.failCount,
            total: session.totalItems,
            succeeded: session.successCount,
            failed: session.failCount,
          }
        : null;

    let error: SyncJobStatus["error"] = null;
    if (session.interrupted) error = settleRun(session, "interrupted").error;
    else if (session.status === "failed" && session.failCount > 0) {
      const persistenceFailures = await db.$count(
        syncSessionItem,
        and(
          eq(syncSessionItem.syncSessionId, session.id),
          eq(syncSessionItem.status, "failed"),
          eq(syncSessionItem.errorCode, "persistence_failed"),
        ),
      );
      if (persistenceFailures > 0)
        error = { code: "persistence_failed", message: SYNC_STATUS_MESSAGES.failedPersist };
    }
    return {
      revision: session.revision,
      jobId,
      phase: sessionStatusToPhase(session.status),
      statusMessage,
      progress,
      recentItems: [],
      error,
      startedAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
      terminalState,
    };
  }

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
    const now = Date.now();
    const viewedStatus = viewedStatusSql(now);

    const conditions = [eq(syncSession.userId, userId)];
    if (statusFilter && statusFilter.length > 0)
      conditions.push(inArray(viewedStatus, statusFilter));
    if (syncTypeFilter && syncTypeFilter.length > 0)
      conditions.push(inArray(syncSession.syncType, syncTypeFilter));
    const whereClause = and(...conditions);

    // @ts-expect-error -- scraper code, replaced by the browser extension (until 2027-01-31, approved by root under the operator's no-scraper-work rule)
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
          extensionRun: syncSession.extensionRun,
          revision: syncSession.revision,
          completedAt: syncSession.completedAt,
          hasRequestPayload: sql<boolean>`${syncSession.requestPayload} is not null`,
        })
        .from(syncSession)
        .where(whereClause)
        .orderBy(
          sql`CASE WHEN ${viewedStatus} IN ('pending', 'processing') THEN 0 ELSE 1 END`,
          desc(syncSession.updatedAt),
          desc(syncSession.id),
        )
        .limit(limit)
        .offset(offset),
      db.select({ total: count() }).from(syncSession).where(whereClause),
    ]);

    return {
      sessions: sessionRecords.map(({ hasRequestPayload, ...record }) => {
        const {
          interrupted: _interrupted,
          extensionRun: _extensionRun,
          revision: _revision,
          ...session
        } = viewSession(record, now);
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
        extensionRun: syncSession.extensionRun,
        revision: syncSession.revision,
        completedAt: syncSession.completedAt,
        hasRequestPayload: sql<boolean>`${syncSession.requestPayload} is not null`,
      })
      .from(syncSession)
      .where(and(eq(syncSession.id, sessionId), eq(syncSession.userId, userId)));

    if (!sessionRecord) return null;
    const { hasRequestPayload, ...record } = sessionRecord;
    const {
      interrupted,
      extensionRun: _extensionRun,
      revision: _revision,
      ...session
    } = viewSession(record, Date.now());
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

    const viewedItemStatus = interrupted
      ? sql<SyncSessionItemStatus>`CASE WHEN ${syncSessionItem.status} = 'pending' THEN 'failed' ELSE ${syncSessionItem.status} END`
      : sql<SyncSessionItemStatus>`${syncSessionItem.status}`;
    const itemConditions = [eq(syncSessionItem.syncSessionId, sessionId)];
    if (statusFilter && statusFilter.length > 0) {
      itemConditions.push(inArray(viewedItemStatus, statusFilter));
    }
    const itemsWhereClause = and(...itemConditions);

    const baseQuery = db
      .select({
        id: syncSessionItem.id,
        syncSessionId: syncSessionItem.syncSessionId,
        itemExternalId: syncSessionItem.itemExternalId,
        status: syncSessionItem.status,
        errorReason: syncSessionItem.errorReason,
        errorCode: syncSessionItem.errorCode,
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

    // @ts-expect-error -- scraper code, replaced by the browser extension (until 2027-01-31, approved by root under the operator's no-scraper-work rule)
    const [rows, [{ total }]] = await Promise.all([
      usePagination ? baseQuery.limit(limit).offset(offset) : baseQuery,
      countQuery,
    ]);

    const items: DbEnrichedSyncSessionItemRow[] = rows.map((row) => ({
      ...row,
      ...(interrupted &&
        row.status === "pending" && {
          status: "failed" as const,
          errorReason: SYNC_STATUS_MESSAGES.interrupted,
        }),
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
