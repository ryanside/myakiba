import * as z from "zod";
import { syncJobStatusSchema } from "@myakiba/contracts/sync/schema";
import type { SyncJobStatus, SyncTerminalState } from "@myakiba/contracts/sync/schema";

const sseJobStatusChunkSchema = z.object({
  data: syncJobStatusSchema,
});

export type JobTerminalState = SyncTerminalState;
export type JobStatusEvent = Readonly<SyncJobStatus>;
export type SSEJobStatusChunk = z.infer<typeof sseJobStatusChunkSchema>;

export const parseSSEJobStatusStream = (
  value: AsyncIterable<unknown>,
): AsyncIterable<SSEJobStatusChunk> => {
  return (async function* parseStream(): AsyncGenerator<SSEJobStatusChunk> {
    for await (const chunk of value) {
      const parsedChunk = sseJobStatusChunkSchema.safeParse(chunk);
      if (!parsedChunk.success) {
        throw new Error(`Invalid job status chunk shape: ${parsedChunk.error.message}`);
      }
      yield parsedChunk.data;
    }
  })();
};
