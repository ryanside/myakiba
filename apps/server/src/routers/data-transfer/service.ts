import { Result, panic } from "better-result";
import { Buffer } from "node:buffer";
import { createId } from "@paralleldrive/cuid2";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { CommandScope } from "@/domain/kernel";
import { advanceOrderReleaseDatesForCollectionItems } from "@myakiba/db/order-release-date";
import {
  collection as collectionTable,
  dataTransferImport,
  dataTransferImportItem,
  item as itemTable,
  item_release as itemReleaseTable,
  order as orderTable,
} from "@myakiba/db/schema/figure";
import type { ReadTx, Tx } from "@myakiba/db/tx";
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
  DataTransferImportReport,
  DataTransferImportItemFailure,
  DataTransferImportItemUpload,
  DataTransferImportRun,
} from "@myakiba/contracts/data-transfer/schema";
import type { SyncJobStatus } from "@myakiba/contracts/sync/schema";
import { ITEM_FETCH_ERROR_MESSAGE } from "@myakiba/contracts/sync/messages";
import { ensureMfcItem } from "@/lib/mfc-item-ingest";
import type { prepareMfcItem } from "@/lib/mfc-item-ingest";
import { PROBLEM_MESSAGE } from "@/lib/errors/mfc-page-rejected";
import { StoreItemPictureFailed } from "@/lib/errors/store-item-picture-failed";
import type { MfcItemNotPersisted } from "@/lib/errors/mfc-item-not-persisted";
import type { MfcPageProblem } from "@myakiba/mfc/parse";
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
import { ExportArchiveEmpty } from "./errors/export-archive-empty";
import { ExportArchiveTooLarge } from "./errors/export-archive-too-large";
import { ExportTooManyRecords } from "./errors/export-too-many-records";
import { ExportUnsupportedCollectionItem } from "./errors/export-unsupported-collection-item";
import { ImportAlreadyActive } from "./errors/import-already-active";
import { ImportNotRetryable } from "./errors/import-not-retryable";
import { UploadNotInRunningImport } from "./errors/upload-not-in-running-import";

type CompleteItemResult = Result<
  | { readonly kind: "imported"; readonly import: DataTransferImport | null }
  | {
      readonly kind: "problem";
      readonly problem: MfcPageProblem["kind"];
      readonly message: string;
    },
  StoreItemPictureFailed | MfcItemNotPersisted | UploadNotInRunningImport
>;

type Applied = Awaited<ReturnType<typeof applyArchive>>;

type ExportFailure =
  | ExportArchiveEmpty
  | ExportArchiveTooLarge
  | ExportTooManyRecords
  | ExportUnsupportedCollectionItem;

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
  // The per-user advisory key belongs only to imports. Order deletion never locks an import,
  // so taking it before these order locks cannot form a cycle with deletion.
  const presentOrderIds = new Set<string>();
  if (wantedOrderIds.length > 0) {
    const present = await tx
      .select({ id: orderTable.id })
      .from(orderTable)
      .where(and(eq(orderTable.userId, run.userId), inArray(orderTable.id, wantedOrderIds)))
      .orderBy(asc(orderTable.id))
      .for("key share");
    for (const { id } of present) presentOrderIds.add(id);
  }

  const plan = planCollectionRows(rows, items);
  const orderIdIfStillPresent = (orderKey: string) => {
    const orderId = createImportId({ ...run, kind: "order", localKey: orderKey });
    return presentOrderIds.has(orderId) ? orderId : null;
  };
  const inserted = await writeCollectionRows(tx, run, plan.rows, orderIdIfStillPresent);

  const report: DataTransferImportReport = {
    failureReasons: view.report?.failureReasons ?? [],
    releaseSubstitutions: (view.report?.releaseSubstitutions ?? 0) + plan.releaseSubstitutions,
    missingReleases: (view.report?.missingReleases ?? 0) + plan.missingReleases,
  };
  await tx
    .update(dataTransferImport)
    .set({
      importedCollectionItems: sql`${dataTransferImport.importedCollectionItems} + ${inserted}`,
      report,
    })
    .where(eq(dataTransferImport.userId, run.userId));
}

async function pendingUpload(
  db: ReadTx,
  current: ImportView | undefined,
  userId: string,
  upload: DataTransferImportItemUpload,
) {
  if (!current || current.row.jobId !== upload.jobId || current.status !== "running") return;
  const [waiting] = await db
    .select({ rows: dataTransferImportItem.rows })
    .from(dataTransferImportItem)
    .where(
      and(
        eq(dataTransferImportItem.userId, userId),
        eq(dataTransferImportItem.itemExternalId, upload.mfcItemId),
        eq(dataTransferImportItem.status, "pending"),
      ),
    );
  return waiting;
}

