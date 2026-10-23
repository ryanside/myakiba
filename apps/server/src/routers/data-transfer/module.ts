import { Buffer } from "node:buffer";
import type {
  DataTransferImportItemFailure,
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
  async (scope, input: DataTransferImportItemFailure) =>
    ok(await DataTransferService.failItem(scope, scope.viewer.userId, input)),
);

export const DataTransfer = {
  export: query(
    { action: "dataTransfer.export", failure: "Failed to export data.", snapshot: true },
    async (scope, _input: Record<never, never>) => {
      try {
        return ok(await DataTransferService.exportArchive(scope.viewer.userId, scope.tx));
      } catch (error) {
        if (!(error instanceof Error)) throw error;
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
    async (scope, _input: Record<never, never>) =>
      ok(await DataTransferService.getCurrentImport(scope.viewer.userId, scope.tx)),
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
      return ok({ id: result.id });
    },
  ),
  start: command(
    {
      action: "dataTransfer.startImport",
      failure: "Failed to start import.",
      before: async (
        _scope,
        input: { readonly fileName: string; readonly archive: DataTransferArchiveV1 },
      ) => {
        if (Buffer.byteLength(JSON.stringify(input.archive), "utf-8") > DATA_TRANSFER_MAX_BYTES)
          return fail("payload_too_large", "The import archive exceeds the 50 MiB limit.");
        return proceed(input);
      },
    },
    async (scope, input) => {
      try {
        return ok(
          await DataTransferService.startImport(scope, { ...input, userId: scope.viewer.userId }),
        );
      } catch (error) {
        if (error instanceof Error && error.message === "DATA_TRANSFER_ACTIVE_IMPORT")
          return fail("conflict", "Another data import is already active.");
        throw error;
      }
    },
  ),
  retry: command(
    { action: "dataTransfer.retryImport", failure: "Failed to retry import." },
    async (scope, _input: Record<never, never>) => {
      try {
        return ok(await DataTransferService.retryImport(scope, scope.viewer.userId));
      } catch (error) {
        if (error instanceof Error && error.message === "DATA_TRANSFER_IMPORT_NOT_RETRYABLE")
          return fail(
            "conflict",
            "The import does not exist or cannot be retried in its current state.",
          );
        throw error;
      }
    },
  ),
  complete: command(
    {
      action: "dataTransfer.completeItem",
      failure: "Failed to import the item.",
      before: async (scope, input: DataTransferImportItemUpload) =>
        proceed({ upload: input, prepared: await prepareMfcItem(scope.tx, input) }),
      recover: async (scope, input, error) => {
        try {
          const recorded = await scope.execute(recordFailure, {
            jobId: input.jobId,
            mfcItemId: input.mfcItemId,
            reason: UNSAVED_ITEM_REASON,
          });
          scope.log.error(error);
          return recorded;
        } catch (recordError) {
          throw new AggregateError([error, recordError], "Failed to record the item failure.", {
            cause: error,
          });
        }
      },
    },
    async (scope, input) => {
      const result = await DataTransferService.completeItem(
        scope,
        scope.viewer.userId,
        input.upload,
        input.prepared,
      );
      return result.kind === "problem"
        ? failAfterCommit("bad_request", result.message)
        : ok(result.import);
    },
  ),
  failure: recordFailure,
  interrupt: command(
    { action: "dataTransfer.interruptImport", failure: "Failed to interrupt the import." },
    async (scope, input: { readonly jobId: string }) =>
      ok(await DataTransferService.interruptImport(scope, scope.viewer.userId, input.jobId)),
  ),
  heartbeat: command(
    { action: "dataTransfer.heartbeat", failure: "Failed to extend the import." },
    async (scope, input: { readonly jobId: string }) =>
      ok({ running: await DataTransferService.heartbeat(scope, scope.viewer.userId, input.jobId) }),
  ),
};
