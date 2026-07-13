import { Worker } from "bullmq";
import { createError, createLogger, log } from "evlog";
import { tryCatch } from "@myakiba/utils/result";
import {
  allowTerminalSessionUpdates,
  createJobStatusState,
  deferTerminalSessionUpdates,
  publishJobStatus,
} from "../../lib/utils";
import type {
  ExecuteSyncJobParams,
  FullJobData,
  ProcessSyncJobResult,
  WorkerJobContext,
} from "../../lib/types";
import {
  jobDataSchema,
  sessionStatusToPhase,
  sessionStatusToTerminalState,
} from "@myakiba/contracts/sync/schema";
import { SYNC_STATUS_MESSAGES } from "@myakiba/contracts/sync/messages";
import { finalizeCollectionSync } from "../../lib/collection/utils";
import { finalizeOrderSync } from "../../lib/order/utils";
import { finalizeCsvSync } from "../../lib/csv/utils";
import { processSyncJob } from "../../lib/process-sync-job";
import { MOCK_SCRAPE } from "../../lib/mock-scrape";
import { env } from "@myakiba/env/worker";
import { redis } from "@myakiba/redis/client";
import { createDefaultJobContext } from "../../lib/evlog";
import { db } from "@myakiba/db/client";
import { syncSession } from "@myakiba/db/schema/figure";
import { eq } from "drizzle-orm";

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
  const jobId = job.id ?? "";
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

  if (!MOCK_SCRAPE) deferTerminalSessionUpdates(jobId, syncSessionId);

  try {
    const { data: result, error } = await tryCatch(
      processSyncJob({
        itemIds,
        scrapeRowCount,
        existingCount,
        context: {
          redis,
          jobId,
          syncSessionId,
          userId,
          log: jobLog,
        },
        finalize: async (successfulResults, state) => finalize(successfulResults, state, jobLog),
      }),
    );

    if (error) {
      if (error instanceof Error) {
        jobLog.set({ outcome: "error" });
        jobLog.error(error);
      }
      throw error;
    }

    let completedResult = result;
    if (result.persistence === null && !MOCK_SCRAPE) {
      const state = createJobStatusState({
        jobId,
        totalItems: scrapeRowCount,
        phase: "persisting",
        statusMessage: SYNC_STATUS_MESSAGES.persisting(0),
      });
      const finalized = await finalize([], state, jobLog);
      completedResult = {
        ...result,
        processedAt: finalized.processedAt,
        successCount: finalized.successCount,
        failCount: finalized.failCount,
        sessionStatus: finalized.sessionStatus,
        statusMessage: finalized.statusMessage,
        persistence: finalized.persistence,
      };
    }

    const getOutcome = (): "success" | "partial" | "error" => {
      if (completedResult.sessionStatus === "completed") return "success";
      if (completedResult.sessionStatus === "partial") return "partial";
      return "error";
    };
    jobLog.set({
      outcome: getOutcome(),
      sync: {
        sessionStatus: completedResult.sessionStatus,
        statusMessage: completedResult.statusMessage,
      },
      items: {
        scraped: completedResult.scrapedCount,
        failed: completedResult.failedCount,
        successCount: completedResult.successCount,
        failCount: completedResult.failCount,
        failedIds: completedResult.failedItemIds,
      },
      persistence: completedResult.persistence,
      processedAt: completedResult.processedAt,
    });
    return completedResult;
  } finally {
    allowTerminalSessionUpdates(jobId, syncSessionId);
    jobLog.emit();
  }
}

