import { Buffer } from "node:buffer";
import { createId } from "@paralleldrive/cuid2";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@myakiba/db/client";
import { advanceOrderReleaseDatesForCollectionItems } from "@myakiba/db/order-release-date";
import {
  collection as collectionTable,
  dataTransferImport,
  dataTransferImportItem,
  item as itemTable,
  item_release as itemReleaseTable,
  order as orderTable,
} from "@myakiba/db/schema/figure";
import type { Tx } from "@myakiba/db/tx";
import {
  DATA_TRANSFER_FORMAT,
  DATA_TRANSFER_IMPORT_INTERRUPTED_REASON,
  DATA_TRANSFER_MAX_BYTES,
  DATA_TRANSFER_MAX_RECORDS,
  DATA_TRANSFER_VERSION,
  dataTransferArchiveV1Schema,
} from "@myakiba/contracts/data-transfer/schema";
import type {
  DataTransferArchiveV1,
  DataTransferCollectionItemV1,
  DataTransferImport,
  DataTransferImportItemFailure,
  DataTransferImportItemUpload,
  DataTransferImportRun,
} from "@myakiba/contracts/data-transfer/schema";
import type { SyncJobStatus } from "@myakiba/contracts/sync/schema";
import { ensureMfcItem, prepareMfcItem } from "@/lib/mfc-item-ingest";
import { createImportId, planCollectionRows } from "./import-plan";
import type { ImportableItem, PlannedCollectionRow } from "./import-plan";
import {
  importRowColumns,
  isActive,
  mutateImport,
  readJobStatus,
  readView,
  settle,
  toImport,
} from "./import-state";
import type { ImportRow, ImportView } from "./import-state";

// Postgres binds at most 65535 parameters per statement, so rows are written in chunks.
const INSERT_CHUNK_SIZE = 500;

type ImportRun = { readonly userId: string; readonly importId: string };

type DeletedImport =
  | { readonly kind: "deleted"; readonly id: string }
  | { readonly kind: "active" }
  | { readonly kind: "not_found" };

function chunks<T>(values: readonly T[]): T[][] {
  const result: T[][] = [];
  for (let start = 0; start < values.length; start += INSERT_CHUNK_SIZE) {
    result.push(values.slice(start, start + INSERT_CHUNK_SIZE));
  }
  return result;
}

async function loadImportableItems(
  tx: Tx,
  externalIds: readonly number[],
): Promise<ReadonlyMap<number, ImportableItem>> {
  const items = new Map<
    number,
    { itemId: string; releases: ImportableItem["releases"][number][] }
  >();
  for (const externalIdChunk of chunks(externalIds)) {
    const rows = await tx
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
      .where(and(eq(itemTable.source, "mfc"), inArray(itemTable.externalId, externalIdChunk)));

    for (const row of rows) {
      if (row.externalId === null) continue;
      let item = items.get(row.externalId);
      if (!item) {
        item = { itemId: row.itemId, releases: [] };
        items.set(row.externalId, item);
      }
      if (row.release) item.releases.push(row.release);
    }
  }
  return items;
}

async function writeCollectionRows(
  tx: Tx,
  run: ImportRun,
  rows: readonly PlannedCollectionRow[],
  orderIdOf: (orderKey: string) => string | null,
): Promise<number> {
  let inserted = 0;
  for (const rowChunk of chunks(rows)) {
    const insertedRows = await tx
      .insert(collectionTable)
      .values(
        rowChunk.map(({ row, itemId, releaseId }) => {
          const { collectionKey, orderKey, item: _item, createdAt, updatedAt, ...values } = row;
          return {
            id: createImportId({ ...run, kind: "collection", localKey: collectionKey }),
            userId: run.userId,
            itemId,
            orderId: orderKey === null ? null : orderIdOf(orderKey),
            releaseId,
            ...values,
            createdAt: new Date(createdAt),
            updatedAt: new Date(updatedAt),
          };
        }),
      )
      .onConflictDoNothing({ target: collectionTable.id })
      .returning({ id: collectionTable.id });
    inserted += insertedRows.length;
    await advanceOrderReleaseDatesForCollectionItems(
      tx,
      insertedRows.map(({ id }) => id),
    );
  }
  return inserted;
}

