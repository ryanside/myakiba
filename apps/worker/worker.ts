import { Worker } from "bullmq";
import { createError, createLogger, log } from "evlog";
import { tryCatch } from "@myakiba/utils/result";
import { setJobStatus, updateSyncSessionCounts } from "./lib/utils";
import type {
  ExecuteSyncJobParams,
  FullJobData,
  ProcessSyncJobResult,
  WorkerJobContext,
} from "./lib/types";
import { jobDataSchema } from "@myakiba/contracts/sync/schema";
import { finalizeCollectionSync } from "./lib/collection/utils";
import { finalizeOrderSync } from "./lib/order/utils";
import { finalizeCsvSync } from "./lib/csv/utils";
import { processSyncJob } from "./lib/process-sync-job";
import { env } from "@myakiba/env/worker";
import { redis } from "@myakiba/redis/client";
import { createDefaultJobContext } from "./lib/evlog";

const SYNC_QUEUE_NAME = "sync-queue";

async function executeSyncJob({
  job,
  queueName,
  type,
  syncSessionId,
  userId,
  itemIds,
  scrapeRowCount,
  existingCount,
  orderId,
  finalize,
}: ExecuteSyncJobParams): Promise<ProcessSyncJobResult> {
  const jobLog = createLogger<WorkerJobContext>({
    ...createDefaultJobContext(),
    queue: { name: queueName, jobName: job.name },
    job: {
      id: job.id ?? null,
      attemptsMade: job.attemptsMade,
      attemptNumber: job.attemptsMade + 1,
    },
    sync: {
      type,
      sessionId: syncSessionId,
      jobId: null,
      orderId,
      sessionStatus: null,
      statusMessage: null,
    },
    user: { id: userId },
    items: {
      requested: scrapeRowCount,
      existing: existingCount,
      deduped: itemIds.length,
      scraped: 0,
      failed: 0,
      successCount: 0,
      failCount: 0,
      failedIds: [],
    },
    scrapeErrors: [],
    order: { id: orderId, shop: null, status: null },
  });

  try {
    const { data: result, error } = await tryCatch(
      processSyncJob({
        itemIds,
        scrapeRowCount,
        existingCount,
        context: {
          redis,
          jobId: job.id!,
          syncSessionId,
          userId,
          log: jobLog,
        },
        finalize: async (successfulResults) => finalize(successfulResults, jobLog),
      }),
    );

    if (error) {
      if (error instanceof Error) {
        jobLog.set({ outcome: "error" });
        jobLog.error(error);
      }
      throw error;
    }

    jobLog.set({
      outcome:
        result.sessionStatus === "completed"
          ? "success"
          : result.sessionStatus === "partial"
            ? "partial"
            : "error",
      sync: {
        sessionStatus: result.sessionStatus,
        statusMessage: result.statusMessage,
      },
      items: {
        scraped: result.scrapedCount,
        failed: result.failedCount,
        successCount: result.successCount,
        failCount: result.failCount,
        failedIds: result.failedItemIds,
      },
      persistence: result.persistence,
      processedAt: result.processedAt,
    });
    return result;
  } finally {
    jobLog.emit();
  }
}