export const syncWorker = new Worker(
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

      const invalidPayloadMessage = SYNC_STATUS_MESSAGES.failedBeforeStart;
      await publishJobStatus({
        redis,
        state: createJobStatusState({
          jobId: job.id ?? "",
          totalItems: 0,
          phase: "failed",
          statusMessage: invalidPayloadMessage,
        }),
        terminalState: "error",
        error: {
          code: "invalid_payload",
          message: "Job data failed schema validation",
        },
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
      const isV2 = data.payloadVersion === 2;
      const csvItems = isV2
        ? data.items
        : data.items.map((item, index) => ({
            ...item,
            collectionId: `${syncSessionId}:legacy:${index}`,
          }));
      const itemsToInsert = isV2 ? data.itemsToInsert : [];
      const ordersToInsert = isV2 ? data.ordersToInsert : [];
      const existingCount = isV2 ? itemsToInsert.length : data.existingCount;
      const itemIds = [...new Set(csvItems.map((item) => item.itemExternalId))];

      return executeSyncJob({
        job,
        queueName: SYNC_QUEUE_NAME,
        type,
        syncSessionId,
        userId,
        itemIds,
        scrapeRowCount: csvItems.length,
        existingCount,
        orderId: null,
        finalize: (successfulResults, state, jobLog) =>
          finalizeCsvSync({
            successfulResults: [...successfulResults],
            log: jobLog,
            userId,
            redis,
            state,
            csvItems,
            itemsToInsert,
            ordersToInsert,
            existingCount,
            syncSessionId,
          }),
      });
    }

    if (type === "order") {
      const data = validatedData.data;
      const order = data.order;
      const itemsToScrape =
        data.payloadVersion === 2
          ? data.order.itemsToScrape
          : data.order.itemsToScrape.map((item, index) => ({
              ...item,
              collectionId: `${syncSessionId}:legacy:${index}`,
            }));
      const itemsToInsert = data.payloadVersion === 2 ? data.order.itemsToInsert : [];
      const existingCount =
        data.payloadVersion === 2 ? data.order.itemsToInsert.length : data.order.existingCount;
      const itemIds = [...new Set(itemsToScrape.map((item) => item.itemExternalId))];

      return executeSyncJob({
        job,
        queueName: SYNC_QUEUE_NAME,
        type,
        syncSessionId,
        userId,
        itemIds,
        scrapeRowCount: itemsToScrape.length,
        existingCount,
        orderId: order.details.id,
        finalize: (successfulResults, state, jobLog) =>
          finalizeOrderSync({
            successfulResults: [...successfulResults],
            log: jobLog,
            redis,
            state,
            details: order.details,
            itemsToScrape,
            itemsToInsert,
            existingCount,
            syncSessionId,
            syncMode: "create",
          }),
      });
    }

    if (type === "order-item") {
      const data = validatedData.data;
      const order = data.order;
      const itemsToScrape =
        data.payloadVersion === 2
          ? data.order.itemsToScrape
          : data.order.itemsToScrape.map((item, index) => ({
              ...item,
              collectionId: `${syncSessionId}:legacy:${index}`,
            }));
      const itemsToInsert = data.payloadVersion === 2 ? data.order.itemsToInsert : [];
      const existingCount =
        data.payloadVersion === 2 ? data.order.itemsToInsert.length : data.order.existingCount;
      const itemIds = [...new Set(itemsToScrape.map((item) => item.itemExternalId))];

      return executeSyncJob({
        job,
        queueName: SYNC_QUEUE_NAME,
        type,
        syncSessionId,
        userId,
        itemIds,
        scrapeRowCount: itemsToScrape.length,
        existingCount,
        orderId: order.details.id,
        finalize: (successfulResults, state, jobLog) =>
          finalizeOrderSync({
            successfulResults: [...successfulResults],
            log: jobLog,
            redis,
            state,
            details: order.details,
            itemsToScrape,
            itemsToInsert,
            existingCount,
            syncSessionId,
            syncMode: "append",
          }),
      });
    }

    const data = validatedData.data;
    const itemsToScrape =
      data.payloadVersion === 2
        ? data.collection.itemsToScrape
        : data.collection.itemsToScrape.map((item, index) => ({
            ...item,
            collectionId: `${syncSessionId}:legacy:${index}`,
          }));
    const itemsToInsert = data.payloadVersion === 2 ? data.collection.itemsToInsert : [];
    const existingCount =
      data.payloadVersion === 2
        ? data.collection.itemsToInsert.length
        : data.collection.existingCount;
    const itemIds = [...new Set(itemsToScrape.map((item) => item.itemExternalId))];

    return executeSyncJob({
      job,
      queueName: SYNC_QUEUE_NAME,
      type,
      syncSessionId,
      userId,
      itemIds,
      scrapeRowCount: itemsToScrape.length,
      existingCount,
      orderId: null,
      finalize: (successfulResults, state, jobLog) =>
        finalizeCollectionSync({
          successfulResults: [...successfulResults],
          log: jobLog,
          redis,
          state,
          itemsToScrape,
          itemsToInsert,
          existingCount,
          syncSessionId,
        }),
    });
  },
  {
    connection: {
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      retryStrategy(times: number): number {
        return Math.max(Math.min(Math.exp(times), 20_000), 1000);
      },
    },
    concurrency: 50,
  },
);

