import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { createLogger } from "evlog";
import { db } from "@myakiba/db/client";
import {
  dataTransferImport,
  dataTransferImportItem,
  item as itemTable,
} from "@myakiba/db/schema/figure";
import type { Tx } from "@myakiba/db/tx";
import {
  DATA_TRANSFER_IMPORT_INTERRUPTED_REASON,
  DATA_TRANSFER_IMPORT_LEASE_MS,
  dataTransferImportSchema,
} from "@myakiba/contracts/data-transfer/schema";
import type {
  DataTransferImport,
  DataTransferImportReport,
} from "@myakiba/contracts/data-transfer/schema";
import type { SyncJobRecentItem, SyncJobStatus } from "@myakiba/contracts/sync/schema";
import { redis } from "@myakiba/redis/client";
import { writeJobStatusSnapshotAndPublish } from "@myakiba/redis/job-status";
import { tryCatch } from "@myakiba/utils/result";

const RECENT_ITEMS_LIMIT = 5;
const EMPTY_IMPORT_ERROR = "No orders or collection items could be imported.";
const IMPORTING_ITEMS_MESSAGE = "Importing items from MyFigureCollection…";

type ImportStatus = DataTransferImport["status"];
type ImportPhase = (typeof dataTransferImport.$inferSelect)["phase"];

export const importRowColumns = {
  userId: dataTransferImport.userId,
  importId: dataTransferImport.importId,
  jobId: dataTransferImport.jobId,
  fileName: dataTransferImport.fileName,
  status: dataTransferImport.status,
  phase: dataTransferImport.phase,
  report: dataTransferImport.report,
  importedOrders: dataTransferImport.importedOrders,
  importedCollectionItems: dataTransferImport.importedCollectionItems,
  failedCollectionItems: dataTransferImport.failedCollectionItems,
  totalCollectionItems: dataTransferImport.totalCollectionItems,
  error: dataTransferImport.error,
  startedAt: dataTransferImport.startedAt,
  updatedAt: dataTransferImport.updatedAt,
  heartbeatAt: dataTransferImport.heartbeatAt,
  hasArchive: sql<boolean>`${dataTransferImport.archive} is not null`,
};

type FailureReason = DataTransferImportReport["failureReasons"][number];

type WaitingItems = {
  readonly pendingItems: number;
  readonly pendingRows: number;
  readonly failedRows: number;
  readonly failureReasons: readonly FailureReason[];
};

export type ImportView = {
  readonly row: ImportRow;
  readonly status: ImportStatus;
  readonly phase: ImportPhase;
  readonly error: string | null;
  readonly pendingRows: number;
  readonly failedRows: number;
  readonly report: DataTransferImportReport | null;
};

export const isActive = (status: ImportStatus) => status === "queued" || status === "running";

function leaseLapsed(row: ImportRow, now: Date): boolean {
  if (!isActive(row.status)) return false;
  const lastSeen = row.heartbeatAt ?? row.updatedAt;
  return now.getTime() - lastSeen.getTime() >= DATA_TRANSFER_IMPORT_LEASE_MS;
}

function settledStatus(row: ImportRow, failedRows: number, pendingRows: number) {
  if (failedRows === 0) return { status: "completed", phase: "completed", error: null } as const;
  const succeededRows = row.totalCollectionItems - failedRows - pendingRows;
  if (row.importedOrders + succeededRows > 0) {
    return { status: "partial", phase: "completed", error: null } as const;
  }
  return { status: "failed", phase: "failed", error: EMPTY_IMPORT_ERROR } as const;
}

function viewImport(row: ImportRow, waiting: WaitingItems, now: Date): ImportView {
  const lapsed = leaseLapsed(row, now);
  const stored: ImportView = {
    row,
    status: row.status,
    phase: row.phase,
    error: row.error,
    pendingRows: 0,
    failedRows: row.failedCollectionItems,
    report: row.report,
  };
  const failureReasons = [...waiting.failureReasons];
  let { failedRows, pendingRows } = waiting;
  if (lapsed && pendingRows > 0) {
    failureReasons.push({ reason: DATA_TRANSFER_IMPORT_INTERRUPTED_REASON, count: pendingRows });
    failedRows += pendingRows;
    pendingRows = 0;
  }
  const report = {
    failureReasons: mergeReasons(failureReasons),
    releaseSubstitutions: row.report?.releaseSubstitutions ?? 0,
    missingReleases: row.report?.missingReleases ?? 0,
  };
  if (isActive(row.status) && !lapsed && waiting.pendingItems > 0) {
    return {
      ...stored,
      status: "running",
      phase: "preparing_items",
      pendingRows,
      failedRows,
      report,
    };
  }
  return {
    ...stored,
    ...settledStatus(row, failedRows, pendingRows),
    pendingRows,
    failedRows,
    report,
  };
}

