import { createLogger } from "evlog";
import type { JobData, SyncJobStatus } from "@myakiba/contracts/sync/schema";
import { redis } from "@myakiba/redis/client";
import { writeJobStatusSnapshotAndPublish } from "@myakiba/redis/job-status";

import { csvPriceWarnings } from "./csv";

export function importWarnings(payload: JobData | null): Pick<SyncJobStatus, "warnings"> {
  if (payload?.type !== "csv") return {};
  return payload.warnings?.length
    ? { warnings: payload.warnings }
    : csvPriceWarnings(payload.items);
}

export type ServerSyncJobStatus = SyncJobStatus & { readonly revision: number };

export const queuedJobStatus = (
  jobId: string,
  statusMessage: string,
  revision: number,
): ServerSyncJobStatus => {
  const now = new Date().toISOString();
  return {
    jobId,
    revision,
    phase: "queued",
    statusMessage,
    progress: null,
    recentItems: [],
    error: null,
    startedAt: now,
    updatedAt: now,
    terminalState: null,
  };
};

export async function publishJobStatus(
  status: ServerSyncJobStatus,
  syncSessionId: string,
): Promise<void> {
  const published = await writeJobStatusSnapshotAndPublish(redis, status.jobId, status);
  if (published.isOk()) return;
  const { cause } = published.error;
  const cacheLog = createLogger({
    action: "sync.jobStatusCache",
    outcome: "warn",
    jobId: status.jobId,
    syncSessionId,
    message: "Failed to publish job status; the saved session is still available",
  });
  cacheLog.error(cause instanceof Error ? cause : String(cause));
  cacheLog.emit();
}
