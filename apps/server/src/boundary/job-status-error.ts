import { sse } from "elysia";
import type { SyncJobStatus } from "@myakiba/contracts/sync/schema";

/** A terminal status in the stream's existing protocol, with only the operation's safe failure text. */
export function jobStatusError(message: string, last: { readonly data: SyncJobStatus }) {
  const data: SyncJobStatus = {
    ...last.data,
    phase: "failed",
    statusMessage: message,
    progress: null,
    recentItems: [],
    error: { code: "unknown", message },
    updatedAt: new Date().toISOString(),
    terminalState: "error",
  };
  return sse({ data });
}
