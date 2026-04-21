import {
  useQuery,
  useQueryClient,
  experimental_streamedQuery as streamedQuery,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { SYNC_STATUS_MESSAGES } from "@myakiba/contracts/sync/messages";
import { app } from "@/lib/treaty-client";
import {
  parseSSEJobStatusStream,
  type JobStatusEvent,
  type SSEJobStatusChunk,
} from "@/lib/sync-job-status-stream";
import { resolveSyncMessage } from "@/lib/sync";

const buildInitialValue = (jobId: string): JobStatusEvent => {
  const now = new Date().toISOString();
  return {
    jobId,
    phase: "queued",
    statusMessage: SYNC_STATUS_MESSAGES.connecting,
    progress: null,
    recentItems: [],
    error: null,
    startedAt: now,
    updatedAt: now,
    terminalState: null,
  };
};

export function useSyncJobStatusQuery(jobId: string | null) {
  const queryClient = useQueryClient();

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

            // do not invalidate the sync job status query or infinite loop will occur
            void queryClient.invalidateQueries({
              predicate: (query) => query.queryKey[0] !== "syncJobStatus",
            });

            const message = resolveSyncMessage(
              { statusMessage: chunk.data.statusMessage },
              chunk.data,
              false,
            );

            if (terminalState === "success") {
              toast.success(message);
            } else if (terminalState === "partial") {
              toast.warning(message);
            } else if (terminalState === "timeout") {
              toast.info(message);
            } else {
              const description =
                chunk.data.error?.message && chunk.data.error.message !== message
                  ? chunk.data.error.message
                  : undefined;
              if (description) {
                toast.error(message, { description });
              } else {
                toast.error(message);
              }
            }
          }
        }

        return withFinishedCheck();
      },
      reducer: (_prev: JobStatusEvent, chunk: SSEJobStatusChunk) => chunk.data,
      initialValue: buildInitialValue(jobId ?? ""),
    }),
    refetchOnWindowFocus: false,
    retry: false,
  });
}