function mergeReasons(reasons: readonly FailureReason[]): FailureReason[] {
  const counts = new Map<string, number>();
  for (const { reason, count } of reasons) counts.set(reason, (counts.get(reason) ?? 0) + count);
  return [...counts].map(([reason, count]) => ({ reason, count }));
}

export function toImport(view: ImportView): DataTransferImport {
  return dataTransferImportSchema.parse({
    id: view.row.jobId,
    fileName: view.row.fileName,
    status: view.status,
    importedOrders: view.row.importedOrders,
    importedCollectionItems: view.row.importedCollectionItems,
    failedCollectionItems: view.failedRows,
    report: view.report,
    error: view.error,
  });
}

export type ImportRow = Omit<typeof dataTransferImport.$inferSelect, "archive"> & {
  readonly hasArchive: boolean;
};

function waitingItems(
  groups: readonly {
    readonly status: string | null;
    readonly reason: string | null;
    readonly items: number | null;
    readonly rows: number | null;
  }[],
): WaitingItems {
  let pendingItems = 0;
  let pendingRows = 0;
  let failedRows = 0;
  const failureReasons: FailureReason[] = [];
  for (const group of groups) {
    if (group.status === "pending") {
      pendingItems += group.items ?? 0;
      pendingRows += group.rows ?? 0;
    } else if (group.status === "failed") {
      failedRows += group.rows ?? 0;
      if (group.rows)
        failureReasons.push({ reason: group.reason ?? "Import failed.", count: group.rows });
    }
  }
  return { pendingItems, pendingRows, failedRows, failureReasons };
}

export async function readView(
  tx: Tx | typeof db,
  userId: string,
  now: Date,
): Promise<ImportView | undefined> {
  const waiting = tx
    .select({
      userId: dataTransferImportItem.userId,
      status: dataTransferImportItem.status,
      reason: dataTransferImportItem.errorReason,
      items: sql<number>`count(*)`.mapWith(Number).as("items"),
      rows: sql<number>`sum(${dataTransferImportItem.rowCount})`.mapWith(Number).as("rows"),
    })
    .from(dataTransferImportItem)
    .where(
      and(eq(dataTransferImportItem.userId, userId), ne(dataTransferImportItem.status, "imported")),
    )
    .groupBy(
      dataTransferImportItem.userId,
      dataTransferImportItem.status,
      dataTransferImportItem.errorReason,
    )
    .as("waiting");
  const rows = await tx
    .select({
      row: importRowColumns,
      waiting: {
        status: waiting.status,
        reason: waiting.reason,
        items: waiting.items,
        rows: waiting.rows,
      },
    })
    .from(dataTransferImport)
    .leftJoin(waiting, eq(waiting.userId, dataTransferImport.userId))
    .where(eq(dataTransferImport.userId, userId));
  const first = rows[0];
  if (!first) return;
  return viewImport(
    first.row,
    waitingItems(rows.flatMap((row) => (row.waiting ? [row.waiting] : []))),
    now,
  );
}

async function recordLapse(tx: Tx, view: ImportView, now: Date): Promise<ImportView> {
  await tx
    .update(dataTransferImportItem)
    .set({
      status: "failed",
      errorReason: DATA_TRANSFER_IMPORT_INTERRUPTED_REASON,
      updatedAt: now,
    })
    .where(
      and(
        eq(dataTransferImportItem.userId, view.row.userId),
        eq(dataTransferImportItem.status, "pending"),
      ),
    );
  return saveView(tx, view, now);
}

type Mutation<T> = { readonly value: T; readonly changed: boolean };

/**
 * Runs `body` under the user's import lock, after recording a lease that lapsed, and publishes the
 * status once committed if the lapse or the body changed anything.
 */
