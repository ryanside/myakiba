import type { ReactNode } from "react";
import type { SyncSessionRow } from "@myakiba/contracts/sync/types";
import { DotmRandom } from "@/components/ui/dotm-random";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useSyncJobStatusQuery } from "@/hooks/use-sync-job-status-query";
import { resolveSyncMessage } from "@/lib/sync";
import { cn } from "@/lib/utils";

export function SyncSessionStatusPanel({
  session,
  isActive,
  isLoading,
}: {
  readonly session:
    | Pick<
        SyncSessionRow,
        "id" | "jobId" | "statusMessage" | "totalItems" | "successCount" | "failCount"
      >
    | undefined;
  readonly isActive: boolean;
  readonly isLoading: boolean;
}): ReactNode {
  const { data: jobStatus, isError: isJobError } = useSyncJobStatusQuery(
    isActive && session ? session.jobId : null,
    session?.id ?? null,
  );

  if (isLoading) {
    return (
      <div className="space-y-2" aria-busy="true">
        <div className="flex items-center gap-2">
          <Skeleton className="size-2 shrink-0 rounded-full" />
          <div className="flex items-center gap-1 text-sm">
            Status: <Skeleton className="h-4 w-44 max-w-[60vw]" />
          </div>
        </div>
        <div className="space-y-1">
          <Skeleton className="h-1 w-full rounded-full" />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Skeleton className="h-3 w-5" /> of <Skeleton className="h-3 w-5" />
            </div>
            <div className="flex items-center gap-0.5">
              <Skeleton className="h-3 w-6" />%
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!session) return null;

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
    <output className="block space-y-2" aria-live={isLive ? "polite" : "off"}>
      <div className="flex items-center gap-2">
        {isLive ? (
          <DotmRandom size={12} dotSize={2} ariaLabel="Sync in progress" className="shrink-0" />
        ) : (
          <span aria-hidden className="size-2 shrink-0 rounded-full bg-muted-foreground/50" />
        )}
        <p className={cn("text-sm", isStreamError && "text-destructive")}>
          Status: <span className="animate-data-in inline-block">{message}</span>
        </p>
      </div>

      <div className="space-y-1">
        <Progress
          value={displayedProcessed}
          max={displayedTotal || 1}
          className="animate-data-in h-1"
        />
        <div className="flex items-center justify-between text-xs text-muted-foreground tabular-nums">
          <span>
            <span className="animate-data-in inline-block">{displayedProcessed}</span> of{" "}
            <span className="animate-data-in inline-block">{displayedTotal}</span>
          </span>
          <span>
            <span className="animate-data-in inline-block">{percent}</span>%
          </span>
        </div>
      </div>
    </output>
  );
}
