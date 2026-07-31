import type { Job } from "bullmq";
import { and, eq, inArray, sql } from "drizzle-orm";
import { createLogger } from "evlog";
import { dataTransferArchiveV1Schema } from "@myakiba/contracts/data-transfer/schema";
import type {
  DataTransferArchiveV1,
  DataTransferCollectionItemV1,
  DataTransferImportReport,
  DataTransferImportResult,
} from "@myakiba/contracts/data-transfer/schema";
import { db } from "@myakiba/db/client";
import {
  collection as collectionTable,
  dataTransferImport,
  item as itemTable,
  item_release as itemReleaseTable,
  order as orderTable,
} from "@myakiba/db/schema/figure";
import {
  DATA_TRANSFER_IMPORT_QUEUE_NAME,
  dataTransferImportJobSchema,
} from "@myakiba/redis/data-transfer";
import type { DataTransferImportJobPayload } from "@myakiba/redis/data-transfer";
import { redis } from "@myakiba/redis/client";
import { assembleScrapedData } from "../../lib/assemble-scraped-data";
import { createDefaultJobContext } from "../../lib/evlog";
import { persistScrapedCatalog } from "../../lib/persist-scraped-catalog";
import { scrapeItems, scrapedItemsWithRateLimit } from "../../lib/scrape";
import type { WorkerJobContext } from "../../lib/types";
import { createJobStatusState, publishJobStatus } from "../../lib/utils";
import { createImportId, selectRelease } from "./import-domain";
import type { CatalogRelease } from "./import-domain";

const INSERT_BATCH_SIZE = 500;
const SUPERSEDED_IMPORT_ERROR = "This import is no longer current.";
const EMPTY_IMPORT_ERROR = "No orders or collection items could be imported.";
const UNEXPECTED_IMPORT_ERROR = "The import stopped unexpectedly. Try again to continue.";
const FETCHING_ITEM_DATA_MESSAGE = "Fetching item data from MyFigureCollection…";

type CatalogItem = {
  itemId: string;
  releases: CatalogRelease[];
};

type ImportableCollectionRow = {
  row: DataTransferCollectionItemV1;
  itemId: string;
  releaseId: string | null;
};

type ImportPlan = {
  collectionRows: ImportableCollectionRow[];
  failedRows: readonly {
    externalId: number;
    reason: string;
  }[];
  report: DataTransferImportReport;
};

