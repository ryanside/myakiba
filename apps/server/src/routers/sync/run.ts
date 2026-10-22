import { and, count, desc, eq, inArray, ne } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@myakiba/db/client";
import {
  item as itemTable,
  order as orderTable,
  syncSession,
  syncSessionItem,
} from "@myakiba/db/schema/figure";
import type { Tx } from "@myakiba/db/tx";
import { tryCatch } from "@myakiba/utils/result";
import {
  ACTIVE_SYNC_SESSION_STATUS_SET,
  SYNC_SESSION_RETRY_WINDOW_MS,
} from "@myakiba/contracts/sync/constants";
import { SYNC_STATUS_MESSAGES } from "@myakiba/contracts/sync/messages";
import {
  jobDataSchema,
  sessionStatusToPhase,
  sessionStatusToTerminalState,
} from "@myakiba/contracts/sync/schema";
import type { JobData, SyncJobRecentItem, SyncJobStatus } from "@myakiba/contracts/sync/schema";
import type { SyncSessionItemStatus } from "@myakiba/contracts/shared/types";
import { ensureMfcItem, prepareMfcItem } from "@/routers/mfc-items/ingest";
import { fetchedItemRows, idsToFetch, insertItemRows } from "./item-rows";
import type { ItemRows } from "./item-rows";
import { publishJobStatus, queuedJobStatus } from "./job-status";
import type { SyncItemFetchError, SyncItemUpload } from "./model";
import { buildRetryJobData } from "./retry";
import { settleRun } from "./run-state";
import type { RunEnd } from "./run-state";
import SyncService from "./service";

const ITEM_FETCH_ERROR_MESSAGE = {
  mfc_signed_out: "Sign in to MyFigureCollection to import this item",
  hidden_or_missing:
    "MyFigureCollection hides this item. Check your MyFigureCollection content settings",
  challenge_unsolved: "The MyFigureCollection security check was not completed",
  rate_limited: "MyFigureCollection asked us to slow down. Try again later",
  timeout: "MyFigureCollection took too long to answer",
  unexpected_page: "MyFigureCollection showed an unexpected page",
  unknown: "The extension could not fetch this item",
} as const satisfies Record<SyncItemFetchError, string>;

const UNSAVED_ITEM_REASON = "Persistence failed while saving scraped items";
const RECENT_ITEMS_LIMIT = 5;
const ORDER_LOCK_ATTEMPTS = 3;
const OPEN_ITEM_STATUSES = [
  "pending",
  "failed",
] as const satisfies readonly SyncSessionItemStatus[];

const runColumns = {
  id: syncSession.id,
  syncType: syncSession.syncType,
  jobId: syncSession.jobId,
  status: syncSession.status,
  statusMessage: syncSession.statusMessage,
  totalItems: syncSession.totalItems,
  successCount: syncSession.successCount,
  failCount: syncSession.failCount,
  createdAt: syncSession.createdAt,
  updatedAt: syncSession.updatedAt,
};

type RunSession = Awaited<ReturnType<typeof lockSession>>;

type Run = {
  session: NonNullable<RunSession>;
  readonly payload: JobData | null;
  orderLocked: boolean;
  readonly attempt: number;
};

type RunChange = "item" | "queued" | Exclude<RunEnd, "finished"> | null;

type RunStep<T> = { readonly result: T; readonly change: RunChange };

class OrderLockError extends Error {
  readonly retryable: boolean;

  constructor(retryable: boolean) {
    super(retryable ? "ORDER_LOCKED_TOO_LATE" : "ORDER_NOT_FOUND");
    this.name = "OrderLockError";
    this.retryable = retryable;
  }
}

async function lockSession(tx: Tx, sessionId: string) {
  const [session] = await tx
    .select(runColumns)
    .from(syncSession)
    .where(eq(syncSession.id, sessionId))
    .for("update");
  return session;
}

