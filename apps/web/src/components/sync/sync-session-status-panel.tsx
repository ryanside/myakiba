import type { ReactNode } from "react";
import type { SyncSessionRow } from "@myakiba/contracts/sync/types";
import { DotmRandom } from "@/components/ui/dotm-random";
import { Progress } from "@/components/ui/progress";
import { useSyncJobStatusQuery } from "@/hooks/use-sync-job-status-query";
import { resolveSyncMessage } from "@/lib/sync";
import { cn } from "@/lib/utils";

export function SyncSessionStatusPanel({
  session,
  isActive,
}: {
  readonly session: Pick<
    SyncSessionRow,
    "id" | "jobId" | "statusMessage" | "totalItems" | "successCount" | "failCount"
  >;
  readonly isActive: boolean;
}): ReactNode {
  const { data: jobStatus, isError: isJobError } = useSyncJobStatusQuery(
    isActive ? session.jobId : null,
    session.id,
  );

  const isLive = isActive && jobStatus?.terminalState == null;
  const isStreamError = isLive && (isJobError || !jobStatus);
  const message = resolveSyncMessage(session, isLive ? (jobStatus ?? null) : null, isStreamError);

  if (!message) return null;

  // `progress.processed` counts succeeded + failed, so the DB fallback must too
  // — otherwise the bar jumps forward on stream disconnect.
  const liveProgress = isLive ? (jobStatus?.progress ?? null) : null;
  const displayedProcessed = liveProgress?.processed ?? session.successCount + session.failCount;
  const displayedTotal = liveProgress?.total ?? session.totalItems;
  const percent = displayedTotal > 0 ? Math.round((displayedProcessed / displayedTotal) * 100) : 0;

  return (
    <div className="space-y-2" role="status" aria-live={isLive ? "polite" : "off"}>
      <div className="flex items-center gap-2">
        {isLive ? (
          <DotmRandom size={12} dotSize={2} ariaLabel="Sync in progress" className="shrink-0" />
        ) : (
          <span aria-hidden className="size-2 shrink-0 rounded-full bg-muted-foreground/50" />
        )}
        <p className={cn("text-sm", isStreamError && "text-destructive")}>Status: {message}</p>
      </div>

      <div className="space-y-1">
        <Progress value={displayedProcessed} max={displayedTotal || 1} className="h-1" />
        <div className="flex items-center justify-between text-xs text-muted-foreground tabular-nums">
          <span>
            {displayedProcessed} of {displayedTotal}
          </span>
          <span>{percent}%</span>
        </div>
      </div>
    </div>
  );
}
