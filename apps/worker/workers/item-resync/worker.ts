import { Worker } from "bullmq";
import { createLogger, log } from "evlog";
import { env } from "@myakiba/env/worker";
import { ITEM_RESYNC_QUEUE_NAME } from "@myakiba/redis/item-resync";
import { processItemResyncJob, type ItemResyncJobData } from "./process-item-resync-job";

const DURATION = 30 * 60 * 1000;

export const itemResyncWorker = new Worker<ItemResyncJobData>(
  ITEM_RESYNC_QUEUE_NAME,
  async (job) => processItemResyncJob(job),
  {
    connection: {
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      retryStrategy(times: number): number {
        return Math.max(Math.min(Math.exp(times), 20000), 1000);
      },
    },
    concurrency: 1,
    limiter: {
      max: 10,
      duration: DURATION,
    },
  },
);

itemResyncWorker.on("ready", () => {
  log.info({
    action: "worker.ready",
    outcome: "success",
    queue: { name: ITEM_RESYNC_QUEUE_NAME },
  });
});

itemResyncWorker.on("error", (error) => {
  const runtimeLog = createLogger({
    action: "worker.runtime",
    outcome: "error",
    queue: { name: ITEM_RESYNC_QUEUE_NAME },
  });

  runtimeLog.error(error);
  runtimeLog.emit();
});

itemResyncWorker.on("failed", (job, err) => {
  const failedLog = createLogger({
    action: "item-resync.failed",
    outcome: "error",
    queue: { name: ITEM_RESYNC_QUEUE_NAME },
    job: { id: job?.id ?? null, name: job?.name ?? null },
    item: job?.data ? { id: job.data.itemId, externalId: job.data.externalId } : null,
  });

  failedLog.error(err);
  failedLog.emit();
});
