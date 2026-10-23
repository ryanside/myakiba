import type { ReadTx, Tx } from "@myakiba/db/tx";
import { paginateBy } from "@/domain/kernel";
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
import { and, inArray, eq, desc, sql } from "drizzle-orm";
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
} from "@myakiba/contracts/sync/constants";
import { getJobStatusSnapshotKey, parseJobStatusPayload } from "@myakiba/redis/job-status";
import { redis } from "@myakiba/redis/client";
import { createLogger } from "evlog";
import { insertItemRows } from "./item-rows";
import type { ItemRows } from "./item-rows";
import { publishJobStatus, queuedJobStatus } from "./job-status";
import { persistenceFailure, settleRun, viewSession, viewedStatusSql } from "./run-state";

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

export type SyncSessionCreation = {
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
        : SYNC_STATUS_MESSAGES.failedFetch;
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
    tx: Tx,
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
            status: existingIdSet.has(externalId) ? ("imported" as const) : ("pending" as const),
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
    database: ReadTx,
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

  async getOrderByIdForUser(orderId: string, userId: string, db: ReadTx) {
    const [existingOrder] = await db
      .select()
      .from(orderTable)
      .where(and(eq(orderTable.id, orderId), eq(orderTable.userId, userId)));

    return existingOrder ?? null;
  }

  async completeSyncSessionFromExisting(
    {
      session,
      collectionItems,
      orderItems = [],
      requestPayload,
    }: {
      readonly session: SyncSessionCreation;
      readonly collectionItems: CollectionInsertType[];
      readonly orderItems?: OrderInsertType[];
      readonly requestPayload: JobData;
    },
    tx: Tx,
  ): Promise<void> {
    const syncSessionId = session.id;
    const orderId =
      requestPayload.type === "order" || requestPayload.type === "order-item"
        ? requestPayload.order.details.id
        : undefined;

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
      .set({ status: "imported", errorReason: null, updatedAt: new Date() })
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
        statusMessage: SYNC_STATUS_MESSAGES.insertedFromExisting,
        successCount: sql`${syncSession.totalItems}`,
        failCount: 0,
        orderId,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(syncSession.id, syncSessionId));
  }

  /**
   * Starts a run the page drives through the extension. The rows for Items already in
   * the Item Database are written now, and the session stays processing until the page
   * reports every missing item.
   */
  async startSyncRun(
    {
      session,
      requestPayload,
      existingRows,
    }: {
      readonly session: SyncSessionCreation;
      readonly requestPayload: JobData;
      readonly existingRows: ItemRows;
    },
    tx: Tx,
    afterCommit: (effect: () => Promise<void>) => void,
  ): Promise<void> {
    const existingIds = session.existingItemExternalIds ?? [];
    const createsOrder = requestPayload.type === "order" && existingRows.collectionItems.length > 0;
    await this.insertSyncSession(tx, session);
    await insertItemRows(tx, requestPayload.type, existingRows);
    if (existingIds.length > 0) {
      await tx
        .update(syncSessionItem)
        .set({ status: "imported", updatedAt: new Date() })
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
        revision: 1,
        statusMessage: SYNC_STATUS_MESSAGES.queued,
        successCount: existingIds.length,
        ...(createsOrder && { orderId: requestPayload.order.details.id }),
        updatedAt: new Date(),
      })
      .where(eq(syncSession.id, session.id));
    afterCommit(() =>
      publishJobStatus(queuedJobStatus(session.id, SYNC_STATUS_MESSAGES.queued, 1), session.id),
    );
  }

  async recordFailedStart(
    tx: Tx,
    session: SyncSessionCreation,
    payload: JobData,
    failure: "before_start" | "request_persistence",
  ): Promise<void> {
    const message =
      failure === "before_start"
        ? SYNC_STATUS_MESSAGES.failedBeforeStart
        : SYNC_STATUS_MESSAGES.failedPersist;
    const details =
      failure === "before_start"
        ? { errorReason: message, errorCode: null }
        : { ...persistenceFailure(payload.type), errorReason: message };
    await this.insertSyncSession(tx, session);
    const now = new Date();
    await tx
      .update(syncSessionItem)
      .set({
        status: "failed",
        ...details,
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
        endCause: failure === "before_start" ? "finished" : "persistence_failed",
        revision: 1,
      })
      .where(eq(syncSession.id, session.id));
  }

  async getJobStatus(jobId: string, userId: string, db: ReadTx): Promise<SyncJobStatus> {
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
        endCause: syncSession.endCause,
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

    const end = session.interrupted ? "interrupted" : (session.endCause ?? "finished");
    const error = terminalState === null ? null : settleRun(session, end).error;
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

  async createSyncSession(session: SyncSessionCreation, tx: Tx): Promise<void> {
    await this.insertSyncSession(tx, session);
  }

  async getSyncSessions(
    userId: string,
    page: number,
    limit: number,
    statusFilter: readonly SyncSessionStatus[] | undefined,
    syncTypeFilter: readonly SyncType[] | undefined,
    db: ReadTx,
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

    const pageResult = await paginateBy(
      { tx: db },
      { limit, offset },
      {
        select: {
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
          revision: syncSession.revision,
          completedAt: syncSession.completedAt,
          hasRequestPayload: sql<boolean>`${syncSession.requestPayload} is not null`,
        },
        rows: (fields) => db.select(fields).from(syncSession).where(whereClause).$dynamic(),
        orderBy: [
          [sql`CASE WHEN ${viewedStatus} IN ('pending', 'processing') THEN 0 ELSE 1 END`, "asc"],
          [syncSession.updatedAt, "desc"],
          [syncSession.id, "desc"],
        ],
      },
    );
    const sessionRecords = pageResult.items;

    return {
      sessions: sessionRecords.map(({ hasRequestPayload, ...record }) => {
        const {
          interrupted: _interrupted,
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
      total: pageResult.totalCount,
    };
  }

  async getSyncSessionDetail(
    sessionId: string,
    userId: string,
    page: number | undefined,
    limit: number | undefined,
    statusFilter: readonly SyncSessionItemStatus[] | undefined,
    db: ReadTx,
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
        revision: syncSession.revision,
        completedAt: syncSession.completedAt,
        hasRequestPayload: sql<boolean>`${syncSession.requestPayload} is not null`,
      })
      .from(syncSession)
      .where(and(eq(syncSession.id, sessionId), eq(syncSession.userId, userId)));

    if (!sessionRecord) return null;
    const { hasRequestPayload, ...record } = sessionRecord;
    const { interrupted, revision: _revision, ...session } = viewSession(record, Date.now());
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

    const select = {
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
    };
    const rowsOf = (fields: typeof select) =>
      db
        .select(fields)
        .from(syncSessionItem)
        .leftJoin(
          itemTable,
          and(
            eq(itemTable.externalId, syncSessionItem.itemExternalId),
            eq(itemTable.source, "mfc"),
          ),
        )
        .where(itemsWhereClause)
        .$dynamic();
    const pageResult = await paginateBy(
      { tx: db },
      {
        limit: page !== undefined && limit !== undefined ? limit : 2_147_483_647,
        offset: page !== undefined && limit !== undefined ? (page - 1) * limit : 0,
      },
      {
        select,
        rows: rowsOf,
        orderBy: [
          [syncSessionItem.createdAt, "asc"],
          [syncSessionItem.id, "asc"],
        ],
      },
    );
    const rows = pageResult.items;

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
      totalItems: pageResult.totalCount,
    };
  }

  async updateSyncSession(
    sessionId: string,
    updates: Readonly<SyncSessionUpdatePayload>,
    db: Tx,
  ): Promise<boolean> {
    const result = await db
      .update(syncSession)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(syncSession.id, sessionId))
      .returning({ id: syncSession.id });
    return result.length > 0;
  }
}

export default new SyncService();
