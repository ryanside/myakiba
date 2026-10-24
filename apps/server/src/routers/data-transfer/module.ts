import { Buffer } from "node:buffer";
import type { RequestLogger } from "evlog";
import type {
  DataTransferImportItemFailure,
  DataTransferImportRun,
  DataTransferImportItemUpload,
  DataTransferArchiveV1,
} from "@myakiba/contracts/data-transfer/schema";
import { DATA_TRANSFER_MAX_BYTES } from "@myakiba/contracts/data-transfer/schema";
import { UNSAVED_ITEM_REASON } from "@myakiba/contracts/sync/constants";
import { Result } from "better-result";
import { command, query } from "@/domain/kernel";
import { MfcPageRejected } from "@/lib/errors/mfc-page-rejected";
import { prepareMfcItem } from "@/lib/mfc-item-ingest";
import DataTransferService from "./service";
import { ActiveImportNotDeletable } from "./errors/active-import-not-deletable";
import { ImportArchiveTooLarge } from "./errors/import-archive-too-large";
import { InactiveImportNotFound } from "./errors/inactive-import-not-found";

const recordFailure = command(
  { action: "dataTransfer.failItem", failure: "Failed to record the item failure." },
  async (scope, input: DataTransferImportItemFailure) => {
    scope.log.set({
      dataTransfer: {
        importId: input.jobId,
        ...("failures" in input
          ? { failureCount: input.failures.length }
          : { mfcItemId: input.mfcItemId }),
      },
    });
    const currentImport = await DataTransferService.failItem(scope, scope.viewer.userId, input);
    scope.log.set({ dataTransfer: { status: currentImport?.status ?? null } });
    return Result.ok(currentImport);
  },
);

/** Records the started or retried import on the request's wide event. */
function logRun<R extends DataTransferImportRun>(
  scope: { readonly log: RequestLogger },
  run: R,
): R {
  scope.log.set({
    dataTransfer: {
      importId: run.id,
      status: run.status,
      missingItems: run.missingMfcItemIds.length,
    },
  });
  return run;
}

