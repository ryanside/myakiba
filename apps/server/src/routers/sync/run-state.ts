import { and, eq, inArray, lte, or, sql } from "drizzle-orm";
import { syncSession } from "@myakiba/db/schema/figure";
import {
  ACTIVE_SYNC_SESSION_STATUSES,
  ACTIVE_SYNC_SESSION_STATUS_SET,
  SYNC_RUN_LEASE_MS,
} from "@myakiba/contracts/sync/constants";
import { SYNC_STATUS_MESSAGES } from "@myakiba/contracts/sync/messages";
import type { SyncJobError } from "@myakiba/contracts/sync/schema";
import type { SyncSessionStatus, SyncType } from "@myakiba/contracts/shared/types";

type RunCounts = {
  readonly syncType: SyncType;
  readonly totalItems: number;
  readonly successCount: number;
  readonly failCount: number;
};

export type RunEnd = "finished" | "interrupted" | "order_missing" | "persistence_failed";

type SettledRun = {
  readonly status: Extract<SyncSessionStatus, "completed" | "partial" | "failed">;
  readonly statusMessage: string;
  readonly error: SyncJobError | null;
};

export function settleRun(
  { syncType, totalItems, successCount, failCount }: RunCounts,
  end: RunEnd,
): SettledRun {
  let status: SettledRun["status"] = "failed";
  if (failCount === 0) status = "completed";
  else if (successCount > 0) status = "partial";

  let statusMessage: string = SYNC_STATUS_MESSAGES.failedScrape;
  if (end === "order_missing" || end === "persistence_failed")
    statusMessage = SYNC_STATUS_MESSAGES.failedPersist;
  else if (syncType === "item" && successCount > 0) {
    statusMessage = `${successCount}/${totalItems} items in the item database`;
    if (failCount > 0) statusMessage += `. ${failCount} failed.`;
  } else if (status === "completed") {
    statusMessage = SYNC_STATUS_MESSAGES.completed(successCount, totalItems);
  } else if (status === "partial") {
    statusMessage = SYNC_STATUS_MESSAGES.partial(successCount, totalItems, failCount);
  } else if (end === "interrupted") statusMessage = SYNC_STATUS_MESSAGES.interrupted;

  let error: SyncJobError | null = null;
  if (status === "failed") {
    error =
      end === "order_missing" || end === "persistence_failed"
        ? { code: "persistence_failed", message: SYNC_STATUS_MESSAGES.failedPersist }
        : { code: "scrape_failed", message: statusMessage };
  }
  return { status, statusMessage, error };
}

type LeasedSession = RunCounts & {
  readonly status: SyncSessionStatus;
  readonly statusMessage: string;
  readonly updatedAt: Date;
  readonly extensionRun: boolean;
};

export const leaseCutoff = (now: number): Date => new Date(now - SYNC_RUN_LEASE_MS);

// Remove the worker-era allowance once those runs expire from the 30-day history.
// A day bounds lost jobs while allowing queued jobs to finish through the old worker.
const WORKER_RUN_LEASE_MS = 24 * 60 * 60 * 1000;

export const isLapsed = (session: LeasedSession, now: number): boolean =>
  ACTIVE_SYNC_SESSION_STATUS_SET.has(session.status) &&
  session.updatedAt.getTime() <=
    now - (session.extensionRun ? SYNC_RUN_LEASE_MS : WORKER_RUN_LEASE_MS);

/**
 * How a session reads, with a lapsed run shown as interrupted: its pending items count
 * as failed. The next write to the session saves that state.
 */
export function viewSession<S extends LeasedSession>(
  session: S,
  now: number,
): S & { readonly interrupted: boolean } {
  if (!isLapsed(session, now)) return { ...session, interrupted: false };
  const failCount = session.totalItems - session.successCount;
  const { status, statusMessage } = settleRun({ ...session, failCount }, "interrupted");
  return { ...session, status, statusMessage, failCount, interrupted: true };
}

/** The status `viewSession` shows, as SQL, for reads that filter or sort on it. */
export const viewedStatusSql = (cutoff: Date) =>
  sql<SyncSessionStatus>`CASE WHEN ${and(
    inArray(syncSession.status, ACTIVE_SYNC_SESSION_STATUSES),
    or(
      and(eq(syncSession.extensionRun, true), lte(syncSession.updatedAt, cutoff)),
      and(
        eq(syncSession.extensionRun, false),
        lte(
          syncSession.updatedAt,
          new Date(cutoff.getTime() + SYNC_RUN_LEASE_MS - WORKER_RUN_LEASE_MS),
        ),
      ),
    ),
  )} THEN (CASE WHEN ${syncSession.successCount} = ${syncSession.totalItems} THEN 'completed' WHEN ${syncSession.successCount} > 0 THEN 'partial' ELSE 'failed' END) ELSE ${syncSession.status} END`;