async function applyArchive(
  tx: Tx,
  row: ImportRow,
  archive: DataTransferArchiveV1,
  now: Date,
): Promise<{ readonly view: ImportView; readonly missingMfcItemIds: number[] }> {
  const run = { userId: row.userId, importId: row.importId };
  const orderIdOf = (orderKey: string) =>
    createImportId({ ...run, kind: "order", localKey: orderKey });

  let importedOrders = 0;
  for (const orderChunk of chunks(archive.orders)) {
    const inserted = await tx
      .insert(orderTable)
      .values(
        orderChunk.map(({ orderKey, createdAt, updatedAt, ...values }) => ({
          id: orderIdOf(orderKey),
          userId: run.userId,
          ...values,
          createdAt: new Date(createdAt),
          updatedAt: new Date(updatedAt),
        })),
      )
      .onConflictDoNothing({ target: orderTable.id })
      .returning({ id: orderTable.id });
    importedOrders += inserted.length;
  }

  const items = await loadImportableItems(tx, [
    ...new Set(archive.collectionItems.map((collectionRow) => collectionRow.item.externalId)),
  ]);
  const plan = planCollectionRows(archive.collectionItems, items);
  const importedCollectionItems = await writeCollectionRows(tx, run, plan.rows, orderIdOf);

  await tx.delete(dataTransferImportItem).where(eq(dataTransferImportItem.userId, run.userId));
  const waiting = [...plan.rowsByMissingItem].map(([itemExternalId, rows]) => ({
    userId: run.userId,
    itemExternalId,
    rows: [...rows],
    rowCount: rows.length,
    updatedAt: now,
  }));
  for (const waitingChunk of chunks(waiting)) {
    await tx.insert(dataTransferImportItem).values(waitingChunk);
  }

  await tx
    .update(dataTransferImport)
    .set({
      importedOrders: sql`${dataTransferImport.importedOrders} + ${importedOrders}`,
      importedCollectionItems: sql`${dataTransferImport.importedCollectionItems} + ${importedCollectionItems}`,
      totalCollectionItems: archive.collectionItems.length,
      report: {
        failureReasons: [],
        releaseSubstitutions: plan.releaseSubstitutions,
        missingReleases: plan.missingReleases,
      },
    })
    .where(eq(dataTransferImport.userId, run.userId));

  return {
    view: await settle(tx, run.userId, now),
    missingMfcItemIds: [...plan.rowsByMissingItem.keys()],
  };
}

