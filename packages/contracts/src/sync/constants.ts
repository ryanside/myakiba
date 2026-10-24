import type { SYNC_SESSION_STATUSES } from "../shared/constants";

export type SyncSessionStatusValue = (typeof SYNC_SESSION_STATUSES)[number];

export const ACTIVE_SYNC_SESSION_STATUSES = ["pending", "processing"] as const;

export const ACTIVE_SYNC_SESSION_STATUS_SET: ReadonlySet<SyncSessionStatusValue> = new Set(
  ACTIVE_SYNC_SESSION_STATUSES,
);

export const SYNC_WIDGET_RECENT_LIMIT = 12;
export const SYNC_SESSION_SUBGRID_PAGE_SIZE = 12;
export const SYNC_SESSION_DETAIL_PAGE_SIZE = 24;

export const SYNC_SESSION_RETRY_WINDOW_DAYS = 20;
export const SYNC_SESSION_RETRY_WINDOW_MS = SYNC_SESSION_RETRY_WINDOW_DAYS * 24 * 60 * 60 * 1000;
export const SYNC_SESSION_RETENTION_DAYS = 30;
export const SYNC_SESSION_RETENTION_MS = SYNC_SESSION_RETENTION_DAYS * 24 * 60 * 60 * 1000;
/** A run that reports nothing for this long reads as interrupted. The page's heartbeat keeps it alive. */
export const SYNC_RUN_LEASE_MS = 120_000;
export const UNSAVED_ITEM_REASON = "Failed to save this item";

export const JOB_STATUS_TTL_SECONDS = 600;
export const JOB_STATUS_KEY_PREFIX = "job";
export const JOB_STATUS_KEY_SUFFIX = "status:v2";
export const JOB_STATUS_CHANNEL_PREFIX = "job:status:";

export const SYNC_CSV_ITEM_STATUSES = ["Owned", "Ordered"] as const;

export const MAX_ITEM_SYNC_ITEMS = 10;

/**
 * Why the extension could not fetch an MFC item. The extension sends these codes, the web app shows a message for each,
 * and Import History stores them.
 */
export const ITEM_FETCH_ERROR_CODES = [
  "mfc_signed_out",
  "hidden_or_missing",
  "challenge_unsolved",
  "rate_limited",
  "timeout",
  "unexpected_page",
] as const;
export type ItemFetchErrorCode = (typeof ITEM_FETCH_ERROR_CODES)[number];
