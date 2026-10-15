import type { SyncJobRecentItem } from "./schema";

export const SYNC_STATUS_MESSAGES = {
  queued: "Import queued",
  retryQueued: "Retry queued",
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
  failedDuringProcessing: "Import failed during processing",
  insertedWithoutScrape: "Items added using details already in myakiba",
  streamError: "Lost connection. Reload the page to see the latest status.",
  streamTimeout: "Status updates timed out. Reload the page to see the latest status.",
  connecting: "Connecting...",
  requireEmailVerification:
    "Verify your email before adding items or importing a CSV. Check your inbox for the verification email sent when you signed up.",
} as const;
