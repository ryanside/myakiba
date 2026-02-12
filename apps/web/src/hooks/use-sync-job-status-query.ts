import {
  useQuery,
  useQueryClient,
  experimental_streamedQuery as streamedQuery,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { app } from "@/lib/treaty-client";
import {
  parseSSEJobStatusStream,
  type JobStatusEvent,
  type SSEJobStatusChunk,
} from "@/lib/sync-job-status-stream";

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
            if (chunk.data.finished) {
              void queryClient.invalidateQueries();
              if (chunk.data.terminalState === "success") {
                toast.success("Sync completed");
              } else if (chunk.data.terminalState === "timeout") {
                toast.info("Sync status stream timed out", {
                  description: "Refresh to check the latest sync status.",
                });
              } else {
                toast.error("Sync failed", {
                  description: chunk.data.status,
                });
              }
            }
          }
        }

        return withFinishedCheck();
      },
      reducer: (_prev: JobStatusEvent, chunk: SSEJobStatusChunk) => chunk.data,
      initialValue: {
        status: "Connecting...",
        finished: false,
        createdAt: "",
        terminalState: null,
      },
    }),
    refetchOnWindowFocus: false,
    retry: false,
  });
}
