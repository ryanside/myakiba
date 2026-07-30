import { Worker } from "bullmq";
import type { Job } from "bullmq";
import { and, eq, inArray } from "drizzle-orm";
import { createLogger, log } from "evlog";
import type {
  DataTransferImportResult,
  DataTransferImportTerminalStatus,
} from "@myakiba/contracts/data-transfer/schema";
import { db } from "@myakiba/db/client";
import { dataTransferImport } from "@myakiba/db/schema/figure";
import { env } from "@myakiba/env/worker";
import {
  DATA_TRANSFER_IMPORT_QUEUE_NAME,
  dataTransferImportJobSchema,
} from "@myakiba/redis/data-transfer";
import type { DataTransferImportJobPayload } from "@myakiba/redis/data-transfer";
import { redis } from "@myakiba/redis/client";
import { writeJobStatusSnapshotAndPublish } from "@myakiba/redis/job-status";
import { tryCatch } from "@myakiba/utils/result";
import { processDataTransferImportJob } from "./process-import-job";

type ImportJob = Job<DataTransferImportJobPayload, DataTransferImportResult>;

const publishTerminalStatus = async (
  job: ImportJob,
  terminalStatus: DataTransferImportTerminalStatus,
  source: "completed" | "failed",
): Promise<void> => {
  try {
    const jobId = job.id;
    if (!jobId) throw new Error("DATA_TRANSFER_IMPORT_JOB_ID_MISSING");

    const payload = dataTransferImportJobSchema.safeParse(job.data);
    if (!payload.success || payload.data.jobId !== jobId) {
      throw new Error("DATA_TRANSFER_IMPORT_JOB_PAYLOAD_INVALID");
    }

    const [current] = await db
      .select({ jobId: dataTransferImport.jobId })
      .from(dataTransferImport)
      .where(
        and(
          eq(dataTransferImport.userId, payload.data.userId),
          eq(dataTransferImport.jobId, jobId),
        ),
      )
      .limit(1);
    if (!current) return;

    await writeJobStatusSnapshotAndPublish(redis, jobId, {
      jobId,
      progress: null,
      recentItems: [],
      startedAt: new Date(job.processedOn ?? job.timestamp).toISOString(),
      updatedAt: new Date(job.finishedOn ?? job.processedOn ?? job.timestamp).toISOString(),
      ...terminalStatus,
    });
  } catch (error) {
    const publicationLog = createLogger({
      action: "data-transfer.terminal-status",
      outcome: "error",
      queue: { name: DATA_TRANSFER_IMPORT_QUEUE_NAME },
      job: { id: job.id ?? null, name: job.name },
      source,
    });
    publicationLog.error(
      error instanceof Error
        ? error
        : new Error("Failed to publish terminal import status", { cause: error }),
    );
    publicationLog.emit();
  }
};

export const dataTransferImportWorker = new Worker<
  DataTransferImportJobPayload,
  DataTransferImportResult
>(DATA_TRANSFER_IMPORT_QUEUE_NAME, processDataTransferImportJob, {
  connection: {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    retryStrategy(times: number): number {
      return Math.max(Math.min(Math.exp(times), 20_000), 1000);
    },
  },
  concurrency: 1,
});

dataTransferImportWorker.on("ready", () => {
  log.info({
    action: "worker.ready",
    outcome: "success",
    queue: { name: DATA_TRANSFER_IMPORT_QUEUE_NAME },
  });
});

dataTransferImportWorker.on("error", (error) => {
  const runtimeLog = createLogger({
    action: "worker.runtime",
    outcome: "error",
    queue: { name: DATA_TRANSFER_IMPORT_QUEUE_NAME },
  });
  runtimeLog.error(error);
  runtimeLog.emit();
});

dataTransferImportWorker.on("completed", (job, result) => {
  switch (result.status) {
    case "completed":
      void publishTerminalStatus(
        job,
        {
          phase: "completed",
          statusMessage: "Import completed.",
          terminalState: "success",
          error: null,
        },
        "completed",
      );
      return;
    case "partial":
      void publishTerminalStatus(
        job,
        {
          phase: "completed",
          statusMessage: "Import completed with skipped records.",
          terminalState: "partial",
          error: null,
        },
        "completed",
      );
      return;
    case "failed": {
      const statusMessage = result.error ?? "Import failed.";
      void publishTerminalStatus(
        job,
        {
          phase: "failed",
          statusMessage,
          terminalState: "error",
          error: { code: "unknown", message: statusMessage },
        },
        "completed",
      );
      return;
    }
    default: {
      const _exhaustive: never = result.status;
      throw new Error(`Unexpected import status: ${_exhaustive}`);
    }
  }
});

dataTransferImportWorker.on("failed", async (job, error) => {
  const failedLog = createLogger({
    action: "data-transfer.import-failed",
    outcome: "error",
    queue: { name: DATA_TRANSFER_IMPORT_QUEUE_NAME },
    job: { id: job?.id ?? null, name: job?.name ?? null },
  });
  failedLog.error(error);
  failedLog.emit();

  if (!job?.id) return;

  const payload = dataTransferImportJobSchema.safeParse(job.data);
  if (!payload.success || payload.data.jobId !== job.id) return;

  const statusMessage = "The import stopped unexpectedly. Try again to continue.";
  const { data: failedRows, error: persistenceError } = await tryCatch(
    db
      .update(dataTransferImport)
      .set({
        status: "failed",
        phase: "failed",
        error: statusMessage,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(dataTransferImport.userId, payload.data.userId),
          eq(dataTransferImport.jobId, job.id),
          inArray(dataTransferImport.status, ["queued", "running"]),
        ),
      )
      .returning({ jobId: dataTransferImport.jobId }),
  );
  if (persistenceError) {
    const persistenceLog = createLogger({
      action: "data-transfer.import-failed",
      outcome: "error",
      queue: { name: DATA_TRANSFER_IMPORT_QUEUE_NAME },
      job: { id: job.id, name: job.name },
      step: "persist-terminal-state",
    });
    persistenceLog.error(persistenceError);
    persistenceLog.emit();
  } else if (failedRows.length === 0) {
    return;
  }

  await publishTerminalStatus(
    job,
    {
      phase: "failed",
      statusMessage,
      terminalState: "error",
      error: { code: "unknown", message: statusMessage },
    },
    "failed",
  );
});
