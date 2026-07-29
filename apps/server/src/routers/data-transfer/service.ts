import { Buffer } from "node:buffer";
import { createId } from "@paralleldrive/cuid2";
import { Queue } from "bullmq";
import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { createLogger } from "evlog";
import { db } from "@myakiba/db/client";
import {
  collection as collectionTable,
  dataTransferImport,
  item as itemTable,
  item_release as itemReleaseTable,
  order as orderTable,
} from "@myakiba/db/schema/figure";
import { env } from "@myakiba/env/server";
import {
  DATA_TRANSFER_FORMAT,
  DATA_TRANSFER_MAX_BYTES,
  DATA_TRANSFER_MAX_RECORDS,
  DATA_TRANSFER_VERSION,
  dataTransferArchiveV1Schema,
  dataTransferImportSchema,
} from "@myakiba/contracts/data-transfer/schema";
import type {
  DataTransferArchiveV1,
  DataTransferImport,
} from "@myakiba/contracts/data-transfer/schema";
import type { SyncJobStatus } from "@myakiba/contracts/sync/schema";
import { DATA_TRANSFER_IMPORT_QUEUE_NAME } from "@myakiba/redis/data-transfer";
import type { DataTransferImportJobPayload } from "@myakiba/redis/data-transfer";
import { redis } from "@myakiba/redis/client";
import { getJobStatusSnapshotKey, parseJobStatusPayload } from "@myakiba/redis/job-status";
import { tryCatch } from "@myakiba/utils/result";

const dataTransferImportQueue = new Queue<DataTransferImportJobPayload>(
  DATA_TRANSFER_IMPORT_QUEUE_NAME,
  {
    connection: {
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      enableOfflineQueue: false,
    },
    defaultJobOptions: {
      removeOnComplete: true,
      removeOnFail: true,
    },
  },
);

const IMPORT_STATUS_CACHE_READ_TIMEOUT_MS = 1000;

dataTransferImportQueue.on("error", (error: Error) => {
  const queueLog = createLogger({
    action: "dataTransfer.queue",
    outcome: "error",
    queue: { name: DATA_TRANSFER_IMPORT_QUEUE_NAME },
  });
  queueLog.error(error);
  queueLog.emit();
});

const readImportStatusCache = async (jobId: string): Promise<string | null> => {
  if (redis.status !== "ready") {
    createLogger({
      action: "dataTransfer.getImportJobStatus",
      outcome: "warn",
      jobId,
      message: "Redis is unavailable; falling back to the database",
    }).emit();
    return null;
  }

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const cacheRead = await tryCatch(
    Promise.race([
      redis.get(getJobStatusSnapshotKey(jobId)),
      new Promise<null>((resolve) => {
        timeoutId = setTimeout(() => {
          createLogger({
            action: "dataTransfer.getImportJobStatus",
            outcome: "warn",
            jobId,
            message: "Redis job status read timed out; falling back to the database",
          }).emit();
          resolve(null);
        }, IMPORT_STATUS_CACHE_READ_TIMEOUT_MS);
      }),
    ]),
  );

  if (timeoutId !== null) clearTimeout(timeoutId);
  if (!cacheRead.error) return cacheRead.data;

  const cacheLog = createLogger({
    action: "dataTransfer.getImportJobStatus",
    outcome: "warn",
    jobId,
    message: "Failed to read Redis job status cache; falling back to the database",
  });
  cacheLog.error(cacheRead.error);
  cacheLog.emit();
  return null;
};

const markEnqueueFailure = async ({
  payload,
  queueError,
}: {
  readonly payload: DataTransferImportJobPayload;
  readonly queueError: unknown;
}): Promise<never> => {
  const errorMessage = "The import could not be queued. Retry it when the queue is available.";
  const now = new Date();

  const { error: persistenceError } = await tryCatch(
    db
      .update(dataTransferImport)
      .set({
        status: "failed",
        phase: "failed",
        error: errorMessage,
        updatedAt: now,
      })
      .where(
        and(
          eq(dataTransferImport.userId, payload.userId),
          eq(dataTransferImport.jobId, payload.jobId),
          eq(dataTransferImport.status, "queued"),
        ),
      ),
  );
  if (persistenceError) {
    const failureLog = createLogger({
      action: "dataTransfer.queueFailure",
      outcome: "error",
      dataTransfer: { importId: payload.jobId },
      step: "markImportFailed",
    });
    failureLog.error(persistenceError);
    failureLog.emit();
  }

  throw new Error("DATA_TRANSFER_QUEUE_UNAVAILABLE", { cause: queueError });
};

