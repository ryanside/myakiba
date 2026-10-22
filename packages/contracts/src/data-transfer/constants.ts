export const DATA_TRANSFER_FORMAT = "myakiba-data-transfer";
export const DATA_TRANSFER_VERSION = 1;

export const DATA_TRANSFER_MAX_BYTES = 50 * 1024 * 1024;
export const DATA_TRANSFER_MAX_RECORDS = 100_000;

export const DATA_TRANSFER_IMPORT_STATUSES = [
  "queued",
  "running",
  "completed",
  "partial",
  "failed",
] as const;

export const DATA_TRANSFER_IMPORT_PHASES = [
  "queued",
  "preparing_items",
  "writing_records",
  "completed",
  "failed",
] as const;

/** An import whose page sends no heartbeat for this long reads as interrupted. */
export const DATA_TRANSFER_IMPORT_LEASE_MS = 120_000;
export const DATA_TRANSFER_IMPORT_INTERRUPTED_REASON = "import interrupted";