const DataTransferService = {
  async checkUpload(userId: string, upload: DataTransferImportItemUpload, db: ReadTx) {
    const current = await readView(db, userId, new Date());
    return (await pendingUpload(db, current, userId, upload))
      ? Result.ok(undefined)
      : Result.err(new UploadNotInRunningImport());
  },

  async exportArchive(
    userId: string,
    tx: ReadTx,
  ): Promise<Result<DataTransferArchiveV1, ExportFailure>> {
    const orderRows = await tx
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

    if (orderRows.length > DATA_TRANSFER_MAX_RECORDS) return Result.err(new ExportTooManyRecords());

    const collectionRows = await tx
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
      return Result.err(new ExportTooManyRecords());
    }

    const orders = orderRows;
    const collectionItems = collectionRows;

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

    const exportedCollectionItems: DataTransferArchiveV1["collectionItems"] = [];
    for (const [index, collectionItem] of collectionItems.entries()) {
      if (collectionItem.itemSource !== "mfc" || collectionItem.itemExternalId === null) {
        return Result.err(new ExportUnsupportedCollectionItem());
      }
      exportedCollectionItems.push({
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
      });
    }

    if (exportedOrders.length === 0 && exportedCollectionItems.length === 0) {
      return Result.err(new ExportArchiveEmpty());
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
      return Result.err(new ExportArchiveTooLarge());
    }
    return Result.ok(archive);
  },

  async startImport(
    scope: CommandScope,
    {
      userId,
      fileName,
      archive,
    }: {
      readonly userId: string;
      readonly fileName: string;
      readonly archive: DataTransferArchiveV1;
    },
  ): Promise<Result<DataTransferImportRun, ImportAlreadyActive>> {
    const importId = createId();
    const jobId = `data-transfer-import-${createId()}`;
    const now = new Date();

    const started = await mutateImport<Result<Applied, ImportAlreadyActive>>(
      scope,
      userId,
      now,
      async (tx, current) => {
        if (current && isActive(current.status)) {
          return { value: Result.err(new ImportAlreadyActive()), changed: false };
        }

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
        if (!row)
          panic(
            `Saving import ${importId} returned no row, so dataTransfer.startImport has nothing to apply`,
          );
        return { value: Result.ok(await applyArchive(tx, row, archive, now)), changed: true };
      },
    );

    return started.map((applied) => ({
      ...toImport(applied.view),
      missingMfcItemIds: applied.missingMfcItemIds,
    }));
  },

  async getCurrentImport(userId: string, db: ReadTx): Promise<DataTransferImport | null> {
    const view = await readView(db, userId, new Date());
    return view ? toImport(view) : null;
  },

  getImportJobStatus(userId: string, db: ReadTx): Promise<SyncJobStatus | null> {
    return readJobStatus(db, userId);
  },

  deleteCurrentImport(scope: CommandScope, userId: string): Promise<DeletedImport> {
    return mutateImport<DeletedImport>(scope, userId, new Date(), async (tx, current) => {
      if (!current) return { value: { kind: "not_found" }, changed: false };
      if (isActive(current.status)) return { value: { kind: "active" }, changed: false };

      await tx.delete(dataTransferImport).where(eq(dataTransferImport.userId, userId));
      return { value: { kind: "deleted", id: current.row.jobId }, changed: true };
    });
  },

  async retryImport(
    scope: CommandScope,
    userId: string,
  ): Promise<Result<DataTransferImportRun, ImportNotRetryable>> {
    const jobId = `data-transfer-import-${createId()}`;
    const now = new Date();
    const retried = await mutateImport<Result<Applied, ImportNotRetryable>>(
      scope,
      userId,
      now,
      async (tx, current) => {
        if (
          !current?.row.hasArchive ||
          (current.status !== "partial" && current.status !== "failed")
        ) {
          return { value: Result.err(new ImportNotRetryable()), changed: false };
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
        if (!retrying) return { value: Result.err(new ImportNotRetryable()), changed: false };

        const parsedArchive = dataTransferArchiveV1Schema.safeParse(retrying.archive);
        if (!parsedArchive.success) {
          panic(
            `The archive import ${retrying.importId} retained fails its schema, so dataTransfer.retryImport cannot apply it`,
            parsedArchive.error,
          );
        }
        return {
          value: Result.ok(await applyArchive(tx, retrying, parsedArchive.data, now)),
          changed: true,
        };
      },
    );

    return retried.map((applied) => ({
      ...toImport(applied.view),
      missingMfcItemIds: applied.missingMfcItemIds,
    }));
  },

  async completeItem(
    scope: CommandScope,
    userId: string,
    upload: DataTransferImportItemUpload,
    prepared: Awaited<ReturnType<typeof prepareMfcItem>>,
  ): Promise<CompleteItemResult> {
    const now = new Date();
    return mutateImport<CompleteItemResult>(scope, userId, now, async (tx, current) => {
      const waiting = await pendingUpload(tx, current, userId, upload);
      if (!current || !waiting) {
        return { value: Result.err(new UploadNotInRunningImport()), changed: false };
      }
      if (prepared.isErr()) {
        if (StoreItemPictureFailed.is(prepared.error)) {
          return { value: Result.err(prepared.error), changed: false };
        }
        const problem = prepared.error.problem.kind;
        const message = PROBLEM_MESSAGE[problem];
        await DataTransferService.failItem(scope, userId, {
          jobId: upload.jobId,
          mfcItemId: upload.mfcItemId,
          reason: message,
        });
        return { value: Result.ok({ kind: "problem" as const, problem, message }), changed: false };
      }
      const ready = prepared.value;
      if (ready.kind === "parsed") {
        const ensured = await ensureMfcItem(tx, ready.page, ready.stored);
        if (ensured.isErr()) return { value: Result.err(ensured.error), changed: false };
      }
      await tx
        .update(dataTransferImport)
        .set({ heartbeatAt: now })
        .where(eq(dataTransferImport.userId, userId));
      const arrived = await loadImportableItems(tx, [upload.mfcItemId]);
      if (!arrived.has(upload.mfcItemId)) {
        panic(
          `MFC item ${upload.mfcItemId} was neither created nor found by its ingest for import ${upload.jobId}`,
        );
      }
      await applyItemRows(tx, current, arrived, waiting.rows);
      await tx
        .update(dataTransferImportItem)
        .set({ status: "imported", errorReason: null, rows: [], updatedAt: now })
        .where(
          and(
            eq(dataTransferImportItem.userId, userId),
            eq(dataTransferImportItem.itemExternalId, upload.mfcItemId),
          ),
        );
      const view = await settle(tx, userId, now);
      return {
        value: Result.ok({ kind: "imported" as const, import: toImport(view) }),
        changed: true,
      };
    });
  },

  async failItem(
    scope: CommandScope,
    userId: string,
    failure: DataTransferImportItemFailure,
  ): Promise<DataTransferImport | null> {
    const now = new Date();
    const view = await mutateImport(scope, userId, now, async (tx, current) => {
      if (current?.row.jobId === failure.jobId) {
        await tx
          .update(dataTransferImport)
          .set({ heartbeatAt: now })
          .where(eq(dataTransferImport.userId, userId));
      }
      if (!current || current.row.jobId !== failure.jobId || current.status !== "running") {
        return { value: current, changed: false };
      }
      const failures =
        "failures" in failure
          ? failure.failures.map(({ mfcItemId, error }) => ({
              mfcItemId,
              reason: ITEM_FETCH_ERROR_MESSAGE[error],
            }))
          : [failure];
      let changed = false;
      for (const entry of failures) {
        const failed = await tx
          .update(dataTransferImportItem)
          .set({ status: "failed", errorReason: entry.reason, updatedAt: now })
          .where(
            and(
              eq(dataTransferImportItem.userId, userId),
              eq(dataTransferImportItem.itemExternalId, entry.mfcItemId),
              eq(dataTransferImportItem.status, "pending"),
            ),
          )
          .returning({ id: dataTransferImportItem.itemExternalId });
        changed = failed.length > 0 || changed;
      }
      if (!changed) return { value: current, changed: false };
      return { value: await settle(tx, userId, now), changed: true };
    });

    return view ? toImport(view) : null;
  },

  async interruptImport(
    scope: CommandScope,
    userId: string,
    jobId: string,
  ): Promise<DataTransferImport | null> {
    const now = new Date();
    const view = await mutateImport(scope, userId, now, async (tx, current) => {
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

  heartbeat(scope: CommandScope, userId: string, jobId: string): Promise<boolean> {
    const now = new Date();
    return mutateImport(scope, userId, now, async (tx, current) => {
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