syncWorker.on("ready", () => {
  log.info({
    action: "worker.ready",
    outcome: "success",
    queue: { name: SYNC_QUEUE_NAME },
  });
});

syncWorker.on("error", (error) => {
  const runtimeLog = createLogger({
    action: "worker.runtime",
    outcome: "error",
    queue: { name: SYNC_QUEUE_NAME },
  });

  runtimeLog.error(error);
  runtimeLog.emit();
});

syncWorker.on("failed", async (job, err) => {
  if (!job?.id) return;

  const parsedJobData = jobDataSchema.safeParse(job.data);
  if (!parsedJobData.success) return;

  const { syncSessionId } = parsedJobData.data;
  const data = parsedJobData.data;
  const [durableSession] = await db
    .select({ status: syncSession.status })
    .from(syncSession)
    .where(eq(syncSession.id, syncSessionId));

  if (!durableSession) {
    const cleanupLog = createLogger({
      action: "worker.cleanup",
      outcome: "error",
      queue: { name: SYNC_QUEUE_NAME },
      job: { id: job.id, jobName: job.name },
      syncSessionId,
      message: "Durable sync session not found; cleanup skipped",
    });
    cleanupLog.emit();
    return;
  }

  if (["completed", "partial", "failed"].includes(durableSession.status)) {
    createLogger({
      action: "worker.cleanup",
      outcome: "skipped",
      queue: { name: SYNC_QUEUE_NAME },
      job: { id: job.id, jobName: job.name },
      syncSessionId,
      sessionStatus: durableSession.status,
      message: "Cleanup skipped because durable session is already terminal",
    }).emit();
    return;
  }

  const getExistingCount = (): number => {
    if (data.payloadVersion === 2) {
      if (data.type === "csv") return data.itemsToInsert.length;
      if (data.type === "order" || data.type === "order-item") {
        return data.order.itemsToInsert.length;
      }
      return data.collection.itemsToInsert.length;
    }
    if (data.type === "csv") return data.existingCount;
    if (data.type === "order" || data.type === "order-item") return data.order.existingCount;
    return data.collection.existingCount;
  };
  const existingCount = getExistingCount();
  const getScrapeRowCount = (): number => {
    if (data.type === "csv") return data.items.length;
    if (data.type === "order" || data.type === "order-item") return data.order.itemsToScrape.length;
    return data.collection.itemsToScrape.length;
  };
  const scrapeRowCount = getScrapeRowCount();

  const isV2 = data.payloadVersion === 2;
  const successCount = isV2 ? 0 : existingCount;
  const failCount = scrapeRowCount + (isV2 ? existingCount : 0);
  const sessionStatus = successCount > 0 ? ("partial" as const) : ("failed" as const);

  const failedStatusMessage = SYNC_STATUS_MESSAGES.failedBeforeStartWithReason(err.message);
  const { error: statusError } = await tryCatch(
    publishJobStatus({
      redis,
      state: createJobStatusState({
        jobId: job.id,
        totalItems: scrapeRowCount,
        phase: sessionStatusToPhase(sessionStatus),
        statusMessage: failedStatusMessage,
      }),
      syncSessionId,
      sessionStatus,
      successCount,
      failCount,
      forceDurableUpdate: true,
      terminalState: sessionStatusToTerminalState(sessionStatus),
      error: { code: "unknown", message: err.message },
    }),
  );
  const cleanupError = statusError;
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
