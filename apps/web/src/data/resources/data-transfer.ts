import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import type { Treaty } from "@elysiajs/eden";
import type { DataTransferArchiveV1 } from "@myakiba/contracts/data-transfer/schema";
import type { SyncJobStatus } from "@myakiba/contracts/sync/schema";
import { ApiServerError } from "@/lib/errors/api-server-error";
import { ApiUnreachable } from "@/lib/errors/api-unreachable";
import { ImportStatusStreamDisconnected } from "@/lib/errors/import-status-stream-disconnected";
import { app } from "@/lib/treaty-client";
import {
  deleteCurrentDataTransferImport,
  exportDataTransfer,
  getCurrentDataTransferImport,
  retryCurrentDataTransferImport,
  startDataTransferImport,
} from "@/queries/data-transfer";
import { syncResultFamilies } from "../catalog";
import { panic } from "better-result";
import type { InferOk, Result } from "better-result";
import { call } from "../api";
import type { ApiFailure } from "../api";
import { invalidateFamilies, rootedRead, settle, streamedRead, useWrite } from "../client";

type ImportStatusChunk =
  Treaty.Data<
    (typeof app.api)["data-transfer"]["imports"]["current"]["status"]["get"]
  > extends AsyncIterable<infer Chunk>
    ? Chunk
    : never;

const currentImportKey = ["dataTransferImport", "current"] as const;
const importStatusKey = (importId: string | null) =>
  ["dataTransferImportStatus", importId] as const;

export const dataTransfer = {
  currentImport: rootedRead("currentImport", {
    key: () => currentImportKey,
    load: getCurrentDataTransferImport,
    retry: false,
  }),
  /** The running import's live status. A dropped stream reconnects up to three times. */
  importStatus: streamedRead("importStatus", {
    key: importStatusKey,
    open: async (importId, { signal, client }) => {
      // The read is enabled only with an active import, so a null import is a defect.
      if (importId === null) return panic("No active import");

      const opened = await call(
        app.api["data-transfer"].imports.current.status.get({ fetch: { signal } }),
        {
          fallback: "Failed to connect to import status",
          empty: "No import status stream received",
        },
      );
      const disconnected = opened.mapError((failure) =>
        ApiUnreachable.is(failure) || ApiServerError.is(failure)
          ? new ImportStatusStreamDisconnected({ cause: failure, message: failure.message })
          : failure,
      );

      return disconnected.map(async function* (
        data: AsyncIterable<ImportStatusChunk>,
      ): AsyncGenerator<ImportStatusChunk> {
        try {
          for await (const chunk of data) {
            if (chunk.data.terminalState !== null) {
              await client.invalidateQueries({ queryKey: currentImportKey });
              void invalidateFamilies(client, syncResultFamilies);
              yield chunk;
              return;
            }

            yield chunk;
          }
        } catch (error) {
          if (signal.aborted || !(error instanceof TypeError)) throw error;
          throw new ImportStatusStreamDisconnected({
            cause: error,
            message: "Import status stream disconnected",
          });
        }

        if (!signal.aborted) {
          throw new ImportStatusStreamDisconnected({
            message: "Import status stream disconnected",
          });
        }
      });
    },
    initialValue: (): SyncJobStatus | null => null,
    reducer: (_previous, chunk) => chunk.data,
    refetchMode: "append",
    retry: (failureCount, error) => failureCount < 3 && ImportStatusStreamDisconnected.is(error),
  }),
};

/** Builds an export for `onSaved` to download. Nothing caches it, so the write goes back to idle. */
export function useExportData(onSaved: (archive: DataTransferArchiveV1) => void) {
  const mutation = useMutation({
    mutationFn: () => settle(exportDataTransfer),
    onSuccess: (archive) => {
      onSaved(archive);
      mutation.reset();
    },
  });
  return useWrite(mutation);
}

/** A write that shows the current import it returns at once and rereads it once it settles. */
function useCurrentImportWrite<Output, Input = void>(
  persist: (input: Input) => Promise<Result<Output, ApiFailure>>,
  show: (queryClient: QueryClient, output: Output) => void,
  onSaved: (output: Output) => void,
) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (input: Input) => settle(() => persist(input)),
    onSuccess: (output) => {
      onSaved(output);
      show(queryClient, output);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: currentImportKey }),
  });
  return useWrite(mutation);
}

type Started = InferOk<Awaited<ReturnType<typeof startDataTransferImport>>>;
type Retried = InferOk<Awaited<ReturnType<typeof retryCurrentDataTransferImport>>>;
type Deleted = InferOk<Awaited<ReturnType<typeof deleteCurrentDataTransferImport>>>;

export function useStartImport(onSaved: (started: Started) => void) {
  return useCurrentImportWrite(
    startDataTransferImport,
    (queryClient, started) => {
      queryClient.setQueryData(currentImportKey, started);
    },
    onSaved,
  );
}

/** A retried import streams its status again from the start. */
export function useRetryImport(onSaved: (retried: Retried) => void) {
  return useCurrentImportWrite(
    retryCurrentDataTransferImport,
    (queryClient, retried) => {
      queryClient.removeQueries({ queryKey: importStatusKey(retried.id), exact: true });
      queryClient.setQueryData(currentImportKey, retried);
    },
    onSaved,
  );
}

export function useDeleteImport(onSaved: (deleted: Deleted) => void) {
  return useCurrentImportWrite(
    deleteCurrentDataTransferImport,
    (queryClient, deleted) => {
      queryClient.removeQueries({ queryKey: importStatusKey(deleted.id), exact: true });
      queryClient.setQueryData(currentImportKey, null);
    },
    onSaved,
  );
}
