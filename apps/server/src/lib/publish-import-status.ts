import { Result } from "better-result";
import { createLogger } from "evlog";
import type { SyncJobStatus } from "@myakiba/contracts/sync/schema";
import { redis } from "@myakiba/redis/client";
import { writeJobStatusSnapshotAndPublish } from "@myakiba/redis/job-status";
import { PublishJobStatusFailed } from "@myakiba/redis/errors/publish-job-status-failed";
import { withDeadline } from "@myakiba/utils/with-deadline";

/** Publication is optional: durable import state remains available when Redis cannot answer. */
export async function publishImportStatus({
  load,
  action,
  jobId,
  syncSessionId,
  userId,
}: {
  readonly load: () => Promise<SyncJobStatus | null>;
  readonly action: "sync.jobStatusCache";
  readonly jobId?: string;
  readonly syncSessionId?: string;
  readonly userId?: string;
}): Promise<void> {
  const failed = (cause: unknown) => new PublishJobStatusFailed({ jobId: jobId ?? null, cause });
  const attempted =
    redis.status === "ready"
      ? await Result.tryPromise({
          try: async () => {
            const status = await load();
            return status
              ? withDeadline(() => writeJobStatusSnapshotAndPublish(redis, status.jobId, status))
              : Result.ok("unread" as const);
          },
          catch: failed,
        })
      : Result.err(failed(new Error(`Redis is ${redis.status}`)));
  const published = attempted.andThen((result) => result);
  if (published.isOk()) return;
  const log = createLogger({
    action,
    outcome: "warn",
    jobId,
    syncSessionId,
    ...(userId && { user: { id: userId } }),
  });
  log.warn("Failed to publish job status; the saved import is still available", {
    failure: published.error,
  });
  log.emit();
}