/** Locks the target Order before the session, the order an Order delete takes them in. */
async function lockRun(
  tx: Tx,
  sessionId: string,
  userId: string,
  lockOrder: boolean,
  attempt: number,
): Promise<Run | null> {
  const [peek] = await tx
    .select({ requestPayload: syncSession.requestPayload })
    .from(syncSession)
    .where(and(eq(syncSession.id, sessionId), eq(syncSession.userId, userId)));
  if (!peek) return null;
  const payload = peek.requestPayload;
  let orderLocked = false;
  if (lockOrder && (payload?.type === "order" || payload?.type === "order-item")) {
    const locked = await tx
      .select({ id: orderTable.id })
      .from(orderTable)
      .where(and(eq(orderTable.id, payload.order.details.id), eq(orderTable.userId, userId)))
      .for("update");
    orderLocked = locked.length > 0;
  }
  const session = await lockSession(tx, sessionId);
  if (!session) return null;
  return { session, payload, orderLocked, attempt };
}

async function failOpenItems(tx: Tx, sessionId: string, errorReason: string): Promise<void> {
  await tx
    .update(syncSessionItem)
    .set({ status: "failed", errorReason, updatedAt: new Date() })
    .where(
      and(eq(syncSessionItem.syncSessionId, sessionId), eq(syncSessionItem.status, "pending")),
    );
}

async function recentItems(tx: Tx, run: Run): Promise<SyncJobRecentItem[]> {
  const fetched = new Set(run.payload ? idsToFetch(run.payload) : []);
  const rows = await tx
    .select({
      externalId: syncSessionItem.itemExternalId,
      status: syncSessionItem.status,
      errorReason: syncSessionItem.errorReason,
      updatedAt: syncSessionItem.updatedAt,
      title: itemTable.title,
    })
    .from(syncSessionItem)
    .leftJoin(
      itemTable,
      and(eq(itemTable.source, "mfc"), eq(itemTable.externalId, syncSessionItem.itemExternalId)),
    )
    .where(
      and(eq(syncSessionItem.syncSessionId, run.session.id), ne(syncSessionItem.status, "pending")),
    )
    .orderBy(desc(syncSessionItem.updatedAt), desc(syncSessionItem.id))
    .limit(RECENT_ITEMS_LIMIT * 10);
  const latestByItem = new Map<number, (typeof rows)[number]>();
  for (const row of rows) {
    if (fetched.has(row.externalId) && !latestByItem.has(row.externalId)) {
      latestByItem.set(row.externalId, row);
    }
  }
  return [...latestByItem.values()].slice(0, RECENT_ITEMS_LIMIT).map((row) => ({
    externalId: row.externalId,
    title: row.status === "scraped" ? row.title : null,
    outcome: row.status === "scraped" ? "succeeded" : "failed",
    failureReason: row.status === "scraped" ? null : (row.errorReason ?? null),
    completedAt: row.updatedAt.toISOString(),
  }));
}

async function saveRun(tx: Tx, run: Run, change: Exclude<RunChange, null>): Promise<SyncJobStatus> {
  const { session } = run;
  const rows = await tx
    .select({ status: syncSessionItem.status, total: count() })
    .from(syncSessionItem)
    .where(eq(syncSessionItem.syncSessionId, session.id))
    .groupBy(syncSessionItem.status);
  const counted = (status: SyncSessionItemStatus) =>
    rows.find((row) => row.status === status)?.total ?? 0;
  const successCount = counted("scraped");
  const failCount = counted("failed");
  const pending = counted("pending");
  const now = new Date();
  const progress = {
    processed: successCount + failCount,
    total: session.totalItems,
    succeeded: successCount,
    failed: failCount,
  };

  if (pending > 0) {
    const statusMessage =
      change === "queued"
        ? SYNC_STATUS_MESSAGES.retryQueued
        : SYNC_STATUS_MESSAGES.scraping(progress.processed, progress.total);
    await tx
      .update(syncSession)
      .set({ status: "processing", statusMessage, successCount, failCount, updatedAt: now })
      .where(eq(syncSession.id, session.id));
    run.session = { ...session, status: "processing", statusMessage, successCount, failCount };
    if (change === "queued") return queuedJobStatus(session.jobId ?? session.id, statusMessage);
    return {
      jobId: session.jobId ?? session.id,
      phase: "scraping",
      statusMessage,
      progress,
      recentItems: await recentItems(tx, run),
      error: null,
      startedAt: session.createdAt.toISOString(),
      updatedAt: now.toISOString(),
      terminalState: null,
    };
  }

  const end: RunEnd = change === "order_missing" ? change : "finished";
  const settled = settleRun({ ...session, successCount, failCount }, end);
  await tx
    .update(syncSession)
    .set({
      status: settled.status,
      statusMessage: settled.statusMessage,
      successCount,
      failCount,
      completedAt: now,
      updatedAt: now,
    })
    .where(eq(syncSession.id, session.id));
  run.session = {
    ...session,
    status: settled.status,
    statusMessage: settled.statusMessage,
    successCount,
    failCount,
  };
  return {
    jobId: session.jobId ?? session.id,
    phase: sessionStatusToPhase(settled.status),
    statusMessage: settled.statusMessage,
    progress,
    recentItems: await recentItems(tx, run),
    error: settled.error,
    startedAt: session.createdAt.toISOString(),
    updatedAt: now.toISOString(),
    terminalState: sessionStatusToTerminalState(settled.status),
  };
}