async function applyItemRows(
  tx: Tx,
  view: ImportView,
  items: ReadonlyMap<number, ImportableItem>,
  rows: readonly DataTransferCollectionItemV1[],
): Promise<void> {
  const run = { userId: view.row.userId, importId: view.row.importId };
  const wantedOrderIds = [
    ...new Set(
      rows.flatMap((row) =>
        row.orderKey === null
          ? []
          : [createImportId({ ...run, kind: "order", localKey: row.orderKey })],
      ),
    ),
  ];
  const presentOrderIds = new Set<string>();
  if (wantedOrderIds.length > 0) {
    const present = await tx
      .select({ id: orderTable.id })
      .from(orderTable)
      .where(and(eq(orderTable.userId, run.userId), inArray(orderTable.id, wantedOrderIds)))
      .orderBy(asc(orderTable.id))
      .for("update");
    for (const { id } of present) presentOrderIds.add(id);
  }

  const plan = planCollectionRows(rows, items);
  const orderIdIfStillPresent = (orderKey: string) => {
    const orderId = createImportId({ ...run, kind: "order", localKey: orderKey });
    return presentOrderIds.has(orderId) ? orderId : null;
  };
  const inserted = await writeCollectionRows(tx, run, plan.rows, orderIdIfStillPresent);

  await tx
    .update(dataTransferImport)
    .set({
      importedCollectionItems: sql`${dataTransferImport.importedCollectionItems} + ${inserted}`,
      report: {
        failureReasons: view.report?.failureReasons ?? [],
        releaseSubstitutions: (view.report?.releaseSubstitutions ?? 0) + plan.releaseSubstitutions,
        missingReleases: (view.report?.missingReleases ?? 0) + plan.missingReleases,
      },
    })
    .where(eq(dataTransferImport.userId, run.userId));
}

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
  }): Promise<DataTransferImportRun> {
    if (Buffer.byteLength(JSON.stringify(archive), "utf-8") > DATA_TRANSFER_MAX_BYTES) {
      throw new Error("DATA_TRANSFER_ARCHIVE_TOO_LARGE");
    }
    const importId = createId();
    const jobId = `data-transfer-import-${createId()}`;
    const now = new Date();

    const started = await mutateImport(userId, now, async (tx, current) => {
      if (current && isActive(current.status)) throw new Error("DATA_TRANSFER_ACTIVE_IMPORT");

      const values = {
        importId,
        jobId,
        fileName,
        archive,
        status: "running",
        phase: "preparing_items",
        report: null,
        importedOrders: 0,
        importedCollectionItems: 0,
        failedCollectionItems: 0,
        totalCollectionItems: archive.collectionItems.length,
        error: null,
        startedAt: now,
        updatedAt: now,
        heartbeatAt: now,
      } as const;
      const [row] = await tx
        .insert(dataTransferImport)
        .values({ userId, ...values })
        .onConflictDoUpdate({ target: dataTransferImport.userId, set: values })
        .returning(importRowColumns);
      if (!row) throw new Error("DATA_TRANSFER_IMPORT_NOT_SAVED");
      return { value: await applyArchive(tx, row, archive, now), changed: true };
    });

    return { ...toImport(started.view), missingMfcItemIds: started.missingMfcItemIds };
  },

  async getCurrentImport(userId: string): Promise<DataTransferImport | null> {
    const view = await readView(db, userId, new Date());
    return view ? toImport(view) : null;
  },

  getImportJobStatus(userId: string): Promise<SyncJobStatus | null> {
    return readJobStatus(userId);
  },

  deleteCurrentImport(userId: string): Promise<DeletedImport> {
    return mutateImport<DeletedImport>(userId, new Date(), async (tx, current) => {
      if (!current) return { value: { kind: "not_found" }, changed: false };
      if (isActive(current.status)) return { value: { kind: "active" }, changed: false };

      await tx.delete(dataTransferImport).where(eq(dataTransferImport.userId, userId));
      return { value: { kind: "deleted", id: current.row.jobId }, changed: true };
    });
  },

  async retryImport(userId: string): Promise<DataTransferImportRun> {
    const jobId = `data-transfer-import-${createId()}`;
    const now = new Date();
    const retried = await mutateImport(userId, now, async (tx, current) => {
      if (
        !current?.row.hasArchive ||
        (current.status !== "partial" && current.status !== "failed")
      ) {
        throw new Error("DATA_TRANSFER_IMPORT_NOT_RETRYABLE");
      }

      const [retrying] = await tx
        .update(dataTransferImport)
        .set({
          jobId,
          status: "running",
          phase: "preparing_items",
          error: null,
          startedAt: now,
          updatedAt: now,
          heartbeatAt: now,
        })
        .where(eq(dataTransferImport.userId, userId))
        .returning({ ...importRowColumns, archive: dataTransferImport.archive });
      if (!retrying) throw new Error("DATA_TRANSFER_IMPORT_NOT_RETRYABLE");

      const parsedArchive = dataTransferArchiveV1Schema.safeParse(retrying.archive);
      if (!parsedArchive.success) {
        throw new Error("DATA_TRANSFER_RETAINED_ARCHIVE_INVALID", { cause: parsedArchive.error });
      }
      return { value: await applyArchive(tx, retrying, parsedArchive.data, now), changed: true };
    });

    return { ...toImport(retried.view), missingMfcItemIds: retried.missingMfcItemIds };
  },

  async completeItem(
    userId: string,
    upload: DataTransferImportItemUpload,
  ): Promise<
    | { readonly kind: "imported"; readonly import: DataTransferImport | null }
    | { readonly kind: "problem"; readonly message: string }
  > {
    const prepared = await prepareMfcItem(db, upload);
    if (prepared.kind === "unreadable") {
      await DataTransferService.failItem(userId, {
        jobId: upload.jobId,
        mfcItemId: upload.mfcItemId,
        reason: prepared.message,
      });
      return { kind: "problem", message: prepared.message };
    }

    const now = new Date();
    const view = await mutateImport(userId, now, async (tx, current) => {
      if (prepared.kind === "parsed") await ensureMfcItem(tx, prepared.page, prepared.stored);
      if (!current) return { value: current, changed: false };

      const [waiting] = await tx
        .select({ status: dataTransferImportItem.status, rows: dataTransferImportItem.rows })
        .from(dataTransferImportItem)
        .where(
          and(
            eq(dataTransferImportItem.userId, userId),
            eq(dataTransferImportItem.itemExternalId, upload.mfcItemId),
          ),
        );
      if (!waiting || waiting.status === "scraped") return { value: current, changed: false };

      const arrived = await loadImportableItems(tx, [upload.mfcItemId]);
      if (!arrived.has(upload.mfcItemId)) {
        throw new Error(`MFC item ${upload.mfcItemId} was neither created nor found`);
      }
      await applyItemRows(tx, current, arrived, waiting.rows);
      await tx
        .update(dataTransferImportItem)
        .set({ status: "scraped", errorReason: null, updatedAt: now })
        .where(
          and(
            eq(dataTransferImportItem.userId, userId),
            eq(dataTransferImportItem.itemExternalId, upload.mfcItemId),
          ),
        );
      return { value: await settle(tx, userId, now), changed: true };
    });

    return { kind: "imported", import: view ? toImport(view) : null };
  },

  async failItem(
    userId: string,
    failure: DataTransferImportItemFailure,
  ): Promise<DataTransferImport | null> {
    const now = new Date();
    const view = await mutateImport(userId, now, async (tx, current) => {
      if (!current || current.row.jobId !== failure.jobId || current.status !== "running") {
        return { value: current, changed: false };
      }
      const failed = await tx
        .update(dataTransferImportItem)
        .set({ status: "failed", errorReason: failure.reason, updatedAt: now })
        .where(
          and(
            eq(dataTransferImportItem.userId, userId),
            eq(dataTransferImportItem.itemExternalId, failure.mfcItemId),
            eq(dataTransferImportItem.status, "pending"),
          ),
        )
        .returning({ id: dataTransferImportItem.itemExternalId });
      if (failed.length === 0) return { value: current, changed: false };
      return { value: await settle(tx, userId, now), changed: true };
    });

    return view ? toImport(view) : null;
  },

  async interruptImport(userId: string, jobId: string): Promise<DataTransferImport | null> {
    const now = new Date();
    const view = await mutateImport(userId, now, async (tx, current) => {
      if (!current || current.row.jobId !== jobId || current.status !== "running") {
        return { value: current, changed: false };
      }
      await tx
        .update(dataTransferImportItem)
        .set({
          status: "failed",
          errorReason: DATA_TRANSFER_IMPORT_INTERRUPTED_REASON,
          updatedAt: now,
        })
        .where(
          and(
            eq(dataTransferImportItem.userId, userId),
            eq(dataTransferImportItem.status, "pending"),
          ),
        );
      return { value: await settle(tx, userId, now), changed: true };
    });

    return view ? toImport(view) : null;
  },

  heartbeat(userId: string, jobId: string): Promise<boolean> {
    const now = new Date();
    return mutateImport(userId, now, async (tx, current) => {
      if (!current || current.row.jobId !== jobId || current.status !== "running") {
        return { value: false, changed: false };
      }
      await tx
        .update(dataTransferImport)
        .set({ heartbeatAt: now })
        .where(eq(dataTransferImport.userId, userId));
      return { value: true, changed: false };
    });
  },
};

export default DataTransferService;