function chunk<T>(values: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

async function loadCatalog(
  externalIds: readonly number[],
): Promise<ReadonlyMap<number, CatalogItem>> {
  const catalog = new Map<number, CatalogItem>();

  for (const externalIdBatch of chunk(externalIds, 500)) {
    const rows = await db
      .select({
        itemId: itemTable.id,
        externalId: itemTable.externalId,
        release: {
          id: itemReleaseTable.id,
          date: itemReleaseTable.date,
          type: itemReleaseTable.type,
          price: itemReleaseTable.price,
          priceCurrency: itemReleaseTable.priceCurrency,
          barcode: itemReleaseTable.barcode,
        },
      })
      .from(itemTable)
      .leftJoin(itemReleaseTable, eq(itemReleaseTable.itemId, itemTable.id))
      .where(and(eq(itemTable.source, "mfc"), inArray(itemTable.externalId, externalIdBatch)));

    for (const row of rows) {
      if (row.externalId === null) continue;

      let catalogItem = catalog.get(row.externalId);
      if (!catalogItem) {
        catalogItem = {
          itemId: row.itemId,
          releases: [],
        };
        catalog.set(row.externalId, catalogItem);
      }

      if (row.release) catalogItem.releases.push(row.release);
    }
  }

  return catalog;
}

function findRowsToScrape({
  rows,
  catalog,
}: {
  readonly rows: readonly DataTransferCollectionItemV1[];
  readonly catalog: ReadonlyMap<number, CatalogItem>;
}): DataTransferCollectionItemV1[] {
  const rowsToScrape: DataTransferCollectionItemV1[] = [];

  for (const row of rows) {
    if (!catalog.has(row.item.externalId)) rowsToScrape.push(row);
  }

  return rowsToScrape;
}

function buildImportPlan({
  archive,
  finalCatalog,
  rowsToScrape,
  scrapedIds,
}: {
  readonly archive: DataTransferArchiveV1;
  readonly finalCatalog: ReadonlyMap<number, CatalogItem>;
  readonly rowsToScrape: readonly DataTransferCollectionItemV1[];
  readonly scrapedIds: ReadonlySet<number>;
}): ImportPlan {
  const collectionRows: ImportableCollectionRow[] = [];
  const failedRows: ImportPlan["failedRows"][number][] = [];
  const failureReasonCounts = new Map<string, number>();
  let releaseSubstitutions = 0;
  let missingReleases = 0;
  const scrapeKeys = new Set(rowsToScrape.map((row) => row.collectionKey));
  const addFailedRow = ({
    externalId,
    reason,
  }: {
    readonly externalId: number;
    readonly reason: string;
  }): void => {
    failedRows.push({ externalId, reason });
    failureReasonCounts.set(reason, (failureReasonCounts.get(reason) ?? 0) + 1);
  };

  for (const row of archive.collectionItems) {
    const externalId = row.item.externalId;
    const requiredScrape = scrapeKeys.has(row.collectionKey);

    if (requiredScrape && !scrapedIds.has(externalId)) {
      addFailedRow({
        externalId,
        reason: "The item could not be fetched from MyFigureCollection after three attempts.",
      });
      continue;
    }

    const catalogItem = finalCatalog.get(externalId);
    if (!catalogItem) {
      addFailedRow({
        externalId,
        reason: "The item was unavailable after fetching its data.",
      });
      continue;
    }

    const requestedRelease = row.item.selectedRelease;
    if (requestedRelease === null) {
      collectionRows.push({ row, itemId: catalogItem.itemId, releaseId: null });
      continue;
    }

    const releaseSelection = selectRelease({
      releases: catalogItem.releases,
      requested: requestedRelease,
    });
    if (releaseSelection.kind === "requested") {
      collectionRows.push({
        row,
        itemId: catalogItem.itemId,
        releaseId: releaseSelection.release.id,
      });
      continue;
    }

    if (releaseSelection.release) {
      collectionRows.push({
        row,
        itemId: catalogItem.itemId,
        releaseId: releaseSelection.release.id,
      });
      releaseSubstitutions += 1;
      continue;
    }

    collectionRows.push({ row, itemId: catalogItem.itemId, releaseId: null });
    missingReleases += 1;
  }

  return {
    collectionRows,
    failedRows,
    report: {
      failureReasons: [...failureReasonCounts].map(([reason, count]) => ({ reason, count })),
      releaseSubstitutions,
      missingReleases,
    },
  };
}

async function writeImport({
  archive,
  importId,
  payload,
  plan,
}: {
  readonly archive: DataTransferArchiveV1;
  readonly importId: string;
  readonly payload: DataTransferImportJobPayload;
  readonly plan: ImportPlan;
}): Promise<DataTransferImportResult> {
  const { userId } = payload;
  const orderRows: (typeof orderTable.$inferInsert)[] = archive.orders.map(
    ({ orderKey, createdAt, updatedAt, ...values }) => ({
      id: createImportId({
        userId,
        importId,
        kind: "order",
        localKey: orderKey,
      }),
      userId,
      ...values,
      createdAt: new Date(createdAt),
      updatedAt: new Date(updatedAt),
    }),
  );
  const collectionRows: (typeof collectionTable.$inferInsert)[] = plan.collectionRows.map(
    ({ row, itemId, releaseId }) => {
      const { collectionKey, orderKey, item: _item, createdAt, updatedAt, ...values } = row;
      return {
        id: createImportId({
          userId,
          importId,
          kind: "collection",
          localKey: collectionKey,
        }),
        userId,
        itemId,
        orderId:
          orderKey === null
            ? null
            : createImportId({
                userId,
                importId,
                kind: "order",
                localKey: orderKey,
              }),
        releaseId,
        ...values,
        createdAt: new Date(createdAt),
        updatedAt: new Date(updatedAt),
      };
    },
  );
  const failedCollectionItems = plan.failedRows.length;
  let status: DataTransferImportResult["status"];
  if (failedCollectionItems === 0) status = "completed";
  else if (orderRows.length + collectionRows.length > 0) status = "partial";
  else status = "failed";

  const { importedOrders, importedCollectionItems } = await db.transaction(async (transaction) => {
    let insertedOrderCount = 0;
    let insertedCollectionItemCount = 0;

    for (const orderBatch of chunk(orderRows, INSERT_BATCH_SIZE)) {
      const insertedOrders = await transaction
        .insert(orderTable)
        .values(orderBatch)
        .onConflictDoNothing({ target: orderTable.id })
        .returning({ id: orderTable.id });
      insertedOrderCount += insertedOrders.length;
    }

    for (const collectionBatch of chunk(collectionRows, INSERT_BATCH_SIZE)) {
      const insertedCollectionItems = await transaction
        .insert(collectionTable)
        .values(collectionBatch)
        .onConflictDoNothing({ target: collectionTable.id })
        .returning({ id: collectionTable.id });
      insertedCollectionItemCount += insertedCollectionItems.length;
    }

    const [saved] = await transaction
      .update(dataTransferImport)
      .set({
        status,
        phase: status === "failed" ? "failed" : "completed",
        archive: status === "completed" ? null : archive,
        report: plan.report,
        importedOrders: sql`${dataTransferImport.importedOrders} + ${insertedOrderCount}`,
        importedCollectionItems: sql`${dataTransferImport.importedCollectionItems} + ${insertedCollectionItemCount}`,
        failedCollectionItems,
        error: status === "failed" ? EMPTY_IMPORT_ERROR : null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(dataTransferImport.userId, payload.userId),
          eq(dataTransferImport.jobId, payload.jobId),
          eq(dataTransferImport.status, "running"),
        ),
      )
      .returning({ jobId: dataTransferImport.jobId });

    if (!saved) throw new Error("DATA_TRANSFER_IMPORT_NO_LONGER_CURRENT");
    return {
      importedOrders: insertedOrderCount,
      importedCollectionItems: insertedCollectionItemCount,
    };
  });

  return {
    status,
    importedOrders,
    importedCollectionItems,
    failedCollectionItems,
    report: plan.report,
    error: status === "failed" ? EMPTY_IMPORT_ERROR : null,
  };
}

function failedImportResult(error: string): DataTransferImportResult {
  return {
    status: "failed",
    importedOrders: 0,
    importedCollectionItems: 0,
    failedCollectionItems: 0,
    report: null,
    error,
  };
}

export async function processDataTransferImportJob(
  job: Job<DataTransferImportJobPayload, DataTransferImportResult>,
): Promise<DataTransferImportResult> {
  const parsedPayload = dataTransferImportJobSchema.safeParse(job.data);
  if (!parsedPayload.success) {
    const invalidPayloadLog = createLogger({
      action: "data-transfer.invalid-payload",
      outcome: "error",
      queue: { name: DATA_TRANSFER_IMPORT_QUEUE_NAME, jobName: job.name },
      job: { id: job.id ?? null, attemptsMade: job.attemptsMade },
      validation: { issueCount: parsedPayload.error.issues.length },
    });
    const error = new Error("Invalid data transfer import job payload", {
      cause: parsedPayload.error,
    });
    invalidPayloadLog.error(error);
    invalidPayloadLog.emit();
    throw error;
  }

  const payload = parsedPayload.data;
  if (!job.id || job.id !== payload.jobId) {
    const missingIdLog = createLogger({
      action: "data-transfer.missing-job-id",
      outcome: "error",
      queue: { name: DATA_TRANSFER_IMPORT_QUEUE_NAME, jobName: job.name },
      job: { id: null, attemptsMade: job.attemptsMade },
    });
    const error = new Error("Data transfer import job is missing an id");
    missingIdLog.error(error);
    missingIdLog.emit();
    throw error;
  }

  const { userId, jobId } = payload;

  const jobLog = createLogger<WorkerJobContext>({
    ...createDefaultJobContext(),
    action: "data-transfer.import",
    queue: { name: DATA_TRANSFER_IMPORT_QUEUE_NAME, jobName: job.name },
    job: {
      id: jobId,
      attemptsMade: job.attemptsMade,
      attemptNumber: job.attemptsMade + 1,
    },
    sync: {
      type: "data-transfer",
      sessionId: jobId,
      jobId,
      orderId: null,
      sessionStatus: "queued",
      statusMessage: null,
    },
    user: { id: userId },
  });
  const jobStatus = createJobStatusState({
    jobId,
    totalItems: 0,
    phase: "queued",
    statusMessage: "Waiting for the import worker…",
  });
  let claimedImport = false;

  try {
    const [claimed] = await db
      .update(dataTransferImport)
      .set({
        status: "running",
        phase: "preparing_items",
        error: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(dataTransferImport.userId, userId),
          eq(dataTransferImport.jobId, jobId),
          inArray(dataTransferImport.status, ["queued", "running"]),
        ),
      )
      .returning({
        archive: dataTransferImport.archive,
        importId: dataTransferImport.importId,
      });
    if (claimed === undefined) {
      jobLog.set({
        outcome: "skipped",
        sync: { sessionStatus: "failed", statusMessage: SUPERSEDED_IMPORT_ERROR },
      });
      return failedImportResult(SUPERSEDED_IMPORT_ERROR);
    }

    claimedImport = true;
    const parsedArchive = dataTransferArchiveV1Schema.safeParse(claimed.archive);
    if (!parsedArchive.success) {
      throw new Error("DATA_TRANSFER_RETAINED_ARCHIVE_INVALID", {
        cause: parsedArchive.error,
      });
    }
    const archive = parsedArchive.data;

    jobLog.set({ sync: { sessionStatus: "running" } });
    jobStatus.phase = "scraping";
    jobStatus.statusMessage = "Checking items already in myakiba…";
    await publishJobStatus({
      redis,
      state: jobStatus,
      terminalState: null,
      error: null,
    });

    const externalIds = [...new Set(archive.collectionItems.map((row) => row.item.externalId))];
    const initialCatalog = await loadCatalog(externalIds);
    const rowsToScrape = findRowsToScrape({
      rows: archive.collectionItems,
      catalog: initialCatalog,
    });
    const scrapeItemIds = [...new Set(rowsToScrape.map((row) => row.item.externalId))];
    const existingItemCount = externalIds.length - scrapeItemIds.length;
    jobStatus.progress =
      externalIds.length > 0
        ? {
            processed: existingItemCount,
            total: externalIds.length,
            succeeded: existingItemCount,
            failed: 0,
          }
        : null;
    if (externalIds.length === 0) {
      jobStatus.statusMessage = "No item data needs to be fetched.";
    } else if (scrapeItemIds.length === 0) {
      jobStatus.statusMessage =
        externalIds.length === 1
          ? "The item is already in myakiba."
          : `All ${externalIds.length} items are already in myakiba.`;
    } else {
      jobStatus.statusMessage = FETCHING_ITEM_DATA_MESSAGE;
    }
    await publishJobStatus({
      redis,
      state: jobStatus,
      terminalState: null,
      error: null,
    });

    const { successful: successfulItems } = await (
      scrapeItemIds.length <= 5 ? scrapeItems : scrapedItemsWithRateLimit
    )({
      itemIds: scrapeItemIds,
      redis,
      state: jobStatus,
      log: jobLog,
      maxRetries: 3,
      baseDelayMs: 1000,
      progressStatusMessage: FETCHING_ITEM_DATA_MESSAGE,
    });

    for (const batch of chunk(successfulItems, 25)) {
      await db.transaction(async (transaction) => {
        await persistScrapedCatalog(transaction, assembleScrapedData(batch));
      });
    }

    const finalCatalog = await loadCatalog(externalIds);
    const plan = buildImportPlan({
      archive,
      finalCatalog,
      rowsToScrape,
      scrapedIds: new Set(successfulItems.map((item) => item.id)),
    });

    const [transitioned] = await db
      .update(dataTransferImport)
      .set({ phase: "writing_records", updatedAt: new Date() })
      .where(
        and(
          eq(dataTransferImport.userId, userId),
          eq(dataTransferImport.jobId, jobId),
          eq(dataTransferImport.status, "running"),
        ),
      )
      .returning({ jobId: dataTransferImport.jobId });
    if (!transitioned) throw new Error("DATA_TRANSFER_IMPORT_NO_LONGER_CURRENT");

    jobStatus.phase = "persisting";
    jobStatus.statusMessage = "Writing imported records…";
    await publishJobStatus({
      redis,
      state: jobStatus,
      terminalState: null,
      error: null,
    });

    const result = await writeImport({
      archive,
      importId: claimed.importId,
      payload,
      plan,
    });
    let outcome: "success" | "partial" | "error";
    if (result.status === "completed") outcome = "success";
    else if (result.status === "partial") outcome = "partial";
    else outcome = "error";

    jobLog.set({
      outcome,
      sync: { sessionStatus: result.status, statusMessage: result.error },
      items: {
        requested: archive.collectionItems.length,
        existing: archive.collectionItems.length - rowsToScrape.length,
        deduped: externalIds.length,
        scraped: successfulItems.length,
        failed: plan.failedRows.length,
        successCount: plan.collectionRows.length,
        failCount: plan.failedRows.length,
        failedIds: [...new Set(plan.failedRows.map((row) => row.externalId))],
      },
      processedAt: new Date().toISOString(),
    });
    return result;
  } catch (error) {
    if (error instanceof Error && error.message === "DATA_TRANSFER_IMPORT_NO_LONGER_CURRENT") {
      jobLog.set({ outcome: "skipped" });
      return failedImportResult(SUPERSEDED_IMPORT_ERROR);
    }

    if (claimedImport) {
      const [failed] = await db
        .update(dataTransferImport)
        .set({
          status: "failed",
          phase: "failed",
          error: UNEXPECTED_IMPORT_ERROR,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(dataTransferImport.userId, userId),
            eq(dataTransferImport.jobId, jobId),
            eq(dataTransferImport.status, "running"),
          ),
        )
        .returning({ jobId: dataTransferImport.jobId });

      if (!failed) {
        jobLog.set({ outcome: "skipped" });
        return failedImportResult(SUPERSEDED_IMPORT_ERROR);
      }
    }

    jobLog.set({ outcome: "error", sync: { sessionStatus: "failed" } });
    jobLog.error(error instanceof Error ? error : new Error(String(error)));
    throw error;
  } finally {
    jobLog.emit();
  }
}