async function withRun<T>(
  sessionId: string,
  userId: string,
  { lockOrder }: { readonly lockOrder: boolean },
  step: (tx: Tx, run: Run) => Promise<RunStep<T>>,
): Promise<T | null> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const done = await db.transaction(async (tx) => {
        const run = await lockRun(tx, sessionId, userId, lockOrder, attempt);
        if (!run) return null;
        const { result, change } = await step(tx, run);
        const snapshot = change === null ? null : await saveRun(tx, run, change);
        return { result, snapshot };
      });
      if (!done) return null;
      if (done.snapshot) await publishJobStatus(done.snapshot, sessionId);
      return done.result;
    } catch (error) {
      if (error instanceof OrderLockError && error.retryable) continue;
      throw error;
    }
  }
}

async function writeItemRows(tx: Tx, run: Run, payload: JobData, rows: ItemRows): Promise<void> {
  if (rows.collectionItems.length === 0) return;
  if ((payload.type === "order" || payload.type === "order-item") && !run.orderLocked) {
    if (payload.type === "order-item") throw new OrderLockError(false);
    if (run.session.successCount > 0) throw new OrderLockError(run.attempt < ORDER_LOCK_ATTEMPTS);
    await tx.insert(orderTable).values(payload.order.details);
    await tx
      .update(syncSession)
      .set({ orderId: payload.order.details.id })
      .where(eq(syncSession.id, run.session.id));
    run.orderLocked = true;
  }
  await insertItemRows(tx, payload.type, rows);
}

const ofItem = (sessionId: string, mfcItemId: number) =>
  and(eq(syncSessionItem.syncSessionId, sessionId), eq(syncSessionItem.itemExternalId, mfcItemId));

async function markImported(tx: Tx, sessionId: string, mfcItemIds: readonly number[]) {
  if (mfcItemIds.length === 0) return;
  await tx
    .update(syncSessionItem)
    .set({ status: "scraped", errorReason: null, updatedAt: new Date() })
    .where(
      and(
        eq(syncSessionItem.syncSessionId, sessionId),
        inArray(syncSessionItem.itemExternalId, [...mfcItemIds]),
        inArray(syncSessionItem.status, OPEN_ITEM_STATUSES),
      ),
    );
}

const isCurrentRun = (run: Run, jobId: string) =>
  run.session.jobId === jobId && ACTIVE_SYNC_SESSION_STATUS_SET.has(run.session.status);

