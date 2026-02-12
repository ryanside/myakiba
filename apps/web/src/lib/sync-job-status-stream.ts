import * as z from "zod";
import { syncJobStatusSchema } from "@myakiba/schemas";
import type { SyncJobStatus, SyncTerminalState } from "@myakiba/types";

const sseJobStatusChunkSchema = z.object({
  data: syncJobStatusSchema,
});

export type JobTerminalState = SyncTerminalState;
export type JobStatusEvent = Readonly<SyncJobStatus>;

export type SSEJobStatusChunk = Readonly<{
  data: JobStatusEvent;
}>;

type StreamValue = string | number | boolean | bigint | symbol | null | undefined | object;

const isAsyncIterable = (value: StreamValue): value is AsyncIterable<StreamValue> => {
  if (typeof value !== "object" || value === null) return false;
  return Symbol.asyncIterator in value;
};

export const parseSSEJobStatusStream = (value: StreamValue): AsyncIterable<SSEJobStatusChunk> => {
  if (!isAsyncIterable(value)) {
    throw new Error("Job status stream is not async iterable");
  }

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
