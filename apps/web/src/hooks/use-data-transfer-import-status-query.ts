import {
  experimental_streamedQuery as streamedQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { DataTransferImport } from "@myakiba/contracts/data-transfer/schema";
import type { SyncJobStatus } from "@myakiba/contracts/sync/schema";
import { app, getErrorMessage } from "@/lib/treaty-client";
import { invalidateSyncResultQueries } from "@/lib/mutation-query-invalidation";
import { parseSSEJobStatusStream } from "@/lib/sync-job-status-stream";
import type { SSEJobStatusChunk } from "@/lib/sync-job-status-stream";

class ImportStatusStreamDisconnectedError extends Error {
  override readonly name = "ImportStatusStreamDisconnectedError";
}

export const dataTransferImportStatusQueryKey = (importId: string | null) =>
  ["dataTransferImportStatus", importId] as const;

export const dataTransferCurrentImportQueryKey = ["dataTransferImport", "current"] as const;

export function useDataTransferImportStatusQuery(currentImport: DataTransferImport | null) {
  const queryClient = useQueryClient();
  const activeImport =
    currentImport?.status === "queued" || currentImport?.status === "running"
      ? currentImport
      : null;

  return useQuery({
    queryKey: dataTransferImportStatusQueryKey(activeImport?.id ?? null),
    enabled: activeImport !== null,
    queryFn: streamedQuery<SSEJobStatusChunk, SyncJobStatus | null>({
      refetchMode: "append",
      streamFn: async ({ signal }) => {
        if (activeImport === null) throw new Error("No active import");

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

        const stream = parseSSEJobStatusStream(data);
        return (async function* (): AsyncGenerator<SSEJobStatusChunk> {
          try {
            for await (const chunk of stream) {
              if (chunk.data.terminalState !== null) {
                await queryClient.invalidateQueries({
                  queryKey: dataTransferCurrentImportQueryKey,
                });
                void invalidateSyncResultQueries(queryClient);
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
      reducer: (_previous, chunk) => chunk.data,
      initialValue: null,
    }),
    retry: (failureCount, error) =>
      failureCount < 3 && error instanceof ImportStatusStreamDisconnectedError,
    refetchOnWindowFocus: false,
  });
}
