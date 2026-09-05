import { Worker } from "bullmq";
import { createError, createLogger, log } from "evlog";
import { tryCatch } from "@myakiba/utils/result";
import { createJobStatusState, publishJobStatus } from "../../lib/utils";
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
import { finalizeItemSync } from "../../lib/finalize-item-sync";
import { finalizeOrderSync } from "../../lib/order/utils";
import { finalizeCsvSync } from "../../lib/csv/utils";
import { processSyncJob } from "../../lib/process-sync-job";
import { env } from "@myakiba/env/worker";
import { redis } from "@myakiba/redis/client";
import { createDefaultJobContext } from "../../lib/evlog";
import { db } from "@myakiba/db/client";
import { item as itemTable, syncSession } from "@myakiba/db/schema/figure";
import { and, eq, inArray } from "drizzle-orm";

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

  try {
    const { data: result, error } = await tryCatch(
      processSyncJob({
        type,
        itemIds,
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

    const getOutcome = (): "success" | "partial" | "error" => {
      if (result.sessionStatus === "completed") return "success";
      if (result.sessionStatus === "partial") return "partial";
      return "error";
    };
    jobLog.set({
      outcome: getOutcome(),
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

    if (type === "item") {
      const { itemExternalIds, existingCount } = validatedData.data;
      const availableItems = await db
        .select({ externalId: itemTable.externalId })
        .from(itemTable)
        .where(and(eq(itemTable.source, "mfc"), inArray(itemTable.externalId, itemExternalIds)));
      const availableIds = availableItems.flatMap((item) =>
        item.externalId === null ? [] : [item.externalId],
      );
      const available = new Set(availableIds);
      const missingIds = itemExternalIds.filter((id) => !available.has(id));
      return executeSyncJob({
        job,
        queueName: SYNC_QUEUE_NAME,
        type,
        syncSessionId,
        userId,
        itemIds: missingIds,
        scrapeRowCount: missingIds.length,
        existingCount: existingCount + available.size,
        orderId: null,
        finalize: (successfulResults, state, jobLog) =>
          finalizeItemSync({
            successfulResults,
            itemExternalIds,
            existingCount,
            syncSessionId,
            redis,
            state,
            log: jobLog,
          }),
      });
    }

    if (type === "csv") {
      const data = validatedData.data;
      const csvItems = data.items;
      const itemsToInsert = data.itemsToInsert;
      const ordersToInsert = data.ordersToInsert;
      const existingCount = itemsToInsert.length;
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
      const itemsToScrape = data.order.itemsToScrape;
      const itemsToInsert = data.order.itemsToInsert;
      const existingCount = itemsToInsert.length;
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
      const itemsToScrape = data.order.itemsToScrape;
      const itemsToInsert = data.order.itemsToInsert;
      const existingCount = itemsToInsert.length;
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
    const itemsToScrape = data.collection.itemsToScrape;
    const itemsToInsert = data.collection.itemsToInsert;
    const existingCount = itemsToInsert.length;
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

  const failedStatusMessage =
    durableSession.status === "pending"
      ? SYNC_STATUS_MESSAGES.failedBeforeStartWithReason(err.message)
      : SYNC_STATUS_MESSAGES.failedDuringProcessingWithReason(err.message);

  if (data.type === "item") {
    const cleanupLog = createLogger<WorkerJobContext>({
      ...createDefaultJobContext(),
      action: "worker.cleanup",
    });
    cleanupLog.set({
      outcome: "error",
      queue: { name: SYNC_QUEUE_NAME, jobName: job.name },
      job: { id: job.id },
      sync: { type: data.type, sessionId: syncSessionId },
      user: { id: data.userId },
    });
    cleanupLog.error(err);
    try {
      await finalizeItemSync({
        successfulResults: [],
        itemExternalIds: data.itemExternalIds,
        existingCount: data.existingCount,
        syncSessionId,
        redis,
        log: cleanupLog,
        workerError: createError({ message: failedStatusMessage, cause: err }),
        state: createJobStatusState({
          jobId: job.id,
          totalItems: data.itemExternalIds.length,
          phase: "persisting",
          statusMessage: "Checking saved items",
        }),
      });
    } catch (error) {
      cleanupLog.error(error instanceof Error ? error : new Error("Failed to finalize Item sync"));
    } finally {
      cleanupLog.emit();
    }
    return;
  }

  const getExistingCount = (): number => {
    if (data.type === "csv") return data.itemsToInsert.length;
    if (data.type === "order" || data.type === "order-item") {
      return data.order.itemsToInsert.length;
    }
    return data.collection.itemsToInsert.length;
  };
  const existingCount = getExistingCount();
  const getScrapeRowCount = (): number => {
    if (data.type === "csv") return data.items.length;
    if (data.type === "order" || data.type === "order-item") return data.order.itemsToScrape.length;
    return data.collection.itemsToScrape.length;
  };
  const scrapeRowCount = getScrapeRowCount();

  const successCount = 0;
  const failCount = scrapeRowCount + existingCount;
  const sessionStatus = "failed" as const;

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
