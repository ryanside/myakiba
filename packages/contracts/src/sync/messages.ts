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
 * // "Import queued"
 *
 * @example
 * SYNC_STATUS_MESSAGES.partial(8, 10, 2)
 * // "Added 8/10 items. 2 failed."
 */
export const SYNC_STATUS_MESSAGES = {
  queued: "Import queued",
  starting: (count: number) => `Starting to scrape ${count} item${count === 1 ? "" : "s"}`,
  scraping: (processed: number, total: number) =>
    `Scraping item details from MyFigureCollection: ${processed}/${total} processed`,
  persisting: (count: number) => `Saving ${count} scraped item${count === 1 ? "" : "s"}`,
  itemOutcome: (item: Pick<SyncJobRecentItem, "outcome" | "title" | "externalId">) =>
    `${item.outcome === "succeeded" ? "Scraped details for" : "Failed to scrape details for"} ${item.title ?? `MFC #${item.externalId}`}`,
  completed: (successCount: number, totalCount: number) =>
    `Added ${successCount}/${totalCount} items`,
  partial: (successCount: number, totalCount: number, failCount: number) =>
    `Added ${successCount}/${totalCount} items. ${failCount} failed.`,
  failedScrape: "Failed to scrape item details from MyFigureCollection",
  failedPersist: "Failed to save items",
  failedBeforeStart: "Import failed before processing started",
  failedBeforeStartWithReason: (reason: string) =>
    `Import failed before processing started. ${reason}`,
  alreadyOwned:
    "These items are already in your collection or orders. To add another copy, open Add and choose Collection or Order.",
  insertedWithoutScrape: "Items added using details already in myakiba",
  streamError: "Lost connection. Reload the page to see the latest status.",
  streamTimeout: "Status updates timed out. Reload the page to see the latest status.",
  connecting: "Connecting...",
  requireEmailVerification:
    "Verify your email before adding items or importing a CSV. Check your inbox for the verification email sent when you signed up.",
} as const;
