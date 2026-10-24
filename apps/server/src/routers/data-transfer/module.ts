import { Buffer } from "node:buffer";
import type { RequestLogger } from "evlog";
import type {
  DataTransferImportItemFailure,
  DataTransferImportRun,
  DataTransferImportItemUpload,
  DataTransferArchiveV1,
} from "@myakiba/contracts/data-transfer/schema";
import {
  DATA_TRANSFER_MAX_BYTES,
  DATA_TRANSFER_MAX_RECORDS,
} from "@myakiba/contracts/data-transfer/schema";
import { UNSAVED_ITEM_REASON } from "@myakiba/contracts/sync/constants";
import { command, fail, failAfterCommit, ok, proceed, query } from "@/domain/kernel";
import { prepareMfcItem } from "@/lib/mfc-item-ingest";
import DataTransferService from "./service";

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
    return ok(currentImport);
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
        const archive = await DataTransferService.exportArchive(scope.viewer.userId, scope.tx);
        scope.log.set({
          dataTransfer: {
            exportId: archive.exportId,
            orders: archive.orders.length,
            collectionItems: archive.collectionItems.length,
          },
        });
        return ok(archive);
      } catch (error) {
        if (!(error instanceof Error)) throw error;
        scope.log.set({ dataTransfer: { code: error.message } });
        switch (error.message) {
          case "DATA_TRANSFER_ARCHIVE_EMPTY":
            return fail("conflict", "There is no data to export.");
          case "DATA_TRANSFER_ARCHIVE_TOO_LARGE":
            return fail("payload_too_large", "The export exceeds the 50 MiB limit.");
          case "DATA_TRANSFER_ARCHIVE_TOO_MANY_RECORDS":
            return fail(
              "payload_too_large",
              `The export exceeds the ${DATA_TRANSFER_MAX_RECORDS} record limit.`,
            );
          case "DATA_TRANSFER_UNSUPPORTED_COLLECTION_ITEM":
            return fail(
              "conflict",
              "Data transfer only supports MyFigureCollection-backed collection items.",
            );
          default:
            throw error;
        }
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
      return ok(currentImport);
    },
  ),
  status: query(
    { action: "dataTransfer.importStatus", failure: "Failed to check import status." },
    async (scope, _input: Record<never, never>) =>
      ok(await DataTransferService.getImportJobStatus(scope.viewer.userId, scope.tx)),
  ),
  remove: command(
    { action: "dataTransfer.deleteCurrentImport", failure: "Failed to delete the import session." },
    async (scope, _input: Record<never, never>) => {
      const result = await DataTransferService.deleteCurrentImport(scope, scope.viewer.userId);
      if (result.kind === "active") return fail("conflict", "An active import cannot be deleted.");
      if (result.kind === "not_found")
        return fail("not_found", "No inactive import session was found.");
      scope.log.set({ dataTransfer: { importId: result.id } });
      return ok({ id: result.id });
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
          return fail("payload_too_large", "The import archive exceeds the 50 MiB limit.");
        }
        return proceed(input);
      },
    },
    async (scope, input) => {
      try {
        return ok(
          logRun(
            scope,
            await DataTransferService.startImport(scope, {
              ...input,
              userId: scope.viewer.userId,
            }),
          ),
        );
      } catch (error) {
        if (error instanceof Error && error.message === "DATA_TRANSFER_ACTIVE_IMPORT") {
          scope.log.set({ dataTransfer: { code: error.message } });
          return fail("conflict", "Another data import is already active.");
        }
        throw error;
      }
    },
  ),
  retry: command(
    { action: "dataTransfer.retryImport", failure: "Failed to retry import." },
    async (scope, _input: Record<never, never>) => {
      try {
        return ok(logRun(scope, await DataTransferService.retryImport(scope, scope.viewer.userId)));
      } catch (error) {
        if (error instanceof Error && error.message === "DATA_TRANSFER_IMPORT_NOT_RETRYABLE") {
          scope.log.set({ dataTransfer: { code: error.message } });
          return fail(
            "conflict",
            "The import does not exist or cannot be retried in its current state.",
          );
        }
        throw error;
      }
    },
  ),
  complete: command(
    {
      action: "dataTransfer.completeItem",
      failure: "Failed to import the item.",
      before: async (scope, input: DataTransferImportItemUpload) => {
        scope.log.set({ dataTransfer: { importId: input.jobId, mfcItemId: input.mfcItemId } });
        return proceed({ upload: input, prepared: await prepareMfcItem(scope.tx, input) });
      },
    },
    async (scope, input) => {
      const result = await DataTransferService.completeItem(
        scope,
        scope.viewer.userId,
        input.upload,
        input.prepared,
      );
      if (result.kind === "problem") {
        scope.log.set({ dataTransfer: { code: result.message } });
        return failAfterCommit("bad_request", result.message);
      }
      scope.log.set({ dataTransfer: { status: result.import?.status ?? null } });
      return ok(result.import);
    },
    {
      recover: async (scope, input, error) => {
        try {
          const recorded = await scope.execute(recordFailure, {
            jobId: input.jobId,
            mfcItemId: input.mfcItemId,
            reason: UNSAVED_ITEM_REASON,
          });
          scope.log.error(
            error.cause instanceof Error ? error.cause : new Error(String(error.cause)),
          );
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
          throw error;
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
      return ok(currentImport);
    },
  ),
  heartbeat: command(
    { action: "dataTransfer.heartbeat", failure: "Failed to extend the import." },
    async (scope, input: { readonly jobId: string }) => {
      scope.log.set({ dataTransfer: { importId: input.jobId } });
      const running = await DataTransferService.heartbeat(scope, scope.viewer.userId, input.jobId);
      scope.log.set({ outcome: running ? "success" : "rejected" });
      return ok({ running });
    },
  ),
};
