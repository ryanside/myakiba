import { Queue, Worker } from "bullmq";
import { lt } from "drizzle-orm";
import { createLogger, log } from "evlog";
import { db } from "@myakiba/db/client";
import { syncSession } from "@myakiba/db/schema/figure";
import { env } from "@myakiba/env/worker";
import { tryCatch } from "@myakiba/utils/result";
import { SYNC_SESSION_RETENTION_MS } from "@myakiba/contracts/sync/constants";

const QUEUE_NAME = "sync-session-cleanup-queue";
const connection = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  retryStrategy(times: number): number {
    return Math.max(Math.min(Math.exp(times), 20_000), 1000);
  },
};

const cleanupQueue = new Queue(QUEUE_NAME, { connection });
const cleanupWorker = new Worker(
  QUEUE_NAME,
  async (job) => {
    const cutoff = new Date(Date.now() - SYNC_SESSION_RETENTION_MS);
    const jobLog = createLogger({
      action: "sync.cleanup",
      job: { id: job.id ?? null },
      cutoff: cutoff.toISOString(),
    });

    try {
      const { data, error } = await tryCatch(
        db
          .delete(syncSession)
          .where(lt(syncSession.createdAt, cutoff))
          .returning({ id: syncSession.id }),
      );

      if (error) {
        jobLog.set({ outcome: "error" });
        jobLog.error(error);
        throw error;
      }

      jobLog.set({ outcome: "success", deletedSessions: data.length });
    } finally {
      jobLog.emit();
    }
  },
  { connection, concurrency: 1 },
);

cleanupWorker.on("ready", () => {
  log.info({
    action: "worker.ready",
    outcome: "success",
    queue: { name: QUEUE_NAME },
  });
});

function logRuntimeError(error: Error): void {
  const runtimeLog = createLogger({
    action: "worker.runtime",
    outcome: "error",
    queue: { name: QUEUE_NAME },
  });

  runtimeLog.error(error);
  runtimeLog.emit();
}

cleanupQueue.on("error", logRuntimeError);
cleanupWorker.on("error", logRuntimeError);

cleanupWorker.on("failed", (job, error) => {
  const failedLog = createLogger({
    action: "sync.cleanup.failed",
    outcome: "error",
    job: { id: job?.id ?? null },
  });

  failedLog.error(error);
  failedLog.emit();
});

await cleanupQueue.upsertJobScheduler(
  "sync-session-cleanup",
  { pattern: "0 3 * * *", tz: "UTC" },
  {
    name: "sync-session-cleanup",
    opts: { removeOnComplete: true, removeOnFail: true },
  },
);

export async function closeSyncSessionCleanupWorker(): Promise<void> {
  await Promise.all([cleanupWorker.close(), cleanupQueue.close()]);
}