export const worker = new Worker(
  SYNC_QUEUE_NAME,
  async (job: FullJobData) => {
    const validatedData = jobDataSchema.safeParse(job.data);
    if (validatedData.error) {
      const invalidJobLog = createLogger<WorkerJobContext>({
        ...createDefaultJobContext(),
        outcome: "error",
        queue: { name: SYNC_QUEUE_NAME, jobName: job.name },
        job: {
          id: job.id ?? null,
          attemptsMade: job.attemptsMade,
          attemptNumber: job.attemptsMade + 1,
        },
        validation: { issueCount: validatedData.error.issues.length },
      });

      invalidJobLog.error(new Error("Invalid sync job payload", { cause: validatedData.error }));
      invalidJobLog.emit();

      await setJobStatus({
        redis,
        jobId: job.id!,
        statusMessage: `Sync failed: Invalid data. Please try again.`,
        finished: true,
      });
      throw createError({
        message: "Invalid sync job payload",
        cause: validatedData.error,
        why: "Job data failed schema validation",
        fix: "Check the job data matches the expected schema",
      });
    }

    const userId = validatedData.data.userId;
    const syncSessionId = validatedData.data.syncSessionId;
    const type = validatedData.data.type;

    if (type === "csv") {
      const data = validatedData.data;
      const itemIds = Array.from(new Set(data.items.map((item) => item.itemExternalId)));

      return executeSyncJob({
        job,
        queueName: SYNC_QUEUE_NAME,
        type,
        syncSessionId,
        userId,
        itemIds,
        scrapeRowCount: data.items.length,
        existingCount: data.existingCount,
        orderId: null,
        finalize: (successfulResults, jobLog) =>
          finalizeCsvSync({
            successfulResults: [...successfulResults],
            job,
            log: jobLog,
            userId,
            redis,
            csvItems: data.items,
            existingCount: data.existingCount,
            syncSessionId,
          }),
      });
    }

    if (type === "order") {
      const { order } = validatedData.data;
      const itemIds = Array.from(new Set(order.itemsToScrape.map((item) => item.itemExternalId)));

      return executeSyncJob({
        job,
        queueName: SYNC_QUEUE_NAME,
        type,
        syncSessionId,
        userId,
        itemIds,
        scrapeRowCount: order.itemsToScrape.length,
        existingCount: order.existingCount,
        orderId: order.details.id,
        finalize: (successfulResults, jobLog) =>
          finalizeOrderSync({
            successfulResults: [...successfulResults],
            job,
            log: jobLog,
            redis,
            details: order.details,
            itemsToScrape: order.itemsToScrape,
            existingCount: order.existingCount,
            syncSessionId,
            syncMode: "create",
          }),
      });
    }

    if (type === "order-item") {
      const { order } = validatedData.data;
      const itemIds = Array.from(new Set(order.itemsToScrape.map((item) => item.itemExternalId)));

      return executeSyncJob({
        job,
        queueName: SYNC_QUEUE_NAME,
        type,
        syncSessionId,
        userId,
        itemIds,
        scrapeRowCount: order.itemsToScrape.length,
        existingCount: order.existingCount,
        orderId: order.details.id,
        finalize: (successfulResults, jobLog) =>
          finalizeOrderSync({
            successfulResults: [...successfulResults],
            job,
            log: jobLog,
            redis,
            details: order.details,
            itemsToScrape: order.itemsToScrape,
            existingCount: order.existingCount,
            syncSessionId,
            syncMode: "append",
          }),
      });
    }

    const { collection } = validatedData.data;
    const itemIds = Array.from(
      new Set(collection.itemsToScrape.map((item) => item.itemExternalId)),
    );

    return executeSyncJob({
      job,
      queueName: SYNC_QUEUE_NAME,
      type,
      syncSessionId,
      userId,
      itemIds,
      scrapeRowCount: collection.itemsToScrape.length,
      existingCount: collection.existingCount,
      orderId: null,
      finalize: (successfulResults, jobLog) =>
        finalizeCollectionSync({
          successfulResults: [...successfulResults],
          job,
          log: jobLog,
          redis,
          itemsToScrape: collection.itemsToScrape,
          existingCount: collection.existingCount,
          syncSessionId,
        }),
    });
  },
  {
    connection: {
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      retryStrategy(times: number): number {
        return Math.max(Math.min(Math.exp(times), 20000), 1000);
      },
    },
    concurrency: 2,
  },
);

worker.on("ready", () => {
  log.info({
    action: "worker.ready",
    outcome: "success",
    queue: { name: SYNC_QUEUE_NAME },
  });
});

worker.on("error", (error) => {
  const runtimeLog = createLogger({
    action: "worker.runtime",
    outcome: "error",
    queue: { name: SYNC_QUEUE_NAME },
  });

  runtimeLog.error(error);
  runtimeLog.emit();
});

worker.on("failed", async (job, err) => {
  if (!job?.id) return;

  const parsedJobData = jobDataSchema.safeParse(job.data);
  if (!parsedJobData.success) return;

  const { syncSessionId } = parsedJobData.data;
  const data = parsedJobData.data;
  const existingCount =
    data.type === "csv"
      ? data.existingCount
      : data.type === "order" || data.type === "order-item"
        ? data.order.existingCount
        : data.collection.existingCount;
  const scrapeRowCount =
    data.type === "csv"
      ? data.items.length
      : data.type === "order" || data.type === "order-item"
        ? data.order.itemsToScrape.length
        : data.collection.itemsToScrape.length;

  const successCount = existingCount;
  const failCount = scrapeRowCount;
  const sessionStatus = successCount > 0 ? ("partial" as const) : ("failed" as const);

  const { error: statusError } = await tryCatch(
    setJobStatus({
      redis,
      jobId: job.id,
      statusMessage: `Sync failed: ${err.message}`,
      finished: true,
      syncSessionId,
      sessionStatus,
    }),
  );
  const { error: countsError } = await tryCatch(
    updateSyncSessionCounts({
      syncSessionId,
      successCount,
      failCount,
    }),
  );

  const cleanupError = statusError ?? countsError;
  if (cleanupError && cleanupError instanceof Error) {
    const cleanupLog = createLogger({
      action: "worker.cleanup",
      outcome: "error",
      queue: { name: SYNC_QUEUE_NAME },
      job: {
        id: job.id,
        jobName: job.name,
      },
    });

    cleanupLog.error(cleanupError);
    cleanupLog.emit();
  }
});

export async function closeWorker(): Promise<void> {
  await worker.close();
}
