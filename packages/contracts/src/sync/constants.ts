import { SYNC_SESSION_STATUSES } from "../shared/constants";

export type SyncSessionStatusValue = (typeof SYNC_SESSION_STATUSES)[number];

export const ACTIVE_SYNC_SESSION_STATUSES = ["pending", "processing"] as const;

export const ACTIVE_SYNC_SESSION_STATUS_SET: ReadonlySet<SyncSessionStatusValue> = new Set(
  ACTIVE_SYNC_SESSION_STATUSES,
);

export const SYNC_WIDGET_RECENT_LIMIT = 12;
export const SYNC_SESSION_SUBGRID_PAGE_SIZE = 12;
export const SYNC_SESSION_DETAIL_PAGE_SIZE = 24;

export const JOB_STATUS_TTL_SECONDS = 600;
export const JOB_STATUS_KEY_PREFIX = "job";
export const JOB_STATUS_KEY_SUFFIX = "status";
export const JOB_STATUS_CHANNEL_PREFIX = "job:status:";

export const SYNC_CSV_ITEM_STATUSES = ["Owned", "Ordered"] as const;

export type SyncCsvItemStatus = (typeof SYNC_CSV_ITEM_STATUSES)[number];
