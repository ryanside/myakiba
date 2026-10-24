import { Result, panic } from "better-result";
import type { AnyTaggedError } from "better-result";
import type { CommandScope } from "@/domain/kernel";
import { and, count, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import {
  item as itemTable,
  order as orderTable,
  syncSession,
  syncSessionItem,
} from "@myakiba/db/schema/figure";
import type { ReadTx, Tx } from "@myakiba/db/tx";
import {
  ACTIVE_SYNC_SESSION_STATUS_SET,
  SYNC_SESSION_RETRY_WINDOW_MS,
} from "@myakiba/contracts/sync/constants";
import { ITEM_FETCH_ERROR_MESSAGE, SYNC_STATUS_MESSAGES } from "@myakiba/contracts/sync/messages";
import {
  jobDataSchema,
  sessionStatusToPhase,
  sessionStatusToTerminalState,
} from "@myakiba/contracts/sync/schema";
import type { JobData, SyncJobRecentItem } from "@myakiba/contracts/sync/schema";
import type { SyncSessionItemStatus } from "@myakiba/contracts/shared/types";
import { ensureMfcItem } from "@/lib/mfc-item-ingest";
import type { prepareMfcItem } from "@/lib/mfc-item-ingest";
import { PROBLEM_MESSAGE } from "@/lib/errors/mfc-page-rejected";
import { fetchedItemRows, idsToFetch, insertItemRows, retryRows } from "./item-rows";
import type { ItemRows } from "./item-rows";
import { publishJobStatus, queuedJobStatus } from "./job-status";
import type { ServerSyncJobStatus } from "./job-status";
import type { SyncItemFailure, SyncItemUpload } from "./model";
import { buildRetryJobData } from "./retry";
import { isLapsed, persistenceFailure, settleRun } from "./run-state";
import type { RunEnd } from "./run-state";
import SyncService from "./service";
import { SyncOrderAbsent } from "./errors/sync-order-absent";
import type { SyncOrderUnowned } from "./errors/sync-order-unowned";

const RECENT_ITEMS_LIMIT = 5;
export const retryOrderLock = (error: AnyTaggedError, attempt: number) =>
  SyncOrderAbsent.is(error) && error.retryable && attempt < 3;
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
  endCause: syncSession.endCause,
  revision: syncSession.revision,
  orderId: syncSession.orderId,
};

type RunSession = Awaited<ReturnType<typeof lockSession>>;

type Run = {
  session: NonNullable<RunSession>;
  readonly payload: JobData | null;
  orderLocked: boolean;
};

type RunChange = "item" | "queued" | Exclude<RunEnd, "finished"> | null;

type RunStep<T> = { readonly result: T; readonly change: RunChange };

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
  if (lockOrder && payload?.type === "csv") {
    const orderIds = [
      ...new Set([
        ...[...payload.items, ...payload.itemsToInsert].flatMap((row) =>
          row.orderId === null ? [] : [row.orderId],
        ),
        ...payload.ordersToInsert.map((row) => row.id),
      ]),
    ];
    if (orderIds.length > 0) {
      await tx
        .select({ id: orderTable.id })
        .from(orderTable)
        .where(and(inArray(orderTable.id, orderIds), eq(orderTable.userId, userId)))
        .orderBy(orderTable.id)
        .for("update");
    }
  }
  const session = await lockSession(tx, sessionId);
  if (!session) return null;
  return { session, payload, orderLocked };
}

async function failOpenItems(
  tx: Tx,
  sessionId: string,
  errorReason: string,
  errorCode: typeof syncSessionItem.$inferInsert.errorCode = null,
): Promise<void> {
  await tx
    .update(syncSessionItem)
    .set({ status: "failed", errorReason, errorCode, updatedAt: new Date() })
    .where(
      and(eq(syncSessionItem.syncSessionId, sessionId), eq(syncSessionItem.status, "pending")),
    );
}

