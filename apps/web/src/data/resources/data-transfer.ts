import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import type { Treaty } from "@elysiajs/eden";
import type { DataTransferArchiveV1 } from "@myakiba/contracts/data-transfer/schema";
import type { SyncJobStatus } from "@myakiba/contracts/sync/schema";
import { app, getErrorMessage } from "@/lib/treaty-client";
import {
  deleteCurrentDataTransferImport,
  exportDataTransfer,
  getCurrentDataTransferImport,
  retryCurrentDataTransferImport,
  startDataTransferImport,
} from "@/queries/data-transfer";
import { syncResultFamilies } from "../catalog";
import { invalidateFamilies, rootedRead, streamedRead } from "../client";

type ImportStatusChunk =
  Treaty.Data<
    (typeof app.api)["data-transfer"]["imports"]["current"]["status"]["get"]
  > extends AsyncIterable<infer Chunk>
    ? Chunk
    : never;

class ImportStatusStreamDisconnectedError extends Error {
  override readonly name = "ImportStatusStreamDisconnectedError";
}

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
      if (importId === null) throw new Error("No active import");

      const {
        data,
        error: responseError,
        status,
      } = await app.api["data-transfer"].imports.current.status.get({
        fetch: { signal },
      });
      if (responseError) {
        const message = getErrorMessage(responseError, "Failed to connect to import status");
        if (status >= 500) {
          throw new ImportStatusStreamDisconnectedError(message, { cause: responseError });
        }
        throw new Error(message);
      }
      if (!data) throw new Error("No import status stream received");

      return (async function* (): AsyncGenerator<ImportStatusChunk> {
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
          throw new ImportStatusStreamDisconnectedError("Import status stream disconnected", {
            cause: error,
          });
        }

        if (!signal.aborted) {
          throw new ImportStatusStreamDisconnectedError("Import status stream disconnected");
        }
      })();
    },
    initialValue: (): SyncJobStatus | null => null,
    reducer: (_previous, chunk) => chunk.data,
    refetchMode: "append",
    retry: (failureCount, error) =>
      failureCount < 3 && error instanceof ImportStatusStreamDisconnectedError,
  }),
};

/** Builds an export for `onSaved` to download. Nothing caches it, so the write goes back to idle. */
export function useExportData(onSaved: (archive: DataTransferArchiveV1) => void) {
  const mutation = useMutation({
    mutationFn: exportDataTransfer,
    onSuccess: (archive) => {
      onSaved(archive);
      mutation.reset();
    },
  });
  return mutation;
}

/** A write that shows the current import it returns at once and rereads it once it settles. */
function useCurrentImportWrite<Output, Input = void>(
  persist: (input: Input) => Promise<Output>,
  show: (queryClient: QueryClient, output: Output) => void,
  onSaved: (output: Output) => void,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: persist,
    onSuccess: (output) => {
      onSaved(output);
      show(queryClient, output);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: currentImportKey }),
  });
}

type Started = Awaited<ReturnType<typeof startDataTransferImport>>;
type Retried = Awaited<ReturnType<typeof retryCurrentDataTransferImport>>;
type Deleted = Awaited<ReturnType<typeof deleteCurrentDataTransferImport>>;

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
