import { Worker } from "bullmq";
import { createError, createLogger, log } from "evlog";
import { tryCatch } from "@myakiba/utils/result";
import { createJobStatusState, persistSyncFailureOutcome, publishJobStatus } from "../../lib/utils";
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

import { SYNC_QUEUE_NAME } from "@myakiba/contracts/sync/constants";

async function executeSyncJob({
  job,
  type,
  syncSessionId,
  userId,
  itemIds,
  initialSuccessCount,
  orderId,
  finalize,
}: ExecuteSyncJobParams): Promise<ProcessSyncJobResult> {
  const jobId = job.id ?? "";
  const jobLog = createLogger<WorkerJobContext>({
    ...createDefaultJobContext(),
    queue: { name: SYNC_QUEUE_NAME, jobName: job.name },
    job: {
      id: job.id ?? null,
      attemptsMade: job.attemptsMade,
      attemptNumber: job.attemptsMade + 1,
    },
    sync: {
      type,
      sessionId: syncSessionId,
      jobId,
      orderId,
      sessionStatus: null,
      statusMessage: null,
    },
    user: { id: userId },
    items: {
      requested: itemIds.length,
      existing: initialSuccessCount,
      deduped: new Set(itemIds).size,
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
        initialSuccessCount,
        context: {
          redis,
          jobId,
          syncSessionId,
          userId,
          log: jobLog,
        },
        finalize: (successfulResults, failures, state) =>
          finalize(successfulResults, failures, state, jobLog),
      }),
    );

    if (error) {
      jobLog.set({ outcome: "error" });
      jobLog.error(error);
      throw error;
    }

    let outcome = "error";
    if (result.sessionStatus === "completed") outcome = "success";
    else if (result.sessionStatus === "partial") outcome = "partial";

    jobLog.set({
      outcome,
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

async function processQueuedSyncJob(job: FullJobData) {
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

    throw createError({
      message: "Invalid sync job payload",
      cause: validatedData.error,
      why: "Job data failed schema validation",
      fix: "Check the job data matches the expected schema",
    });
  }

  const { userId, syncSessionId, type } = validatedData.data;

  const [session] = await db.select().from(syncSession).where(eq(syncSession.id, syncSessionId));
  if (!session) throw new Error("SYNC_SESSION_NOT_FOUND");

  // A retry assigns a new job ID; an older delivery no longer owns this session.
  if (session.jobId !== job.id) {
    log.info({
      action: "worker.replay",
      outcome: "skipped",
      jobId: job.id,
      currentJobId: session.jobId,
      syncSessionId,
    });
    return;
  }

  const terminalState = sessionStatusToTerminalState(session.status);
  if (terminalState !== null) {
    // The result can be saved before BullMQ acknowledges completion.
    await publishJobStatus({
      redis,
      state: {
        jobId: job.id,
        startedAt: session.createdAt.toISOString(),
        phase: sessionStatusToPhase(session.status),
        statusMessage: session.statusMessage,
        progress: {
          processed: session.successCount + session.failCount,
          total: session.totalItems,
          succeeded: session.successCount,
          failed: session.failCount,
        },
        recentItems: [],
      },
      syncSessionId,
      terminalState,
      error: null,
    });
    return {
      processedAt: session.updatedAt.toISOString(),
      successCount: session.successCount,
      failCount: session.failCount,
      sessionStatus: session.status,
      statusMessage: session.statusMessage,
    };
  }

  if (type === "item") {
    const { itemExternalIds } = validatedData.data;
    const initialSuccessCount = session.successCount;
    const availableItems = await db
      .select({ externalId: itemTable.externalId })
      .from(itemTable)
      .where(and(eq(itemTable.source, "mfc"), inArray(itemTable.externalId, itemExternalIds)));
    const availableIds = new Set(availableItems.map((item) => item.externalId));
    const missingIds = itemExternalIds.filter((id) => !availableIds.has(id));

    return executeSyncJob({
      job,
      type,
      syncSessionId,
      userId,
      itemIds: missingIds,
      initialSuccessCount: initialSuccessCount + availableIds.size,
      orderId: null,
      finalize: (successfulResults, failures, state, jobLog) =>
        finalizeItemSync({
          successfulResults,
          failures,
          itemExternalIds,
          initialSuccessCount,
          syncSessionId,
          redis,
          state,
          log: jobLog,
        }),
    });
  }

  if (type === "csv") {
    const { items: csvItems, itemsToInsert, ordersToInsert } = validatedData.data;
    const initialSuccessCount = session.successCount + itemsToInsert.length;
    const itemIds = csvItems.map((item) => item.itemExternalId);

    return executeSyncJob({
      job,
      type,
      syncSessionId,
      userId,
      itemIds,
      initialSuccessCount,
      orderId: null,
      finalize: (successfulResults, failures, state, jobLog) =>
        finalizeCsvSync({
          successfulResults,
          failures,
          log: jobLog,
          userId,
          redis,
          state,
          csvItems,
          itemsToInsert,
          ordersToInsert,
          initialSuccessCount,
          syncSessionId,
        }),
    });
  }

  if (type === "order" || type === "order-item") {
    const { details, itemsToScrape, itemsToInsert } = validatedData.data.order;
    const initialSuccessCount = session.successCount + itemsToInsert.length;
    const itemIds = itemsToScrape.map((item) => item.itemExternalId);

    return executeSyncJob({
      job,
      type,
      syncSessionId,
      userId,
      itemIds,
      initialSuccessCount,
      orderId: details.id,
      finalize: (successfulResults, failures, state, jobLog) =>
        finalizeOrderSync({
          successfulResults,
          failures,
          log: jobLog,
          redis,
          state,
          details,
          itemsToScrape,
          itemsToInsert,
          initialSuccessCount,
          syncSessionId,
          createOrder: type === "order" && session.successCount === 0,
        }),
    });
  }

  const { itemsToScrape, itemsToInsert } = validatedData.data.collection;
  const initialSuccessCount = session.successCount + itemsToInsert.length;
  const itemIds = itemsToScrape.map((item) => item.itemExternalId);

  return executeSyncJob({
    job,
    type,
    syncSessionId,
    userId,
    itemIds,
    initialSuccessCount,
    orderId: null,
    finalize: (successfulResults, failures, state, jobLog) =>
      finalizeCollectionSync({
        successfulResults,
        failures,
        log: jobLog,
        redis,
        state,
        itemsToScrape,
        itemsToInsert,
        initialSuccessCount,
        syncSessionId,
      }),
  });
}

export const syncWorker = new Worker(SYNC_QUEUE_NAME, processQueuedSyncJob, {
  connection: {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    retryStrategy(times: number): number {
      return Math.max(Math.min(Math.exp(times), 20_000), 1000);
    },
  },
  concurrency: 50,
});

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

async function handleSyncJobFailure(job: FullJobData, cause: unknown): Promise<void> {
  const cleanupLog = createLogger<WorkerJobContext>({
    ...createDefaultJobContext(),
    action: "worker.cleanup",
    outcome: "error",
    queue: { name: SYNC_QUEUE_NAME, jobName: job.name },
    job: { id: job.id },
  });
  const error = cause instanceof Error ? cause : new Error("Sync job failed", { cause });

  try {
    // Use the queue's job ID to find the session even if the job data is unreadable.
    const [session] = await db
      .select()
      .from(syncSession)
      .where(eq(syncSession.jobId, job.id ?? ""));
    if (!session || sessionStatusToTerminalState(session.status) !== null) return;

    const parsed = jobDataSchema.safeParse(job.data);
    const statusMessage =
      session.status === "pending"
        ? SYNC_STATUS_MESSAGES.failedBeforeStart
        : SYNC_STATUS_MESSAGES.failedDuringProcessing;
    cleanupLog.set({
      sync: {
        type: session.syncType,
        sessionId: session.id,
      },
      user: { id: session.userId },
    });
    cleanupLog.error(error);

    const state = {
      ...createJobStatusState({
        jobId: job.id ?? "",
        totalItems: session.totalItems,
        phase: "failed",
        statusMessage,
      }),
      startedAt: session.createdAt.toISOString(),
    };
    if (parsed.success && parsed.data.type === "item") {
      await finalizeItemSync({
        successfulResults: [],
        failures: parsed.data.itemExternalIds.map((id) => ({ id, errorReason: statusMessage })),
        itemExternalIds: parsed.data.itemExternalIds,
        initialSuccessCount: session.successCount,
        syncSessionId: session.id,
        redis,
        state,
        log: cleanupLog,
        workerError: error,
      });
      return;
    }

    const result = await persistSyncFailureOutcome({
      syncSessionId: session.id,
      jobId: job.id ?? "",
      failures: [],
      pendingErrorReason: statusMessage,
      statusMessage,
    });
    if (result.jobId !== job.id) return;
    state.phase = sessionStatusToPhase(result.status);
    state.statusMessage = result.statusMessage;
    state.progress = {
      processed: result.successCount + result.failCount,
      total: result.totalItems,
      succeeded: result.successCount,
      failed: result.failCount,
    };
    await publishJobStatus({
      redis,
      state,
      syncSessionId: session.id,
      terminalState: sessionStatusToTerminalState(result.status),
      error:
        result.status === "failed" || result.status === "partial"
          ? { code: parsed.success ? "unknown" : "invalid_payload", message: statusMessage }
          : null,
    });
  } catch (cleanupError) {
    cleanupLog.error(
      cleanupError instanceof Error
        ? cleanupError
        : new Error("Sync cleanup failed", { cause: cleanupError }),
    );
  } finally {
    cleanupLog.emit();
  }
}

// BullMQ can fail a job that keeps getting stuck before trying to run it again.
// Wait for that cleanup to finish before shutting down.
const pendingFailureCleanups = new Set<Promise<void>>();
syncWorker.on("failed", async (job, error) => {
  if (!job) return;
  const cleanup = handleSyncJobFailure(job, error);
  pendingFailureCleanups.add(cleanup);
  try {
    await cleanup;
  } finally {
    pendingFailureCleanups.delete(cleanup);
  }
});

export async function closeSyncWorker(): Promise<void> {
  await syncWorker.close();
  await Promise.all(pendingFailureCleanups);
}
