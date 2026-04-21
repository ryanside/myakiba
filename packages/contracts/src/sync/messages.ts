import type { SyncJobRecentItem } from "./schema";

/**
 * Canonical user-facing copy for sync job status updates.
 *
 * Use this anywhere we persist or render sync status text so server, worker,
 * widgets, banners, and toasts all speak the same language.
 *
 * Prefer these message builders over inline strings when:
 * - writing `statusMessage` to Redis or Postgres
 * - synthesizing fallback job status from a persisted session
 * - rendering UI copy that should match persisted status exactly
 *
 * @example
 * SYNC_STATUS_MESSAGES.queued
 * // "Sync queued"
 *
 * @example
 * SYNC_STATUS_MESSAGES.partial(8, 10, 2)
 * // "Synced 8/10 items - 2 failed"
 */
export const SYNC_STATUS_MESSAGES = {
  queued: "Sync queued",
  starting: (count: number) => `Starting sync of ${count} item${count === 1 ? "" : "s"}`,
  scraping: (processed: number, total: number) => `Scraping ${processed}/${total} items`,
  persisting: (count: number) => `Persisting ${count} scraped item${count === 1 ? "" : "s"}`,
  itemOutcome: (item: Pick<SyncJobRecentItem, "outcome" | "title" | "externalId">) =>
    `${item.outcome === "succeeded" ? "Synced" : "Failed"} ${item.title ?? `MFC #${item.externalId}`}`,
  completed: (successCount: number, totalCount: number) =>
    `Synced ${successCount}/${totalCount} items`,
  partial: (successCount: number, totalCount: number, failCount: number) =>
    `Synced ${successCount}/${totalCount} items - ${failCount} failed`,
  failedScrape: "Sync failed - couldn't fetch from MyFigureCollection",
  failedPersist: "Sync failed - couldn't save scraped items",
  failedBeforeStart: "Sync failed before processing started",
  failedBeforeStartWithReason: (reason: string) =>
    `Sync failed before processing started - ${reason}`,
  alreadyOwned: "All items already synced. To add duplicates, use Collection or Order Sync.",
  insertedWithoutScrape: "Sync completed - items were already in myakiba",
  streamError: "Lost connection - refresh to see latest status",
  streamTimeout: "Stream timed out - refresh to see latest status",
  connecting: "Connecting...",
  requireEmailVerification:
    "Please verify your email before syncing. A verification email was already sent when you signed up.",
} as const;