export async function mutateImport<T>(
  userId: string,
  now: Date,
  body: (tx: Tx, current: ImportView | undefined) => Promise<Mutation<T>>,
): Promise<T> {
  const { value, changed } = await db.transaction(
    async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${userId}, 0))`);
      const view = await readView(tx, userId, now);
      const lapsed = view !== undefined && isActive(view.row.status) && !isActive(view.status);
      const outcome = await body(tx, lapsed ? await recordLapse(tx, view, now) : view);
      return { value: outcome.value, changed: lapsed || outcome.changed };
    },
    { isolationLevel: "read committed" },
  );
  if (changed) await publishStatus(userId);
  return value;
}

async function saveView(tx: Tx, view: ImportView, now: Date): Promise<ImportView> {
  await tx
    .update(dataTransferImport)
    .set({
      status: view.status,
      phase: view.phase,
      error: view.error,
      report: view.report,
      failedCollectionItems: view.failedRows,
      updatedAt: now,
    })
    .where(eq(dataTransferImport.userId, view.row.userId));
  if (view.status === "completed") {
    await tx
      .update(dataTransferImportItem)
      .set({ rows: [] })
      .where(eq(dataTransferImportItem.userId, view.row.userId));
    await tx
      .update(dataTransferImport)
      .set({ archive: null })
      .where(eq(dataTransferImport.userId, view.row.userId));
  }
  return view;
}

export async function settle(tx: Tx, userId: string, now: Date): Promise<ImportView> {
  const view = await readView(tx, userId, now);
  if (!view) throw new Error("DATA_TRANSFER_IMPORT_NOT_SAVED");
  return saveView(tx, view, now);
}

async function readRecentItems(userId: string): Promise<SyncJobRecentItem[]> {
  const rows = await db
    .select({
      externalId: dataTransferImportItem.itemExternalId,
      status: dataTransferImportItem.status,
      errorReason: dataTransferImportItem.errorReason,
      updatedAt: dataTransferImportItem.updatedAt,
      title: itemTable.title,
    })
    .from(dataTransferImportItem)
    .leftJoin(
      itemTable,
      and(
        eq(itemTable.source, "mfc"),
        eq(itemTable.externalId, dataTransferImportItem.itemExternalId),
      ),
    )
    .where(
      and(eq(dataTransferImportItem.userId, userId), ne(dataTransferImportItem.status, "pending")),
    )
    .orderBy(desc(dataTransferImportItem.updatedAt), asc(dataTransferImportItem.itemExternalId))
    .limit(RECENT_ITEMS_LIMIT);

  return rows.map((row) => ({
    externalId: row.externalId,
    title: row.title,
    outcome: row.status === "imported" ? "succeeded" : "failed",
    failureReason: row.status === "failed" ? (row.errorReason ?? "Import failed.") : null,
    completedAt: row.updatedAt.toISOString(),
  }));
}

function jobStatusOf(view: ImportView, recentItems: SyncJobRecentItem[]): SyncJobStatus {
  let phase: SyncJobStatus["phase"];
  switch (view.phase) {
    case "queued":
      phase = "queued";
      break;
    case "preparing_items":
      phase = "importing";
      break;
    case "writing_records":
      phase = "saving";
      break;
    case "completed":
      phase = "completed";
      break;
    case "failed":
      phase = "failed";
      break;
    default: {
      const exhaustive: never = view.phase;
      phase = exhaustive;
    }
  }

  let terminalState: SyncJobStatus["terminalState"] = null;
  if (view.status === "completed") terminalState = "success";
  else if (view.status === "partial") terminalState = "partial";
  else if (view.status === "failed") terminalState = "error";

  let statusMessage = "Waiting for the import to start…";
  if (view.phase === "preparing_items") statusMessage = IMPORTING_ITEMS_MESSAGE;
  else if (view.phase === "writing_records") statusMessage = "Writing imported records…";
  else if (view.status === "completed") statusMessage = "Import completed.";
  else if (view.status === "partial") statusMessage = "Import completed with skipped records.";
  else if (view.status === "failed") statusMessage = view.error ?? "Import failed.";

  const total = view.row.totalCollectionItems;
  const progress =
    total > 0
      ? {
          processed: total - view.pendingRows,
          total,
          succeeded: total - view.pendingRows - view.failedRows,
          failed: view.failedRows,
        }
      : null;

  return {
    jobId: view.row.jobId,
    phase,
    statusMessage,
    progress,
    recentItems,
    error:
      view.status === "failed"
        ? { code: "unknown", message: view.error ?? "Import failed." }
        : null,
    startedAt: view.row.startedAt.toISOString(),
    updatedAt: view.row.updatedAt.toISOString(),
    terminalState,
  };
}

export async function readJobStatus(userId: string): Promise<SyncJobStatus | null> {
  const view = await readView(db, userId, new Date());
  if (!view) return null;
  return jobStatusOf(view, await readRecentItems(userId));
}

async function publishStatus(userId: string): Promise<void> {
  const { error } = await tryCatch(
    (async () => {
      if (redis.status !== "ready") throw new Error("Redis is unavailable");
      const status = await readJobStatus(userId);
      if (status) await writeJobStatusSnapshotAndPublish(redis, status.jobId, status);
    })(),
  );
  if (!error) return;
  const publishLog = createLogger({
    action: "dataTransfer.publishStatus",
    outcome: "warn",
    user: { id: userId },
    message: "Failed to publish the import status; the database keeps it",
  });
  publishLog.error(error);
  publishLog.emit();
}
