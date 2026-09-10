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

export const SYNC_QUEUE_NAME = "sync-queue";
export const JOB_STATUS_TTL_SECONDS = 600;
export const JOB_STATUS_KEY_PREFIX = "job";
export const JOB_STATUS_KEY_SUFFIX = "status:v2";
export const JOB_STATUS_CHANNEL_PREFIX = "job:status:";

export const SYNC_CSV_ITEM_STATUSES = ["Owned", "Ordered"] as const;

export type SyncCsvItemStatus = (typeof SYNC_CSV_ITEM_STATUSES)[number];
export const MAX_ITEM_SYNC_ITEMS = 10;
