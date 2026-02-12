import { SYNC_SESSION_STATUSES } from "./enums";

export type SyncSessionStatusValue = (typeof SYNC_SESSION_STATUSES)[number];

export const ACTIVE_SYNC_SESSION_STATUSES = ["pending", "processing"] as const;

export const ACTIVE_SYNC_SESSION_STATUS_SET: ReadonlySet<SyncSessionStatusValue> = new Set(
  ACTIVE_SYNC_SESSION_STATUSES,
);

export const SYNC_WIDGET_RECENT_LIMIT = 5;
export const SYNC_SESSION_SUBGRID_PAGE_SIZE = 5;
export const SYNC_SESSION_DETAIL_PAGE_SIZE = 10;

export const JOB_STATUS_TTL_SECONDS = 600;