async function recordItemFailure(
  sessionId: string,
  userId: string,
  { jobId, mfcItemId, reason }: { jobId: string; mfcItemId: number; reason: string },
): Promise<"recorded" | "ignored" | null> {
  return withRun<"recorded" | "ignored">(
    sessionId,
    userId,
    { lockOrder: false },
    async (tx, run) => {
      if (!isCurrentRun(run, jobId)) return { result: "ignored", change: null };
      if (run.session.syncType === "item") {
        const [existing] = await SyncService.getExistingItemsWithLatestReleaseByExternalIds(
          [mfcItemId],
          tx,
        );
        if (existing) {
          await markImported(tx, sessionId, [mfcItemId]);
          return { result: "recorded", change: "item" };
        }
      }
      const failed = await tx
        .update(syncSessionItem)
        .set({ status: "failed", errorReason: reason, updatedAt: new Date() })
        .where(and(ofItem(sessionId, mfcItemId), eq(syncSessionItem.status, "pending")))
        .returning({ id: syncSessionItem.id });
      return failed.length > 0
        ? { result: "recorded", change: "item" }
        : { result: "ignored", change: null };
    },
  );
}

async function failRunWithoutOrder(sessionId: string, userId: string): Promise<void> {
  await withRun(sessionId, userId, { lockOrder: false }, async (tx, run) => {
    if (!ACTIVE_SYNC_SESSION_STATUS_SET.has(run.session.status))
      return { result: null, change: null };
    await failOpenItems(tx, sessionId, UNSAVED_ITEM_REASON);
    return { result: null, change: "order_missing" };
  });
}

export type CompleteSyncItemResult = {
  readonly outcome: "imported" | "already_imported" | "failed";
  readonly reason: string | null;
};

/**
 * Imports one fetched item into the run: the Item through the shared ingest, then the
 * user's rows from the stored request. An upload whose item is already imported writes
 * nothing. A success from an older job still imports, because the page it carries is real.
 */
export async function completeSyncItem(
  sessionId: string,
  userId: string,
  { jobId, ...upload }: SyncItemUpload,
): Promise<CompleteSyncItemResult | null> {
  const mfcItemId = upload.mfcItemId;
  const rows = await db
    .select({ status: syncSessionItem.status })
    .from(syncSessionItem)
    .innerJoin(syncSession, eq(syncSession.id, syncSessionItem.syncSessionId))
    .where(and(ofItem(sessionId, mfcItemId), eq(syncSession.userId, userId)));
  if (rows.length === 0) return null;
  if (rows.every((row) => row.status === "scraped")) {
    return { outcome: "already_imported", reason: null };
  }

  const prepared = await prepareMfcItem(db, upload);
  if (prepared.kind === "unreadable") {
    const recorded = await recordItemFailure(sessionId, userId, {
      jobId,
      mfcItemId,
      reason: prepared.message,
    });
    return recorded === null ? null : { outcome: "failed", reason: prepared.message };
  }

  try {
    return await withRun<CompleteSyncItemResult>(
      sessionId,
      userId,
      { lockOrder: true },
      async (tx, run) => {
        const open = await tx
          .select({ id: syncSessionItem.id })
          .from(syncSessionItem)
          .where(
            and(ofItem(sessionId, mfcItemId), inArray(syncSessionItem.status, OPEN_ITEM_STATUSES)),
          );
        if (open.length === 0)
          return { result: { outcome: "already_imported", reason: null }, change: null };

        if (prepared.kind === "parsed") await ensureMfcItem(tx, prepared.page, prepared.stored);
        const [imported] = await SyncService.getExistingItemsWithLatestReleaseByExternalIds(
          [mfcItemId],
          tx,
        );
        if (!imported) throw new Error(`MFC item ${mfcItemId} was not saved`);
        if (!run.payload) throw new Error("SYNC_SESSION_HAS_NO_REQUEST_PAYLOAD");
        await writeItemRows(tx, run, run.payload, fetchedItemRows(run.payload, imported));
        await markImported(tx, sessionId, [mfcItemId]);
        return { result: { outcome: "imported", reason: null }, change: "item" };
      },
    );
  } catch (error) {
    if (error instanceof OrderLockError) {
      await failRunWithoutOrder(sessionId, userId);
      return { outcome: "failed", reason: SYNC_STATUS_MESSAGES.failedPersist };
    }
    await tryCatch(
      recordItemFailure(sessionId, userId, {
        jobId,
        mfcItemId,
        reason: SYNC_STATUS_MESSAGES.failedPersist,
      }),
    );
    throw error;
  }
}

