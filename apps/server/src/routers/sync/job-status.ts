import { createLogger } from "evlog";
import type { SyncJobStatus } from "@myakiba/contracts/sync/schema";
import { redis } from "@myakiba/redis/client";
import { writeJobStatusSnapshotAndPublish } from "@myakiba/redis/job-status";
import { tryCatch } from "@myakiba/utils/result";

export const queuedJobStatus = (
  jobId: string,
  statusMessage: string,
  revision?: number,
): SyncJobStatus => {
  const now = new Date().toISOString();
  return {
    jobId,
    ...(revision !== undefined && { revision }),
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
  status: SyncJobStatus,
  syncSessionId: string,
): Promise<void> {
  const { error } = await tryCatch(writeJobStatusSnapshotAndPublish(redis, status.jobId, status));
  if (!error) return;
  const cacheLog = createLogger({
    action: "sync.jobStatusCache",
    outcome: "warn",
    jobId: status.jobId,
    syncSessionId,
    message: "Failed to publish job status; the saved session is still available",
  });
  cacheLog.error(error);
  cacheLog.emit();
}
