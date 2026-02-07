import {
  useQuery,
  experimental_streamedQuery as streamedQuery,
} from "@tanstack/react-query";
import { app } from "@/lib/treaty-client";

type JobStatusEvent = {
  readonly status: string;
  readonly finished: boolean;
  readonly createdAt: string;
};

type SSEJobStatusChunk = {
  readonly data: JobStatusEvent;
};

export function useSyncJobStatus(jobId: string | null) {
  return useQuery({
    queryKey: ["syncJobStatus", jobId] as const,
    enabled: jobId !== null,
    queryFn: streamedQuery({
      streamFn: async ({ signal }) => {
        const { data, error } = await app.api.sync["job-status"].get({
          query: { jobId: jobId! },
          fetch: { signal },
        });

        if (error) throw new Error("Failed to connect to job status stream");
        if (!data) throw new Error("No data received from job status stream");

        return data as unknown as AsyncIterable<SSEJobStatusChunk>;
      },
      reducer: (_prev: JobStatusEvent, chunk: SSEJobStatusChunk) => chunk.data,
      initialValue: {
        status: "Connecting...",
        finished: false,
        createdAt: "",
      },
    }),
    refetchOnWindowFocus: false,
    retry: false,
  });
}
