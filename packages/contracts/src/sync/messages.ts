import type { SyncJobRecentItem } from "./schema";

export const SYNC_STATUS_MESSAGES = {
  queued: "Import queued",
  retryQueued: "Retry queued",
  starting: (count: number) => `Starting to import ${count} item${count === 1 ? "" : "s"}`,
  importing: (processed: number, total: number) =>
    `Importing item details from MyFigureCollection: ${processed}/${total} processed`,
  itemOutcome: (item: Pick<SyncJobRecentItem, "outcome" | "title" | "externalId">) =>
    `${item.outcome === "succeeded" ? "Imported details for" : "Failed to import details for"} ${item.title ?? `MFC #${item.externalId}`}`,
  completed: (successCount: number, totalCount: number) =>
    `Added ${successCount}/${totalCount} items`,
  partial: (successCount: number, totalCount: number, failCount: number) =>
    `Added ${successCount}/${totalCount} items. ${failCount} failed.`,
  failedFetch: "Failed to import item details from MyFigureCollection",
  failedPersist: "Failed to save items",
  failedBeforeStart: "Import failed before processing started",
  interrupted: "Import interrupted",
  insertedFromExisting: "Items added using details already in myakiba",
  streamError: "Lost connection. Reload the page to see the latest status.",
  streamTimeout: "Status updates timed out. Reload the page to see the latest status.",
  connecting: "Connecting...",
} as const;
