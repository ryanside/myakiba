import {
  useQuery,
  useQueryClient,
  experimental_streamedQuery as streamedQuery,
} from "@tanstack/react-query";
import { SYNC_STATUS_MESSAGES } from "@myakiba/contracts/sync/messages";
import { app } from "@/lib/treaty-client";
import { parseSSEJobStatusStream } from "@/lib/sync-job-status-stream";
import type { JobStatusEvent, SSEJobStatusChunk } from "@/lib/sync-job-status-stream";
import { resolveSyncMessage } from "@/lib/sync";
import { invalidateSyncResultQueries } from "@/lib/mutation-query-invalidation";
import { showSyncToast } from "@/components/sync/sync-toast";

export function useSyncJobStatusQuery(jobId: string | null, sessionId: string | null = null) {
  const queryClient = useQueryClient();
  const now = new Date().toISOString();
  const initialValue: JobStatusEvent = {
    jobId: jobId ?? "",
    phase: "queued",
    statusMessage: SYNC_STATUS_MESSAGES.connecting,
    progress: null,
    recentItems: [],
    error: null,
    startedAt: now,
    updatedAt: now,
    terminalState: null,
  };

  return useQuery({
    queryKey: ["syncJobStatus", jobId] as const,
    enabled: jobId !== null,
    queryFn: streamedQuery({
      streamFn: async ({ signal }) => {
        if (jobId === null) throw new Error("jobId is null");
        const { data, error } = await app.api.sync["job-status"].get({
          query: { jobId },
          fetch: { signal },
        });
        if (error) throw new Error("Failed to connect to job status stream");
        if (!data) throw new Error("No data received from job status stream");

        const stream = parseSSEJobStatusStream(data);

        async function* withFinishedCheck(): AsyncGenerator<SSEJobStatusChunk> {
          for await (const chunk of stream) {
            yield chunk;
            const { terminalState } = chunk.data;
            if (terminalState === null) continue;

            void invalidateSyncResultQueries(queryClient);

            const message = resolveSyncMessage(
              { statusMessage: chunk.data.statusMessage },
              chunk.data,
              false,
            );

            const description =
              chunk.data.error?.message && chunk.data.error.message !== message
                ? chunk.data.error.message
                : undefined;

            showSyncToast({
              state: terminalState,
              sessionId: sessionId ?? undefined,
              message,
              description,
            });
          }
        }

        return withFinishedCheck();
      },
      reducer: (_prev: JobStatusEvent, chunk: SSEJobStatusChunk) => chunk.data,
      initialValue,
    }),
    refetchOnWindowFocus: false,
    retry: false,
  });
}