async function recentItems(tx: Tx, run: Run): Promise<SyncJobRecentItem[]> {
  const fetched = new Set(run.payload ? idsToFetch(run.payload) : []);
  if (fetched.size === 0) return [];
  const distinct = tx
    .selectDistinctOn([syncSessionItem.itemExternalId], {
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
      and(
        eq(syncSessionItem.syncSessionId, run.session.id),
        ne(syncSessionItem.status, "pending"),
        inArray(
          syncSessionItem.itemExternalId,
          sql`(select jsonb_array_elements_text(${JSON.stringify([...fetched])}::text::jsonb)::integer)`,
        ),
      ),
    )
    .orderBy(
      syncSessionItem.itemExternalId,
      desc(syncSessionItem.updatedAt),
      desc(syncSessionItem.id),
    )
    .as("finished_items");
  const rows = await tx
    .select()
    .from(distinct)
    .orderBy(desc(distinct.updatedAt), desc(distinct.externalId))
    .limit(RECENT_ITEMS_LIMIT);
  return rows.map((row) => ({
    externalId: row.externalId,
    title: row.status === "imported" ? row.title : null,
    outcome: row.status === "imported" ? "succeeded" : "failed",
    failureReason: row.status === "imported" ? null : (row.errorReason ?? null),
    completedAt: row.updatedAt.toISOString(),
  }));
}

async function saveRun(
  tx: Tx,
  run: Run,
  change: Exclude<RunChange, null>,
): Promise<ServerSyncJobStatus> {
  const { session } = run;
  const rows = await tx
    .select({ status: syncSessionItem.status, total: count() })
    .from(syncSessionItem)
    .where(eq(syncSessionItem.syncSessionId, session.id))
    .groupBy(syncSessionItem.status);
  const counted = (status: SyncSessionItemStatus) =>
    rows.find((row) => row.status === status)?.total ?? 0;
  const successCount = counted("imported");
  const failCount = counted("failed");
  const pending = counted("pending");
  const now = new Date();
  const revision = session.revision + 1;
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
        : SYNC_STATUS_MESSAGES.importing(progress.processed, progress.total);
    await tx
      .update(syncSession)
      .set({
        status: "processing",
        endCause: null,
        statusMessage,
        successCount,
        failCount,
        updatedAt: now,
        revision,
      })
      .where(eq(syncSession.id, session.id));
    run.session = {
      ...session,
      status: "processing",
      endCause: null,
      statusMessage,
      successCount,
      failCount,
      revision,
    };
    if (change === "queued")
      return queuedJobStatus(session.jobId ?? session.id, statusMessage, revision);
    return {
      revision,
      jobId: session.jobId ?? session.id,
      phase: "importing",
      statusMessage,
      progress,
      recentItems: await recentItems(tx, run),
      error: null,
      startedAt: session.createdAt.toISOString(),
      updatedAt: now.toISOString(),
      terminalState: null,
    };
  }

  const failures = await tx
    .select({ code: syncSessionItem.errorCode })
    .from(syncSessionItem)
    .where(
      and(eq(syncSessionItem.syncSessionId, session.id), eq(syncSessionItem.status, "failed")),
    );
  const persistenceFailed =
    successCount === 0 &&
    failCount > 0 &&
    failures.some((row) => row.code === "persistence_failed");
  let end: RunEnd = "finished";
  if (change === "interrupted" || change === "order_missing") end = change;
  else if (persistenceFailed) end = "persistence_failed";
  const settled = settleRun({ ...session, successCount, failCount }, end);
  await tx
    .update(syncSession)
    .set({
      status: settled.status,
      endCause: end,
      statusMessage: settled.statusMessage,
      successCount,
      failCount,
      revision,
      completedAt: now,
      updatedAt: now,
    })
    .where(eq(syncSession.id, session.id));
  run.session = {
    ...session,
    revision,
    status: settled.status,
    endCause: end,
    statusMessage: settled.statusMessage,
    successCount,
    failCount,
  };
  return {
    revision,
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

/** Saves and publishes the run only when its step answers Ok; an Err rolls the command back. */
async function withRun<T, E = never>(
  scope: CommandScope,
  sessionId: string,
  userId: string,
  { lockOrder }: { readonly lockOrder: boolean },
  step: (tx: Tx, run: Run) => Promise<Result<RunStep<T>, E>>,
): Promise<Result<T | null, E>> {
  const tx = scope.tx;
  const run = await lockRun(tx, sessionId, userId, lockOrder);
  if (!run) return Result.ok(null);
  let snapshot: ServerSyncJobStatus | null = null;
  if (isLapsed(run.session, Date.now())) {
    await failOpenItems(tx, sessionId, SYNC_STATUS_MESSAGES.interrupted);
    snapshot = await saveRun(tx, run, "interrupted");
  }
  const stepped = await step(tx, run);
  if (stepped.isErr()) return Result.err(stepped.error);
  const { result, change } = stepped.value;
  if (change !== null) snapshot = await saveRun(tx, run, change);
  const committed = snapshot;
  if (committed) scope.afterCommit(() => publishJobStatus(committed, sessionId));
  return Result.ok(result);
}

function missingOrder(run: Run): SyncOrderAbsent | null {
  const payload = run.payload;
  if (run.orderLocked || (payload?.type !== "order" && payload?.type !== "order-item")) return null;
  if (payload.type === "order-item" || run.session.successCount > 0) {
    return new SyncOrderAbsent({
      retryable: payload.type === "order" && run.session.orderId !== null,
    });
  }
  return null;
}

async function writeItemRows(
  tx: Tx,
  run: Run,
  payload: JobData,
  rows: ItemRows,
): Promise<Result<void, SyncOrderUnowned>> {
  if (rows.collectionItems.length === 0) return Result.ok();
  if (payload.type === "order" && !run.orderLocked) {
    const written = await insertItemRows(tx, payload.type, {
      ...rows,
      orders: [payload.order.details],
    });
    if (written.isErr()) return written;
    await tx
      .update(syncSession)
      .set({ orderId: payload.order.details.id })
      .where(eq(syncSession.id, run.session.id));
    run.orderLocked = true;
    return Result.ok();
  }
  return insertItemRows(tx, payload.type, rows);
}

const ofItem = (sessionId: string, mfcItemId: number) =>
  and(eq(syncSessionItem.syncSessionId, sessionId), eq(syncSessionItem.itemExternalId, mfcItemId));

async function markImported(tx: Tx, sessionId: string, mfcItemIds: readonly number[]) {
  if (mfcItemIds.length === 0) return;
  await tx
    .update(syncSessionItem)
    .set({ status: "imported", errorReason: null, errorCode: null, updatedAt: new Date() })
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

type ItemFailure = { readonly mfcItemId: number } & (
  | { readonly kind: "reported"; readonly reason: string }
  | { readonly kind: "persistence" }
);

async function recordItemFailure(tx: Tx, run: Run, failure: ItemFailure): Promise<boolean> {
  const { mfcItemId } = failure;
  const sessionId = run.session.id;
  if (run.session.syncType === "item") {
    const [existing] = await SyncService.getExistingItemsWithLatestReleaseByExternalIds(
      [mfcItemId],
      tx,
    );
    if (existing) {
      await markImported(tx, sessionId, [mfcItemId]);
      return true;
    }
  }
  const details =
    failure.kind === "persistence"
      ? persistenceFailure(run.session.syncType)
      : { errorReason: failure.reason, errorCode: null };
  const failed = await tx
    .update(syncSessionItem)
    .set({ status: "failed", ...details, updatedAt: new Date() })
    .where(and(ofItem(sessionId, mfcItemId), eq(syncSessionItem.status, "pending")))
    .returning({ id: syncSessionItem.id });
  return failed.length > 0;
}

export async function recordItemFailures(
  scope: CommandScope,
  sessionId: string,
  userId: string,
  jobId: string,
  failures: readonly ItemFailure[],
): Promise<Result<"recorded" | "ignored" | null, never>> {
  return withRun<"recorded" | "ignored">(
    scope,
    sessionId,
    userId,
    { lockOrder: false },
    async (tx, run) => {
      if (!isCurrentRun(run, jobId)) return Result.ok({ result: "ignored", change: null });
      let changed = false;
      for (const failure of failures) {
        const recorded = await recordItemFailure(tx, run, failure);
        changed = recorded || changed;
      }
      return Result.ok(
        changed ? { result: "recorded", change: "item" } : { result: "ignored", change: null },
      );
    },
  );
}

export async function failRunWithoutOrder(
  scope: CommandScope,
  sessionId: string,
  userId: string,
): Promise<void> {
  await withRun(scope, sessionId, userId, { lockOrder: false }, async (tx, run) => {
    if (!ACTIVE_SYNC_SESSION_STATUS_SET.has(run.session.status)) {
      return Result.ok({ result: null, change: null });
    }
    const failure = persistenceFailure(run.session.syncType);
    await failOpenItems(tx, sessionId, failure.errorReason, failure.errorCode);
    return Result.ok({ result: null, change: "order_missing" });
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
  scope: CommandScope,
  sessionId: string,
  userId: string,
  { jobId, ...upload }: SyncItemUpload,
  prepared: Awaited<ReturnType<typeof prepareMfcItem>>,
): Promise<Result<CompleteSyncItemResult | null, SyncOrderAbsent | SyncOrderUnowned>> {
  const mfcItemId = upload.mfcItemId;
  if (prepared.isErr()) {
    const reason = PROBLEM_MESSAGE[prepared.error.problem.kind];
    const recorded = await recordItemFailures(scope, sessionId, userId, jobId, [
      { mfcItemId, kind: "reported", reason },
    ]);
    return recorded.map((outcome) => (outcome === null ? null : { outcome: "failed", reason }));
  }
  const ready = prepared.value;
  return withRun<CompleteSyncItemResult, SyncOrderAbsent | SyncOrderUnowned>(
    scope,
    sessionId,
    userId,
    { lockOrder: true },
    (tx, run) =>
      Result.gen(async function* () {
        const open = await tx
          .select({ id: syncSessionItem.id })
          .from(syncSessionItem)
          .where(
            and(ofItem(sessionId, mfcItemId), inArray(syncSessionItem.status, OPEN_ITEM_STATUSES)),
          );
        if (open.length === 0) {
          return Result.ok({
            result: { outcome: "already_imported", reason: null },
            change: null,
          } as const);
        }

        const absent = missingOrder(run);
        if (absent) return Result.err(absent);
        if (ready.kind === "parsed") await ensureMfcItem(tx, ready.page, ready.stored);
        const [imported] = await SyncService.getExistingItemsWithLatestReleaseByExternalIds(
          [mfcItemId],
          tx,
        );
        if (!imported) {
          panic(
            `MFC item ${mfcItemId} was not in the item database after its ingest in sync session ${sessionId}`,
          );
        }
        if (!run.payload)
          panic(`Sync session ${sessionId} has no stored request to import item ${mfcItemId} into`);
        yield* Result.await(
          writeItemRows(tx, run, run.payload, fetchedItemRows(run.payload, imported)),
        );
        await markImported(tx, sessionId, [mfcItemId]);
        return Result.ok({
          result: { outcome: "imported", reason: null },
          change: "item",
        } as const);
      }),
  );
}

/** Records fetch failures atomically. Failures from an older job are ignored. */
export async function failSyncItem(
  scope: CommandScope,
  sessionId: string,
  userId: string,
  failure: SyncItemFailure,
): Promise<Result<{ readonly outcome: "recorded" | "ignored" } | null, never>> {
  const failures = "failures" in failure ? failure.failures : [failure];
  const recorded = await recordItemFailures(
    scope,
    sessionId,
    userId,
    failure.jobId,
    failures.map(({ mfcItemId, error }) => ({
      mfcItemId,
      kind: "reported",
      reason: ITEM_FETCH_ERROR_MESSAGE[error],
    })),
  );
  return recorded.map((outcome) => (outcome === null ? null : { outcome }));
}

/** Renews the run's lease. `active` is false once the run ended or a retry replaced it. */
export async function heartbeatSyncRun(
  scope: CommandScope,
  sessionId: string,
  userId: string,
  jobId: string,
): Promise<Result<{ readonly active: boolean } | null, never>> {
  return withRun<{ readonly active: boolean }>(
    scope,
    sessionId,
    userId,
    { lockOrder: false },
    async (tx, run) => {
      if (!isCurrentRun(run, jobId)) return Result.ok({ result: { active: false }, change: null });
      await tx
        .update(syncSession)
        .set({ updatedAt: new Date() })
        .where(eq(syncSession.id, sessionId));
      return Result.ok({ result: { active: true }, change: null });
    },
  );
}

/** Ends the run because its page went away. Its pending items fail and can be retried. */
export async function interruptSyncRun(
  scope: CommandScope,
  sessionId: string,
  userId: string,
  jobId: string,
): Promise<Result<{ readonly outcome: "interrupted" | "ignored" } | null, never>> {
  return withRun<{ readonly outcome: "interrupted" | "ignored" }>(
    scope,
    sessionId,
    userId,
    { lockOrder: false },
    async (tx, run) => {
      if (!isCurrentRun(run, jobId)) {
        return Result.ok({ result: { outcome: "ignored" }, change: null });
      }
      await failOpenItems(tx, sessionId, SYNC_STATUS_MESSAGES.interrupted);
      return Result.ok({ result: { outcome: "interrupted" }, change: "interrupted" });
    },
  );
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

const unavailable = Result.ok({ result: { outcome: "unavailable" }, change: null } as const);

/**
 * Starts a new run for a session's failed items, under the retry rules. Items already
 * in the Item Database are imported now; the page fetches the rest.
 */
export async function retrySyncRun(
  scope: CommandScope,
  sessionId: string,
  userId: string,
): Promise<RetrySyncRunResult> {
  const result = await withRun(
    scope,
    sessionId,
    userId,
    { lockOrder: true },
    async (tx, run): Promise<Result<RunStep<RetrySyncRunResult>, never>> => {
      const { session } = run;
      if (ACTIVE_SYNC_SESSION_STATUS_SET.has(session.status)) return unavailable;
      if (session.status === "completed" || session.failCount === 0 || !run.payload) {
        return unavailable;
      }
      if (session.createdAt.getTime() + SYNC_SESSION_RETRY_WINDOW_MS <= Date.now()) {
        return Result.ok({ result: { outcome: "expired" }, change: null });
      }
      const parsed = jobDataSchema.safeParse(run.payload);
      if (!parsed.success) return unavailable;
      const payload = parsed.data;
      if (missingOrder(run)) return unavailable;

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
      const written = await writeItemRows(tx, run, payload, retryRows(retry));
      if (written.isErr()) {
        panic(
          `Retrying sync session ${sessionId} names Orders the user no longer owns: ${written.error.orderIds.join(", ")}`,
          written.error,
        );
      }
      const importedIds = existing.map((existingItem) => existingItem.externalId);
      await markImported(tx, sessionId, importedIds);
      await tx
        .update(syncSessionItem)
        .set({ status: "pending", errorReason: null, errorCode: null, updatedAt: new Date() })
        .where(
          and(eq(syncSessionItem.syncSessionId, sessionId), eq(syncSessionItem.status, "failed")),
        );

      const jobId = createId();
      await tx
        .update(syncSession)
        .set({ jobId, completedAt: null, endCause: null })
        .where(eq(syncSession.id, sessionId));
      run.session = { ...run.session, jobId, endCause: null };
      const imported = new Set(importedIds);
      return Result.ok({
        result: {
          outcome: "started",
          jobId,
          missingMfcItemIds: idsToFetch(retry).filter((id) => !imported.has(id)),
        },
        change: "queued",
      });
    },
  );
  return result.unwrap() ?? { outcome: "not_found" };
}

export async function syncItemStatus(
  tx: ReadTx,
  sessionId: string,
  userId: string,
  mfcItemId: number,
) {
  return tx
    .select({ status: syncSessionItem.status })
    .from(syncSessionItem)
    .innerJoin(syncSession, eq(syncSession.id, syncSessionItem.syncSessionId))
    .where(and(ofItem(sessionId, mfcItemId), eq(syncSession.userId, userId)));
}
