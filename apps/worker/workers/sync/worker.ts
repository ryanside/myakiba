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

import { SYNC_QUEUE_NAME, ACTIVE_SYNC_SESSION_STATUSES } from "@myakiba/contracts/sync/constants";

async function executeSyncJob({
  job,
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
    queue: { name: SYNC_QUEUE_NAME, jobName: job.name },
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

  // Mark this as processing so an error adding the job to the queue won't mark it as failed.
  // Accept processing sessions too, since BullMQ can restart an interrupted job.
  let [durableSession] = await db
    .update(syncSession)
    .set({ status: "processing", updatedAt: new Date() })
    .where(
      and(
        eq(syncSession.id, syncSessionId),
        inArray(syncSession.status, ACTIVE_SYNC_SESSION_STATUSES),
      ),
    )
    .returning();
  if (!durableSession) {
    [durableSession] = await db.select().from(syncSession).where(eq(syncSession.id, syncSessionId));
  }
  if (!durableSession) throw new Error("SYNC_SESSION_NOT_FOUND");

  const terminalState = sessionStatusToTerminalState(durableSession.status);
  if (terminalState !== null) {
    // A job can restart after saving its result but before BullMQ records it as finished.
    await publishJobStatus({
      redis,
      state: {
        jobId: job.id ?? "",
        startedAt: durableSession.createdAt.toISOString(),
        phase: sessionStatusToPhase(durableSession.status),
        statusMessage: durableSession.statusMessage,
        progress: {
          processed: durableSession.successCount + durableSession.failCount,
          total: durableSession.totalItems,
          succeeded: durableSession.successCount,
          failed: durableSession.failCount,
        },
        recentItems: [],
      },
      syncSessionId,
      terminalState,
      error: null,
    });
    createLogger({
      action: "worker.replay",
      outcome: "skipped",
      queue: { name: SYNC_QUEUE_NAME, jobName: job.name },
      job: { id: job.id },
      syncSessionId,
      sessionStatus: durableSession.status,
    }).emit();
    return {
      processedAt: durableSession.updatedAt.toISOString(),
      successCount: durableSession.successCount,
      failCount: durableSession.failCount,
      sessionStatus: durableSession.status,
      statusMessage: durableSession.statusMessage,
    };
  }

  if (type === "item") {
    const { itemExternalIds, existingCount } = validatedData.data;
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
      scrapeRowCount: missingIds.length,
      existingCount: existingCount + availableIds.size,
      orderId: null,
      finalize: (successfulResults, failures, state, jobLog) =>
        finalizeItemSync({
          successfulResults,
          failures,
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
    const { items: csvItems, itemsToInsert, ordersToInsert } = validatedData.data;
    const existingCount = itemsToInsert.length;
    const itemIds = [...new Set(csvItems.map((item) => item.itemExternalId))];

    return executeSyncJob({
      job,
      type,
      syncSessionId,
      userId,
      itemIds,
      scrapeRowCount: csvItems.length,
      existingCount,
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
          existingCount,
          syncSessionId,
        }),
    });
  }

  if (type === "order" || type === "order-item") {
    const { details, itemsToScrape, itemsToInsert } = validatedData.data.order;
    const existingCount = itemsToInsert.length;
    const itemIds = [...new Set(itemsToScrape.map((item) => item.itemExternalId))];

    return executeSyncJob({
      job,
      type,
      syncSessionId,
      userId,
      itemIds,
      scrapeRowCount: itemsToScrape.length,
      existingCount,
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
          existingCount,
          syncSessionId,
          syncMode: type === "order" ? "create" : "append",
        }),
    });
  }

  const { itemsToScrape, itemsToInsert } = validatedData.data.collection;
  const existingCount = itemsToInsert.length;
  const itemIds = [...new Set(itemsToScrape.map((item) => item.itemExternalId))];

  return executeSyncJob({
    job,
    type,
    syncSessionId,
    userId,
    itemIds,
    scrapeRowCount: itemsToScrape.length,
    existingCount,
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
        existingCount,
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
      sync: { type: session.syncType, sessionId: session.id },
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
        existingCount: parsed.data.existingCount,
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
      failures: [],
      pendingErrorReason: statusMessage,
      statusMessage,
    });
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
