import type { Treaty } from "@elysiajs/eden";
import type {
  DataTransferArchiveV1,
  DataTransferImportRequest,
} from "@myakiba/contracts/data-transfer/schema";
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
import type { InferOk } from "better-result";
import { call } from "../api";
import {
  defineCommand,
  invalidateFamilies,
  rootedRead,
  streamedRead,
  useResourceMutation,
} from "../client";
import { toastRunOutcome } from "@/components/extension/run-outcome-toast";
import { importDataTransferItems } from "../extension-run";
import { startImport } from "../start-import";

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

const exportCommand = defineCommand({ invalidates: "nothing", persist: exportDataTransfer });

/** Builds an export for `onSaved` to download. Nothing caches it, so the write goes back to idle. */
export function useExportData(onSaved: (archive: DataTransferArchiveV1) => void) {
  const write = useResourceMutation(exportCommand, {
    onSaved: (_input, archive) => onSaved(archive),
  });
  const run = async () => {
    const exported = await write.run();
    if (exported.isOk()) write.reset();
    return exported;
  };
  return { ...write, run } as const;
}

type Started = InferOk<Awaited<ReturnType<typeof startDataTransferImport>>>;
type Retried = InferOk<Awaited<ReturnType<typeof retryCurrentDataTransferImport>>>;
type Deleted = InferOk<Awaited<ReturnType<typeof deleteCurrentDataTransferImport>>>;

/** A write that shows the current import it returns at once and rereads it once it settles. */
const currentImportWrite = { invalidates: ["currentImport"], refetchAfterFailure: true } as const;

const startImportCommand = defineCommand({
  ...currentImportWrite,
  persist: startDataTransferImport,
  saved: async (queryClient, _request, started) => {
    queryClient.setQueryData(currentImportKey, started);
  },
});

/** A retried import streams its status again from the start. */
const retryImportCommand = defineCommand({
  ...currentImportWrite,
  persist: retryCurrentDataTransferImport,
  saved: async (queryClient, _input, retried) => {
    queryClient.removeQueries({ queryKey: importStatusKey(retried.id), exact: true });
    queryClient.setQueryData(currentImportKey, retried);
  },
});

const deleteImportCommand = defineCommand({
  ...currentImportWrite,
  persist: deleteCurrentDataTransferImport,
  saved: async (queryClient, _input, deleted) => {
    queryClient.removeQueries({ queryKey: importStatusKey(deleted.id), exact: true });
    queryClient.setQueryData(currentImportKey, null);
  },
});

/** The extension fetches the items a started or retried import is missing. */
function fetchMissing({ id, missingMfcItemIds }: Started | Retried): void {
  toastRunOutcome(importDataTransferItems({ importId: id, mfcItemIds: missingMfcItemIds }));
}

/** Starts an import through `startImport`. */
export function useStartImport(onSaved: (started: Started) => void) {
  const write = useResourceMutation(startImportCommand, {
    onSaved: (_request, started) => {
      fetchMissing(started);
      onSaved(started);
    },
  });
  const run = (request: DataTransferImportRequest) => startImport(() => write.run(request));
  return { ...write, run } as const;
}

/** Retries an import through `startImport`. */
export function useRetryImport(onSaved: (retried: Retried) => void) {
  const write = useResourceMutation(retryImportCommand, {
    onSaved: (_input, retried) => {
      fetchMissing(retried);
      onSaved(retried);
    },
  });
  const run = () => startImport(() => write.run());
  return { ...write, run } as const;
}

export function useDeleteImport(onSaved: (deleted: Deleted) => void) {
  return useResourceMutation(deleteImportCommand, {
    onSaved: (_input, deleted) => onSaved(deleted),
  });
}