const DataTransferService = {
  async exportArchive(userId: string): Promise<DataTransferArchiveV1> {
    const { orders, collectionItems } = await db.transaction(
      async (transaction) => {
        const orderRows = await transaction
          .select({
            id: orderTable.id,
            title: orderTable.title,
            shop: orderTable.shop,
            orderDate: orderTable.orderDate,
            releaseDate: orderTable.releaseDate,
            paymentDate: orderTable.paymentDate,
            shippingDate: orderTable.shippingDate,
            collectionDate: orderTable.collectionDate,
            shippingMethod: orderTable.shippingMethod,
            status: orderTable.status,
            shippingFee: orderTable.shippingFee,
            taxes: orderTable.taxes,
            duties: orderTable.duties,
            tariffs: orderTable.tariffs,
            miscFees: orderTable.miscFees,
            notes: orderTable.notes,
            createdAt: orderTable.createdAt,
            updatedAt: orderTable.updatedAt,
          })
          .from(orderTable)
          .where(eq(orderTable.userId, userId))
          .orderBy(asc(orderTable.createdAt), asc(orderTable.id))
          .limit(DATA_TRANSFER_MAX_RECORDS + 1);

        if (orderRows.length > DATA_TRANSFER_MAX_RECORDS) {
          throw new Error("DATA_TRANSFER_ARCHIVE_TOO_MANY_RECORDS");
        }

        const collectionRows = await transaction
          .select({
            id: collectionTable.id,
            orderId: collectionTable.orderId,
            status: collectionTable.status,
            count: collectionTable.count,
            score: collectionTable.score,
            price: collectionTable.price,
            shop: collectionTable.shop,
            orderDate: collectionTable.orderDate,
            paymentDate: collectionTable.paymentDate,
            shippingDate: collectionTable.shippingDate,
            collectionDate: collectionTable.collectionDate,
            shippingMethod: collectionTable.shippingMethod,
            soldFor: collectionTable.soldFor,
            soldDate: collectionTable.soldDate,
            tags: collectionTable.tags,
            condition: collectionTable.condition,
            notes: collectionTable.notes,
            createdAt: collectionTable.createdAt,
            updatedAt: collectionTable.updatedAt,
            itemExternalId: itemTable.externalId,
            itemSource: itemTable.source,
            itemTitle: itemTable.title,
            releaseDate: itemReleaseTable.date,
            releaseType: itemReleaseTable.type,
            releasePrice: itemReleaseTable.price,
            releasePriceCurrency: itemReleaseTable.priceCurrency,
            releaseBarcode: itemReleaseTable.barcode,
          })
          .from(collectionTable)
          .innerJoin(itemTable, eq(collectionTable.itemId, itemTable.id))
          .leftJoin(
            itemReleaseTable,
            and(
              eq(collectionTable.releaseId, itemReleaseTable.id),
              eq(itemReleaseTable.itemId, itemTable.id),
            ),
          )
          .where(eq(collectionTable.userId, userId))
          .orderBy(asc(collectionTable.createdAt), asc(collectionTable.id))
          .limit(DATA_TRANSFER_MAX_RECORDS - orderRows.length + 1);

        if (orderRows.length + collectionRows.length > DATA_TRANSFER_MAX_RECORDS) {
          throw new Error("DATA_TRANSFER_ARCHIVE_TOO_MANY_RECORDS");
        }

        return { orders: orderRows, collectionItems: collectionRows };
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );

    const orderKeysById = new Map(orders.map((order, index) => [order.id, `order-${index + 1}`]));

    const exportedOrders: DataTransferArchiveV1["orders"] = orders.map((order, index) => ({
      orderKey: `order-${index + 1}`,
      title: order.title,
      shop: order.shop,
      orderDate: order.orderDate,
      releaseDate: order.releaseDate,
      paymentDate: order.paymentDate,
      shippingDate: order.shippingDate,
      collectionDate: order.collectionDate,
      shippingMethod: order.shippingMethod,
      status: order.status,
      shippingFee: order.shippingFee,
      taxes: order.taxes,
      duties: order.duties,
      tariffs: order.tariffs,
      miscFees: order.miscFees,
      notes: order.notes,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    }));

    const exportedCollectionItems: DataTransferArchiveV1["collectionItems"] = collectionItems.map(
      (collectionItem, index) => {
        if (collectionItem.itemSource !== "mfc" || collectionItem.itemExternalId === null) {
          throw new Error("DATA_TRANSFER_UNSUPPORTED_COLLECTION_ITEM");
        }

        return {
          collectionKey: `collection-${index + 1}`,
          orderKey: collectionItem.orderId
            ? (orderKeysById.get(collectionItem.orderId) ?? null)
            : null,
          status: collectionItem.status,
          count: collectionItem.count,
          score: collectionItem.score,
          price: collectionItem.price,
          shop: collectionItem.shop,
          orderDate: collectionItem.orderDate,
          paymentDate: collectionItem.paymentDate,
          shippingDate: collectionItem.shippingDate,
          collectionDate: collectionItem.collectionDate,
          shippingMethod: collectionItem.shippingMethod,
          soldFor: collectionItem.soldFor,
          soldDate: collectionItem.soldDate,
          tags: collectionItem.tags,
          condition: collectionItem.condition,
          notes: collectionItem.notes,
          createdAt: collectionItem.createdAt.toISOString(),
          updatedAt: collectionItem.updatedAt.toISOString(),
          item: {
            source: "mfc",
            externalId: collectionItem.itemExternalId,
            sourceTitle: collectionItem.itemTitle,
            selectedRelease:
              collectionItem.releaseDate === null
                ? null
                : {
                    date: collectionItem.releaseDate,
                    type: collectionItem.releaseType,
                    price: collectionItem.releasePrice,
                    priceCurrency: collectionItem.releasePriceCurrency,
                    barcode: collectionItem.releaseBarcode,
                  },
          },
        };
      },
    );

    if (exportedOrders.length === 0 && exportedCollectionItems.length === 0) {
      throw new Error("DATA_TRANSFER_ARCHIVE_EMPTY");
    }

    const archive = dataTransferArchiveV1Schema.parse({
      format: DATA_TRANSFER_FORMAT,
      version: DATA_TRANSFER_VERSION,
      exportId: createId(),
      exportedAt: new Date().toISOString(),
      source: { application: "myakiba" },
      orders: exportedOrders,
      collectionItems: exportedCollectionItems,
    });

    if (
      Buffer.byteLength(`${JSON.stringify(archive, null, 2)}\n`, "utf-8") > DATA_TRANSFER_MAX_BYTES
    ) {
      throw new Error("DATA_TRANSFER_ARCHIVE_TOO_LARGE");
    }
    return archive;
  },

  async startImport({
    userId,
    fileName,
    archive,
  }: {
    readonly userId: string;
    readonly fileName: string;
    readonly archive: DataTransferArchiveV1;
  }): Promise<DataTransferImport> {
    if (Buffer.byteLength(JSON.stringify(archive), "utf-8") > DATA_TRANSFER_MAX_BYTES) {
      throw new Error("DATA_TRANSFER_ARCHIVE_TOO_LARGE");
    }
    const jobId = `data-transfer-import-${createId()}`;
    const now = new Date();

    const currentImport = await db.transaction(
      async (transaction) => {
        await transaction.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${userId}, 0))`,
        );

        const [existing] = await transaction
          .select({ status: dataTransferImport.status })
          .from(dataTransferImport)
          .where(eq(dataTransferImport.userId, userId))
          .limit(1);

        if (existing?.status === "queued" || existing?.status === "running") {
          throw new Error("DATA_TRANSFER_ACTIVE_IMPORT");
        }

        const [saved] = await transaction
          .insert(dataTransferImport)
          .values({
            userId,
            jobId,
            fileName,
            status: "queued",
            phase: "queued",
            archive,
            startedAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: dataTransferImport.userId,
            set: {
              jobId,
              fileName,
              archive,
              status: "queued",
              phase: "queued",
              report: null,
              importedOrders: 0,
              importedCollectionItems: 0,
              failedCollectionItems: 0,
              error: null,
              startedAt: now,
              updatedAt: now,
            },
          })
          .returning({
            jobId: dataTransferImport.jobId,
            fileName: dataTransferImport.fileName,
            status: dataTransferImport.status,
            importedOrders: dataTransferImport.importedOrders,
            importedCollectionItems: dataTransferImport.importedCollectionItems,
            failedCollectionItems: dataTransferImport.failedCollectionItems,
            report: dataTransferImport.report,
            error: dataTransferImport.error,
          });

        if (!saved) throw new Error("DATA_TRANSFER_IMPORT_NOT_SAVED");
        return dataTransferImportSchema.parse({
          id: saved.jobId,
          fileName: saved.fileName,
          status: saved.status,
          importedOrders: saved.importedOrders,
          importedCollectionItems: saved.importedCollectionItems,
          failedCollectionItems: saved.failedCollectionItems,
          report: saved.report,
          error: saved.error,
        });
      },
      { isolationLevel: "read committed" },
    );

    const payload = { userId, jobId } satisfies DataTransferImportJobPayload;

    const { error: queueError } = await tryCatch(
      dataTransferImportQueue.add("data-transfer-import", payload, {
        jobId: payload.jobId,
      }),
    );
    if (queueError) {
      return markEnqueueFailure({ payload, queueError });
    }
    return currentImport;
  },

  async getCurrentImport(userId: string): Promise<DataTransferImport | null> {
    const [current] = await db
      .select({
        jobId: dataTransferImport.jobId,
        fileName: dataTransferImport.fileName,
        status: dataTransferImport.status,
        importedOrders: dataTransferImport.importedOrders,
        importedCollectionItems: dataTransferImport.importedCollectionItems,
        failedCollectionItems: dataTransferImport.failedCollectionItems,
        report: dataTransferImport.report,
        error: dataTransferImport.error,
      })
      .from(dataTransferImport)
      .where(eq(dataTransferImport.userId, userId))
      .limit(1);

    if (!current) return null;

    const currentImport = dataTransferImportSchema.parse({
      id: current.jobId,
      fileName: current.fileName,
      status: current.status,
      importedOrders: current.importedOrders,
      importedCollectionItems: current.importedCollectionItems,
      failedCollectionItems: current.failedCollectionItems,
      report: current.report,
      error: current.error,
    });
    if (currentImport.status === "queued") {
      const { error } = await tryCatch(
        dataTransferImportQueue.add(
          "data-transfer-import",
          { userId, jobId: currentImport.id },
          {
            jobId: currentImport.id,
          },
        ),
      );
      if (error) {
        const recoveryLog = createLogger({
          action: "dataTransfer.queueRecovery",
          outcome: "error",
          dataTransfer: { importId: currentImport.id },
        });
        recoveryLog.error(error);
        recoveryLog.emit();
      }
    }
    return currentImport;
  },

  async getImportJobStatus(userId: string): Promise<SyncJobStatus | null> {
    const [currentImport] = await db
      .select({
        jobId: dataTransferImport.jobId,
        status: dataTransferImport.status,
        phase: dataTransferImport.phase,
        error: dataTransferImport.error,
        startedAt: dataTransferImport.startedAt,
        updatedAt: dataTransferImport.updatedAt,
      })
      .from(dataTransferImport)
      .where(eq(dataTransferImport.userId, userId))
      .limit(1);

    if (!currentImport) return null;

    const isActive = currentImport.status === "queued" || currentImport.status === "running";
    const cached = isActive ? await readImportStatusCache(currentImport.jobId) : null;

    if (cached) {
      const parsed = parseJobStatusPayload(cached);
      if (parsed && (currentImport.phase !== "writing_records" || parsed.phase === "persisting")) {
        return parsed;
      }

      if (!parsed) {
        createLogger({
          action: "dataTransfer.getImportJobStatus",
          outcome: "warn",
          jobId: currentImport.jobId,
          message: "Corrupt Redis job status cache; falling back to the database",
        }).emit();
      }
    }

    let phase: SyncJobStatus["phase"];
    switch (currentImport.phase) {
      case "queued":
        phase = "queued";
        break;
      case "preparing_items":
        phase = "scraping";
        break;
      case "writing_records":
        phase = "persisting";
        break;
      case "completed":
        phase = "completed";
        break;
      case "failed":
        phase = "failed";
        break;
      default: {
        const exhaustive: never = currentImport.phase;
        phase = exhaustive;
      }
    }

    let terminalState: SyncJobStatus["terminalState"] = null;
    if (currentImport.status === "completed") terminalState = "success";
    else if (currentImport.status === "partial") terminalState = "partial";
    else if (currentImport.status === "failed") terminalState = "error";

    let statusMessage = "Waiting for the import worker…";
    if (currentImport.phase === "preparing_items") {
      statusMessage = "Checking items already in myakiba…";
    } else if (currentImport.phase === "writing_records") {
      statusMessage = "Writing imported records…";
    } else if (currentImport.status === "completed") statusMessage = "Import completed.";
    else if (currentImport.status === "partial") {
      statusMessage = "Import completed with skipped records.";
    } else if (currentImport.status === "failed") {
      statusMessage = currentImport.error ?? "Import failed.";
    }

    return {
      jobId: currentImport.jobId,
      phase,
      statusMessage,
      progress: null,
      recentItems: [],
      error:
        currentImport.status === "failed"
          ? { code: "unknown", message: currentImport.error ?? "Import failed." }
          : null,
      startedAt: currentImport.startedAt.toISOString(),
      updatedAt: currentImport.updatedAt.toISOString(),
      terminalState,
    };
  },

  async deleteCurrentImport(
    userId: string,
  ): Promise<
    | { readonly kind: "deleted"; readonly id: string }
    | { readonly kind: "active" }
    | { readonly kind: "not_found" }
  > {
    return db.transaction(
      async (transaction) => {
        await transaction.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${userId}, 0))`,
        );

        const [deleted] = await transaction
          .delete(dataTransferImport)
          .where(
            and(
              eq(dataTransferImport.userId, userId),
              inArray(dataTransferImport.status, ["completed", "partial", "failed"]),
            ),
          )
          .returning({ id: dataTransferImport.jobId });

        if (deleted) return { kind: "deleted", id: deleted.id };

        const [current] = await transaction
          .select({ status: dataTransferImport.status })
          .from(dataTransferImport)
          .where(eq(dataTransferImport.userId, userId))
          .limit(1);

        if (current?.status === "queued" || current?.status === "running") {
          return { kind: "active" };
        }
        return { kind: "not_found" };
      },
      { isolationLevel: "read committed" },
    );
  },

  async retryImport(userId: string): Promise<DataTransferImport> {
    const jobId = `data-transfer-import-${createId()}`;
    const now = new Date();
    const currentImport = await db.transaction(
      async (transaction) => {
        await transaction.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${userId}, 0))`,
        );

        const [retrying] = await transaction
          .update(dataTransferImport)
          .set({
            jobId,
            status: "queued",
            phase: "queued",
            importedOrders: 0,
            importedCollectionItems: 0,
            failedCollectionItems: 0,
            report: null,
            error: null,
            startedAt: now,
            updatedAt: now,
          })
          .where(
            and(
              eq(dataTransferImport.userId, userId),
              inArray(dataTransferImport.status, ["partial", "failed"]),
              isNotNull(dataTransferImport.archive),
            ),
          )
          .returning({
            jobId: dataTransferImport.jobId,
            fileName: dataTransferImport.fileName,
            status: dataTransferImport.status,
            importedOrders: dataTransferImport.importedOrders,
            importedCollectionItems: dataTransferImport.importedCollectionItems,
            failedCollectionItems: dataTransferImport.failedCollectionItems,
            report: dataTransferImport.report,
            error: dataTransferImport.error,
          });

        if (!retrying) {
          throw new Error("DATA_TRANSFER_IMPORT_NOT_RETRYABLE");
        }

        return dataTransferImportSchema.parse({
          id: retrying.jobId,
          fileName: retrying.fileName,
          status: retrying.status,
          importedOrders: retrying.importedOrders,
          importedCollectionItems: retrying.importedCollectionItems,
          failedCollectionItems: retrying.failedCollectionItems,
          report: retrying.report,
          error: retrying.error,
        });
      },
      { isolationLevel: "read committed" },
    );

    const payload = { userId, jobId } satisfies DataTransferImportJobPayload;

    const { error: queueError } = await tryCatch(
      dataTransferImportQueue.add("data-transfer-import", payload, {
        jobId: payload.jobId,
      }),
    );
    if (queueError) {
      return markEnqueueFailure({ payload, queueError });
    }
    return currentImport;
  },
};

export default DataTransferService;
