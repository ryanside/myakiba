import {
  useQuery,
  useQueryClient,
  experimental_streamedQuery as streamedQuery,
} from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { SYNC_STATUS_MESSAGES } from "@myakiba/contracts/sync/messages";
import { app } from "@/lib/treaty-client";
import { parseSSEJobStatusStream } from "@/lib/sync-job-status-stream";
import type { JobStatusEvent, SSEJobStatusChunk } from "@/lib/sync-job-status-stream";
import { resolveSyncMessage } from "@/lib/sync";
import { invalidateSyncResultQueries } from "@/lib/mutation-query-invalidation";
import { toast } from "@/components/ui/toast";

export function useSyncJobStatusQuery(jobId: string | null, sessionId: string | null = null) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
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
            const { error: chunkError, statusMessage, terminalState } = chunk.data;
            if (terminalState === null) {
              yield chunk;
              continue;
            }

            await invalidateSyncResultQueries(queryClient);

            const message = resolveSyncMessage({ statusMessage }, chunk.data, false);

            const description =
              chunkError?.message && chunkError.message !== message
                ? chunkError.message
                : undefined;

            let toastType = "error";
            let toastTitle = "Sync Failed";

            if (terminalState === "success") {
              toastType = "success";
              toastTitle = "Sync Complete";
            } else if (terminalState === "partial") {
              toastType = "warning";
              toastTitle = "Sync Partial";
            } else if (terminalState === "timeout") {
              toastType = "info";
              toastTitle = "Sync Timed Out";
            }

            const toastId = toast.add({
              type: toastType,
              title: toastTitle,
              description: description === undefined ? message : `${message} — ${description}`,
              actionProps: {
                children: sessionId === null ? "View History" : "View Status",
                onClick() {
                  toast.close(toastId);
                  if (sessionId === null) {
                    void navigate({ to: "/sync" });
                    return;
                  }

                  void navigate({ to: "/sync/$id", params: { id: sessionId } });
                },
              },
            });

            yield chunk;
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
