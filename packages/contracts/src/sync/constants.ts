const SYNC_SESSION_RETENTION_DAYS = 30;
export const SYNC_SESSION_RETENTION_MS = SYNC_SESSION_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export const SYNC_CSV_ITEM_STATUSES = ["Owned", "Ordered"] as const;

export const MAX_ITEM_SYNC_ITEMS = 10;
