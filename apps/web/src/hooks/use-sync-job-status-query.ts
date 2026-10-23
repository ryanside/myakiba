import { useNavigate } from "@tanstack/react-router";
import type { SyncJobStatus } from "@myakiba/contracts/sync/schema";
import type { SyncType } from "@myakiba/contracts/shared/types";
import { useRead } from "@/data/client";
import { sync } from "@/data/resources/sync";
import { resolveSyncMessage, SYNC_OPTION_META } from "@/lib/sync";
import { toast } from "@/components/ui/toast";

export function useSyncJobStatusQuery(
  jobId: string | null,
  sessionId: string | null,
  syncType: SyncType | null,
) {
  const navigate = useNavigate();

  const onEnd = (status: SyncJobStatus): void => {
    const { error: chunkError, statusMessage, terminalState } = status;
    const message = resolveSyncMessage({ statusMessage }, status, false);

    const description =
      chunkError?.message && chunkError.message !== message ? chunkError.message : undefined;

    const meta = syncType === null ? null : SYNC_OPTION_META[syncType];
    let toastType = "error";
    let toastTitle: string = meta?.failureTitle ?? "Import failed";

    if (terminalState === "success") {
      toastType = "success";
      toastTitle = meta?.completedTitle ?? "Import complete";
    } else if (terminalState === "partial") {
      toastType = "warning";
      toastTitle = "Failed to add some items";
    } else if (terminalState === "timeout") {
      toastType = "info";
      toastTitle = "Status updates timed out";
    }

    const toastId = toast.add({
      type: toastType,
      title: toastTitle,
      description: description === undefined ? message : `${message}. ${description}`,
      actionProps: {
        children: sessionId === null ? "View import history" : "View details",
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
  };

  return useRead(sync.jobStatus, { jobId, onEnd }, { enabled: jobId !== null });
}