/** Records the extension's failure for one item. A failure from an older job is ignored. */
export async function failSyncItem(
  sessionId: string,
  userId: string,
  { jobId, mfcItemId, error }: { jobId: string; mfcItemId: number; error: SyncItemFetchError },
): Promise<{ readonly outcome: "recorded" | "ignored" } | null> {
  const outcome = await recordItemFailure(sessionId, userId, {
    jobId,
    mfcItemId,
    reason: ITEM_FETCH_ERROR_MESSAGE[error],
  });
  return outcome === null ? null : { outcome };
}

export type RetrySyncRunResult =
  | {
      readonly outcome: "started";
      readonly jobId: string;
      readonly missingMfcItemIds: readonly number[];
    }
  | { readonly outcome: "not_found" }
  | { readonly outcome: "expired" }
  | { readonly outcome: "unavailable" };

const unavailable = { result: { outcome: "unavailable" }, change: null } as const;

function retryRows(retry: JobData): ItemRows {
  switch (retry.type) {
    case "item":
      return { collectionItems: [], orders: [] };
    case "csv":
      return { collectionItems: retry.itemsToInsert, orders: retry.ordersToInsert };
    case "collection":
      return { collectionItems: retry.collection.itemsToInsert, orders: [] };
    case "order":
    case "order-item":
      return { collectionItems: retry.order.itemsToInsert, orders: [] };
  }
}

/**
 * Starts a new run for a session's failed items, under the retry rules. Items already
 * in the Item Database are imported now; the page fetches the rest.
 */
export async function retrySyncRun(sessionId: string, userId: string): Promise<RetrySyncRunResult> {
  const result = await withRun(
    sessionId,
    userId,
    { lockOrder: true },
    async (tx, run): Promise<RunStep<RetrySyncRunResult>> => {
      const { session } = run;
      if (ACTIVE_SYNC_SESSION_STATUS_SET.has(session.status)) return unavailable;
      if (session.status === "completed" || session.failCount === 0 || !run.payload) {
        return unavailable;
      }
      if (session.createdAt.getTime() + SYNC_SESSION_RETRY_WINDOW_MS <= Date.now()) {
        return { result: { outcome: "expired" }, change: null };
      }
      const parsed = jobDataSchema.safeParse(run.payload);
      if (!parsed.success) return unavailable;
      const payload = parsed.data;
      const needsOrder =
        payload.type === "order-item" || (payload.type === "order" && session.successCount > 0);
      if (needsOrder && !run.orderLocked) return unavailable;

      const failed = await tx
        .select({ itemExternalId: syncSessionItem.itemExternalId })
        .from(syncSessionItem)
        .where(
          and(eq(syncSessionItem.syncSessionId, sessionId), eq(syncSessionItem.status, "failed")),
        );
      const failedIds = new Set(failed.map((row) => row.itemExternalId));
      const existing = await SyncService.getExistingItemsWithLatestReleaseByExternalIds(
        [...failedIds],
        tx,
      );
      const retry = buildRetryJobData(payload, failedIds, existing);
      await writeItemRows(tx, run, payload, retryRows(retry));
      const importedIds = existing.map((existingItem) => existingItem.externalId);
      await markImported(tx, sessionId, importedIds);
      await tx
        .update(syncSessionItem)
        .set({ status: "pending", errorReason: null, updatedAt: new Date() })
        .where(
          and(eq(syncSessionItem.syncSessionId, sessionId), eq(syncSessionItem.status, "failed")),
        );

      const jobId = createId();
      await tx
        .update(syncSession)
        .set({ jobId, completedAt: null })
        .where(eq(syncSession.id, sessionId));
      run.session = { ...session, jobId };
      const imported = new Set(importedIds);
      return {
        result: {
          outcome: "started",
          jobId,
          missingMfcItemIds: idsToFetch(retry).filter((id) => !imported.has(id)),
        },
        change: "queued",
      };
    },
  );
  return result ?? { outcome: "not_found" };
}
