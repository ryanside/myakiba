import { Queue, Worker } from "bullmq";
import { and, eq, gt, isNotNull, lt, sql } from "drizzle-orm";
import { createLogger, log } from "evlog";
import { MFC_ITEM_METADATA_VERSION } from "@myakiba/contracts/shared/constants";
import { db } from "@myakiba/db/client";
import { item } from "@myakiba/db/schema/figure";
import { env } from "@myakiba/env/worker";
import {
  getResyncJobId,
  ITEM_RESYNC_JOB_NAME,
  ITEM_RESYNC_QUEUE_NAME,
} from "@myakiba/redis/item-resync";
import type { ItemResyncJobData } from "./process-item-resync-job";

const COORDINATOR_NAME = "mfc-item-metadata-backfill";
const QUEUE_NAME = `${COORDINATOR_NAME}-queue`;
const STALE_ITEM_QUERY_LIMIT = 500;

const connection = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  retryStrategy(times: number): number {
    return Math.max(Math.min(Math.exp(times), 20_000), 1000);
  },
};

const metadataBackfillQueue = new Queue(QUEUE_NAME, { connection });
const itemResyncQueue = new Queue<ItemResyncJobData>(ITEM_RESYNC_QUEUE_NAME, { connection });

function findStaleItems(afterItemId: string | null) {
  return db
    .select({
      id: item.id,
      externalId: sql<number>`${item.externalId}`,
    })
    .from(item)
    .where(
      and(
        eq(item.source, "mfc"),
        isNotNull(item.externalId),
        lt(item.mfcMetadataVersion, MFC_ITEM_METADATA_VERSION),
        afterItemId === null ? undefined : gt(item.id, afterItemId),
      ),
    )
    .orderBy(item.id)
    .limit(STALE_ITEM_QUERY_LIMIT);
}

const metadataBackfillWorker = new Worker(
  QUEUE_NAME,
  async (job) => {
    const jobLog = createLogger({
      action: "item-resync.metadata-backfill",
      job: { id: job.id ?? null },
      metadataVersion: MFC_ITEM_METADATA_VERSION,
    });

    try {
      let staleItems = await findStaleItems(null);

      if (staleItems.length === 0) {
        await metadataBackfillQueue.removeJobScheduler(COORDINATOR_NAME);
        jobLog.set({
          outcome: "success",
          staleItems: 0,
          schedulerRemoved: true,
        });
        return;
      }

      let staleItemCount = 0;
      while (staleItems.length > 0) {
        await itemResyncQueue.addBulk(
          staleItems.map((staleItem) => ({
            name: ITEM_RESYNC_JOB_NAME,
            data: { itemId: staleItem.id, externalId: staleItem.externalId },
            opts: {
              jobId: getResyncJobId(staleItem.id),
              removeOnComplete: true,
              removeOnFail: true,
            },
          })),
        );
        staleItemCount += staleItems.length;
        const lastStaleItem = staleItems.at(-1);
        if (!lastStaleItem) throw new Error("Stale Item page unexpectedly empty");
        staleItems = await findStaleItems(lastStaleItem.id);
      }

      jobLog.set({ outcome: "success", staleItems: staleItemCount });
    } catch (error) {
      jobLog.set({ outcome: "error" });
      jobLog.error(error instanceof Error ? error : new Error(String(error)));
      throw error;
    } finally {
      jobLog.emit();
    }
  },
  { connection, concurrency: 1 },
);

metadataBackfillWorker.on("ready", () => {
  log.info({
    action: "worker.ready",
    outcome: "success",
    queue: { name: QUEUE_NAME },
  });
});

function logRuntimeError(queueName: string, error: Error): void {
  const runtimeLog = createLogger({
    action: "worker.runtime",
    outcome: "error",
    queue: { name: queueName },
  });

  runtimeLog.error(error);
  runtimeLog.emit();
}

metadataBackfillQueue.on("error", (error) => logRuntimeError(QUEUE_NAME, error));
metadataBackfillWorker.on("error", (error) => logRuntimeError(QUEUE_NAME, error));
itemResyncQueue.on("error", (error) => logRuntimeError(ITEM_RESYNC_QUEUE_NAME, error));

await metadataBackfillQueue.upsertJobScheduler(
  COORDINATOR_NAME,
  { pattern: "*/30 * * * *", immediately: true, tz: "UTC" },
  {
    name: COORDINATOR_NAME,
    opts: { removeOnComplete: true, removeOnFail: true },
  },
);

export async function closeMetadataBackfillWorker(): Promise<void> {
  await Promise.all([
    metadataBackfillWorker.close(),
    metadataBackfillQueue.close(),
    itemResyncQueue.close(),
  ]);
}