export const DataTransfer = {
  export: query(
    { action: "dataTransfer.export", failure: "Failed to export data.", snapshot: true },
    async (scope, _input: Record<never, never>) => {
      try {
        const exported = await DataTransferService.exportArchive(scope.viewer.userId, scope.tx);
        return exported.tapBoth({
          ok: (archive) =>
            scope.log.set({
              dataTransfer: {
                exportId: archive.exportId,
                orders: archive.orders.length,
                collectionItems: archive.collectionItems.length,
              },
            }),
          err: (failure) =>
            scope.log.set({
              dataTransfer: {
                code: failure.match({
                  ExportArchiveEmpty: () => "DATA_TRANSFER_ARCHIVE_EMPTY",
                  ExportArchiveTooLarge: () => "DATA_TRANSFER_ARCHIVE_TOO_LARGE",
                  ExportTooManyRecords: () => "DATA_TRANSFER_ARCHIVE_TOO_MANY_RECORDS",
                  ExportUnsupportedCollectionItem: () =>
                    "DATA_TRANSFER_UNSUPPORTED_COLLECTION_ITEM",
                }),
              },
            }),
        });
      } catch (error) {
        // The wide event has always named an unexpected export failure by its message.
        if (error instanceof Error) scope.log.set({ dataTransfer: { code: error.message } });
        throw error;
      }
    },
  ),
  current: query(
    { action: "dataTransfer.getCurrentImport", failure: "Failed to check import status." },
    async (scope, _input: Record<never, never>) => {
      const currentImport = await DataTransferService.getCurrentImport(
        scope.viewer.userId,
        scope.tx,
      );
      scope.log.set({ dataTransfer: { importId: currentImport?.id ?? null } });
      return Result.ok(currentImport);
    },
  ),
  status: query(
    { action: "dataTransfer.importStatus", failure: "Failed to check import status." },
    async (scope, _input: Record<never, never>) =>
      Result.ok(await DataTransferService.getImportJobStatus(scope.viewer.userId, scope.tx)),
  ),
  remove: command(
    { action: "dataTransfer.deleteCurrentImport", failure: "Failed to delete the import session." },
    async (scope, _input: Record<never, never>) => {
      const result = await DataTransferService.deleteCurrentImport(scope, scope.viewer.userId);
      if (result.kind === "active") return Result.err(new ActiveImportNotDeletable());
      if (result.kind === "not_found") return Result.err(new InactiveImportNotFound());
      scope.log.set({ dataTransfer: { importId: result.id } });
      return Result.ok({ id: result.id });
    },
  ),
  start: command(
    {
      action: "dataTransfer.startImport",
      failure: "Failed to start import.",
      before: async (
        scope,
        input: { readonly fileName: string; readonly archive: DataTransferArchiveV1 },
      ) => {
        scope.log.set({
          dataTransfer: {
            exportId: input.archive.exportId,
            orders: input.archive.orders.length,
            collectionItems: input.archive.collectionItems.length,
          },
        });
        if (Buffer.byteLength(JSON.stringify(input.archive), "utf-8") > DATA_TRANSFER_MAX_BYTES) {
          scope.log.set({ dataTransfer: { code: "DATA_TRANSFER_ARCHIVE_TOO_LARGE" } });
          return Result.err(new ImportArchiveTooLarge());
        }
        return scope.proceed(input);
      },
    },
    async (scope, input) => {
      const started = await DataTransferService.startImport(scope, {
        ...input,
        userId: scope.viewer.userId,
      });
      return started.tapBoth({
        ok: (run) => logRun(scope, run),
        err: () => scope.log.set({ dataTransfer: { code: "DATA_TRANSFER_ACTIVE_IMPORT" } }),
      });
    },
  ),
  retry: command(
    { action: "dataTransfer.retryImport", failure: "Failed to retry import." },
    async (scope, _input: Record<never, never>) => {
      const retried = await DataTransferService.retryImport(scope, scope.viewer.userId);
      return retried.tapBoth({
        ok: (run) => logRun(scope, run),
        err: () => scope.log.set({ dataTransfer: { code: "DATA_TRANSFER_IMPORT_NOT_RETRYABLE" } }),
      });
    },
  ),
  complete: command(
    {
      action: "dataTransfer.completeItem",
      failure: "Failed to import the item.",
      before: async (scope, input: DataTransferImportItemUpload) => {
        scope.log.set({ dataTransfer: { importId: input.jobId, mfcItemId: input.mfcItemId } });
        return scope.proceed({ upload: input, prepared: await prepareMfcItem(scope.tx, input) });
      },
    },
    async (scope, input) => {
      const completed = await DataTransferService.completeItem(
        scope,
        scope.viewer.userId,
        input.upload,
        input.prepared,
      );
      if (completed.isErr()) return completed;
      const result = completed.value;
      if (result.kind === "problem") {
        scope.log.set({ dataTransfer: { code: result.message } });
        return scope.failAfterCommit(new MfcPageRejected({ problem: result.problem }));
      }
      scope.log.set({ dataTransfer: { status: result.import?.status ?? null } });
      return Result.ok(result.import);
    },
    {
      recover: async (scope, input, error) => {
        const { cause } = error;
        const original = cause instanceof Error ? cause : new Error(String(cause));
        try {
          const recorded = await scope.execute(recordFailure, {
            jobId: input.jobId,
            mfcItemId: input.mfcItemId,
            reason: UNSAVED_ITEM_REASON,
          });
          scope.log.error(original);
          return recorded;
        } catch (recordError) {
          const failure =
            recordError instanceof Error ? recordError : new Error(String(recordError));
          scope.log.warn(failure.message, {
            recoveryErrors: [
              {
                step: "dataTransfer.failItem",
                name: failure.name,
                message: failure.message,
                stack: failure.stack,
                cause: failure.cause,
              },
            ],
          });
          throw cause;
        }
      },
    },
  ),
  failure: recordFailure,
  interrupt: command(
    { action: "dataTransfer.interruptImport", failure: "Failed to interrupt the import." },
    async (scope, input: { readonly jobId: string }) => {
      scope.log.set({ dataTransfer: { importId: input.jobId } });
      const currentImport = await DataTransferService.interruptImport(
        scope,
        scope.viewer.userId,
        input.jobId,
      );
      scope.log.set({ dataTransfer: { status: currentImport?.status ?? null } });
      return Result.ok(currentImport);
    },
  ),
  heartbeat: command(
    { action: "dataTransfer.heartbeat", failure: "Failed to extend the import." },
    async (scope, input: { readonly jobId: string }) => {
      scope.log.set({ dataTransfer: { importId: input.jobId } });
      const running = await DataTransferService.heartbeat(scope, scope.viewer.userId, input.jobId);
      scope.log.set({ outcome: running ? "success" : "rejected" });
      return Result.ok({ running });
    },
  ),
};
