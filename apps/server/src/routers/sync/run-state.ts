import { SYNC_STATUS_MESSAGES } from "@myakiba/contracts/sync/messages";
import type { SyncJobError } from "@myakiba/contracts/sync/schema";
import type { SyncSessionStatus, SyncType } from "@myakiba/contracts/shared/types";

type RunCounts = {
  readonly syncType: SyncType;
  readonly totalItems: number;
  readonly successCount: number;
  readonly failCount: number;
};

export type RunEnd = "finished" | "order_missing";

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
  if (end === "order_missing") statusMessage = SYNC_STATUS_MESSAGES.failedPersist;
  else if (syncType === "item" && successCount > 0) {
    statusMessage = `${successCount}/${totalItems} items in the item database`;
    if (failCount > 0) statusMessage += `. ${failCount} failed.`;
  } else if (status === "completed") {
    statusMessage = SYNC_STATUS_MESSAGES.completed(successCount, totalItems);
  } else if (status === "partial") {
    statusMessage = SYNC_STATUS_MESSAGES.partial(successCount, totalItems, failCount);
  }

  let error: SyncJobError | null = null;
  if (status === "failed") {
    error =
      end === "order_missing"
        ? { code: "persistence_failed", message: SYNC_STATUS_MESSAGES.failedPersist }
        : { code: "scrape_failed", message: statusMessage };
  }
  return { status, statusMessage, error };
}
