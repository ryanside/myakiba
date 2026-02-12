import { db } from "@myakiba/db";
import { syncSession, syncSessionItem } from "@myakiba/db/schema/figure";
import { and, eq, inArray } from "drizzle-orm";
import type {
  SetJobStatusParams,
  BatchUpdateSyncSessionItemStatusesParams,
  MarkPersistFailedSyncSessionItemStatusesParams,
  UpdateSyncSessionCountsParams,
} from "./types";
import { env } from "@myakiba/env/worker";
import { JOB_STATUS_TTL_SECONDS } from "@myakiba/constants";

export const createFetchOptions = (image: boolean = false) => ({
  proxy: env.HTTP_PROXY,
  tls: {
    rejectUnauthorized: false,
  },
  headers: {
    ...(!image && { "Accept-Encoding": "gzip, deflate, br" }),
  },
  signal: AbortSignal.timeout(10000),
});

/**
 * Writes job status to Redis (for SSE polling) and optionally
 * dual-writes to Postgres sync_session for durability.
 */
export const setJobStatus = async ({
  redis,
  jobId,
  statusMessage,
  finished,
  syncSessionId,
  sessionStatus,
}: SetJobStatusParams): Promise<void> => {
  const terminalState =
    finished === true && sessionStatus != null
      ? sessionStatus === "completed" || sessionStatus === "partial"
        ? "success"
        : "error"
      : null;

  await redis.set(
    `job:${jobId}:status`,
    JSON.stringify({
      status: statusMessage,
      finished: finished,
      createdAt: new Date().toISOString(),
      terminalState,
    }),
    "EX",
    JOB_STATUS_TTL_SECONDS,
  );

  if (syncSessionId && sessionStatus) {
    await db
      .update(syncSession)
      .set({
        statusMessage,
        status: sessionStatus,
        updatedAt: new Date(),
        ...(finished ? { completedAt: new Date() } : {}),
      })
      .where(eq(syncSession.id, syncSessionId));
  }
};

/**
 * Batch-updates sync_session_item statuses in Postgres.
 * Called once after all scraping completes, marking scraped and failed items
 * in one or two queries instead of per-item writes.
 */
export const batchUpdateSyncSessionItemStatuses = async ({
  syncSessionId,
  scrapedItemIds,
  failedItemIds,
}: BatchUpdateSyncSessionItemStatusesParams): Promise<void> => {
  await db.transaction(async (tx) => {
    if (scrapedItemIds.length > 0) {
      await tx
        .update(syncSessionItem)
        .set({
          status: "scraped",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(syncSessionItem.syncSessionId, syncSessionId),
            inArray(syncSessionItem.itemExternalId, [...scrapedItemIds]),
          ),
        );
    }

    if (failedItemIds.length > 0) {
      await tx
        .update(syncSessionItem)
        .set({
          status: "failed",
          errorReason: "Scraping failed after max retries",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(syncSessionItem.syncSessionId, syncSessionId),
            inArray(syncSessionItem.itemExternalId, [...failedItemIds]),
          ),
        );
    }
  });
};

/**
 * Marks previously scraped sync_session_item rows as failed when persistence fails.
 * This keeps retry semantics consistent because /sync/retry claims failed rows only.
 */
export const markPersistFailedSyncSessionItemStatuses = async ({
  syncSessionId,
  scrapedItemIds,
  errorReason,
}: MarkPersistFailedSyncSessionItemStatusesParams): Promise<void> => {
  if (scrapedItemIds.length === 0) {
    return;
  }

  await db
    .update(syncSessionItem)
    .set({
      status: "failed",
      errorReason,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(syncSessionItem.syncSessionId, syncSessionId),
        eq(syncSessionItem.status, "scraped"),
        inArray(syncSessionItem.itemExternalId, [...scrapedItemIds]),
      ),
    );
};

/**
 * Updates the final success/fail counts on a sync_session.
 * Called after finalization or when all items fail scraping.
 */
export const updateSyncSessionCounts = async ({
  syncSessionId,
  successCount,
  failCount,
}: UpdateSyncSessionCountsParams): Promise<void> => {
  await db
    .update(syncSession)
    .set({
      successCount,
      failCount,
      updatedAt: new Date(),
    })
    .where(eq(syncSession.id, syncSessionId));
};
