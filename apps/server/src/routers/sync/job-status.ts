import type { JobData, SyncJobStatus } from "@myakiba/contracts/sync/schema";
import { publishImportStatus } from "@/lib/publish-import-status";

import { csvPriceWarnings } from "./csv";

export function importWarnings(payload: JobData | null): Pick<SyncJobStatus, "warnings"> {
  if (payload?.type !== "csv") return {};
  return payload.warnings?.length
    ? { warnings: payload.warnings }
    : csvPriceWarnings(payload.items);
}

export type ServerSyncJobStatus = SyncJobStatus & { readonly revision: number };

export const queuedJobStatus = (
  jobId: string,
  statusMessage: string,
  revision: number,
): ServerSyncJobStatus => {
  const now = new Date().toISOString();
  return {
    jobId,
    revision,
    phase: "queued",
    statusMessage,
    progress: null,
    recentItems: [],
    error: null,
    startedAt: now,
    updatedAt: now,
    terminalState: null,
  };
};

export async function publishJobStatus(
  status: ServerSyncJobStatus,
  syncSessionId: string,
): Promise<void> {
  await publishImportStatus({
    load: async () => status,
    action: "sync.jobStatusCache",
    jobId: status.jobId,
    syncSessionId,
  });
}
