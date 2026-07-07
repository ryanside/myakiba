import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowRight01Icon,
  CancelCircleIcon,
  Loading03Icon,
  Tick02Icon,
  AlertCircleIcon,
} from "@hugeicons/core-free-icons";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ThemedBadge } from "@/components/reui/badge";
import { Progress } from "@/components/ui/progress";
import type { SyncSessionStatus, SyncType } from "@myakiba/contracts/shared/types";
import { fetchSyncSessions } from "@/queries/sync";
import { resolveSyncMessage, SESSION_STATUS_CONFIG, SYNC_TYPE_CONFIG } from "@/lib/sync";
import { formatRelativeTimeToNow } from "@/lib/date-display";
import { ACTIVE_SYNC_SESSION_STATUS_SET } from "@myakiba/contracts/sync/constants";
import { useSyncJobStatusQuery } from "@/hooks/use-sync-job-status-query";
import { DotmRandom } from "@/components/ui/dotm-random";
import { Skeleton } from "@/components/ui/skeleton";
import { SparkleTrail } from "@/components/ui/sparkle-trail";

export default function SyncStatusWidget() {
  const {
    data: recentData,
    isPending: isRecentPending,
    isError: isRecentError,
    error: recentError,
  } = useQuery({
    queryKey: ["syncSessions", 1, 5, undefined, undefined] as const,
    queryFn: () => fetchSyncSessions({ page: 1, limit: 5 }),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const sessions = useMemo(() => recentData?.sessions ?? [], [recentData]);

  const { activeSessions, finishedSessions } = useMemo(() => {
    const active: typeof sessions = [];
    const finished: typeof sessions = [];
    for (const s of sessions) {
      if (ACTIVE_SYNC_SESSION_STATUS_SET.has(s.status)) {
        active.push(s);
      } else {
        finished.push(s);
      }
    }
    return { activeSessions: active, finishedSessions: finished };
  }, [sessions]);

  const hasActive = activeSessions.length > 0;

  const [open, setOpen] = useState(false);

  if (isRecentPending) {
    return (
      <Button size="sm" variant="outline" className="mx-2 w-41.5 justify-start!">
        <Skeleton className="w-41.5 h-4" />
      </Button>
    );
  }

  const closePopover = () => setOpen(false);

  return (
    <>
      {activeSessions.map((activeSession) =>
        activeSession.jobId ? (
          <SyncSessionObserver
            key={activeSession.id}
            jobId={activeSession.jobId}
            sessionId={activeSession.id}
          />
        ) : null,
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button size="sm" variant="outline" className="mx-2 w-41.5 justify-start!">
              <span className="grid w-full *:col-start-1 *:row-start-1">
                <span
                  className={`flex w-full items-center gap-2 transition-opacity duration-300 ${hasActive ? "opacity-100" : "opacity-0"}`}
                >
                  {hasActive && (
                    <>
                      <DotmRandom
                        size={12}
                        dotSize={2}
                        ariaLabel="Sync in progress"
                        className="shrink-0"
                      />
                      <span className="shimmer text-muted-foreground text-xs font-medium">
                        Syncing...
                      </span>
                      <SparkleTrail />
                    </>
                  )}
                </span>
                <span
                  className={`flex items-center gap-1.5 transition-opacity duration-300 ${hasActive ? "opacity-0" : "opacity-100"}`}
                >
                  <span className="relative flex size-2">
                    <span className="relative inline-flex size-2 rounded-full bg-border" />
                  </span>
                  <span className="text-xs text-muted-foreground">No active sync sessions</span>
                </span>
              </span>
            </Button>
          }
        />
        <PopoverContent align="center" className="w-80 p-0">
          <div className="max-h-[420px] overflow-y-auto">
            {isRecentError ? (
              <div className="flex items-center gap-2 px-4 py-3 text-xs text-destructive">
                <HugeiconsIcon icon={AlertCircleIcon} className="size-3.5 shrink-0" />
                {recentError.message}
              </div>
            ) : (
              <>
                {hasActive && (
                  <div className="px-4 pt-3 pb-2">
                    <p className="mb-2.5 text-[0.6875rem] font-medium text-muted-foreground">
                      Active
                    </p>
                    <div className="space-y-1.5">
                      {activeSessions.map((s) => (
                        <ActiveSessionItem key={s.id} session={s} onNavigate={closePopover} />
                      ))}
                    </div>
                  </div>
                )}

                {hasActive && finishedSessions.length > 0 && <div className="border-t" />}

                {finishedSessions.length > 0 && (
                  <div className="px-4 pt-3 pb-2">
                    <p className="mb-2.5 text-[0.6875rem] font-medium text-muted-foreground">
                      Recent
                    </p>
                    <div className="space-y-1.5">
                      {finishedSessions.map((s) => (
                        <RecentSessionItem key={s.id} session={s} onNavigate={closePopover} />
                      ))}
                    </div>
                  </div>
                )}

                {!hasActive && finishedSessions.length === 0 && (
                  <div className="px-4 py-6 text-center">
                    <p className="text-sm text-muted-foreground">No recent syncs</p>
                  </div>
                )}
              </>
            )}

            <div className="border-t p-1.5">
              <Link to="/sync" onClick={closePopover}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-between text-muted-foreground"
                >
                  View sync history
                  <HugeiconsIcon icon={ArrowRight01Icon} className="size-3" />
                </Button>
              </Link>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}

function SyncSessionObserver({
  jobId,
  sessionId,
}: {
  readonly jobId: string;
  readonly sessionId: string;
}) {
  useSyncJobStatusQuery(jobId, sessionId);
  return null;
}

type ActiveSessionProps = {
  readonly session: {
    readonly id: string;
    readonly syncType: SyncType;
    readonly status: SyncSessionStatus;
    readonly jobId: string | null;
    readonly totalItems: number;
    readonly successCount: number;
    readonly failCount: number;
    readonly statusMessage: string;
  };
  readonly onNavigate: () => void;
};

function ActiveSessionItem({ session, onNavigate }: ActiveSessionProps) {
  const { data: jobStatus, isError: isJobError } = useSyncJobStatusQuery(session.jobId, session.id);

  const typeConfig = SYNC_TYPE_CONFIG[session.syncType];
  const liveProgress = jobStatus?.progress ?? null;
  // `progress.processed` counts succeeded + failed, so the DB fallback must too
  // — otherwise the bar jumps forward on stream disconnect.
  const displayedProcessed = liveProgress?.processed ?? session.successCount + session.failCount;
  const displayedTotal = liveProgress?.total ?? session.totalItems;
  const progressPercent =
    displayedTotal > 0 ? Math.round((displayedProcessed / displayedTotal) * 100) : 0;

  const displayStatus = resolveSyncMessage(session, jobStatus ?? null, isJobError);
  const showSpinner = jobStatus?.terminalState == null && !isJobError;

  return (
    <Link
      to="/sync/$id"
      params={{ id: session.id }}
      onClick={onNavigate}
      className="group block rounded-md p-2 hover:bg-accent"
      aria-label={`View ${typeConfig.label} sync session`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <ThemedBadge variant={typeConfig.variant} size="xs">
            {typeConfig.label}
          </ThemedBadge>
          <ThemedBadge variant={SESSION_STATUS_CONFIG[session.status].variant} size="xs">
            {SESSION_STATUS_CONFIG[session.status].label}
          </ThemedBadge>
        </div>
        {showSpinner && (
          <HugeiconsIcon
            icon={Loading03Icon}
            className="size-3 animate-spin text-muted-foreground"
          />
        )}
        {isJobError && (
          <HugeiconsIcon icon={CancelCircleIcon} className="size-3 text-destructive" />
        )}
      </div>

      {displayedTotal > 0 && (
        <div className="mt-2 space-y-1">
          <Progress value={displayedProcessed} max={displayedTotal} className="h-1" />
          <div className="flex items-center justify-between text-[0.6875rem] text-muted-foreground">
            <span>
              {displayedProcessed} of {displayedTotal}
            </span>
            <span className="tabular-nums">{progressPercent}%</span>
          </div>
        </div>
      )}

      {displayStatus && (
        <p
          className={`mt-1 text-[0.6875rem] leading-tight ${
            isJobError ? "text-destructive" : "text-muted-foreground"
          }`}
        >
          {displayStatus}
        </p>
      )}
    </Link>
  );
}

type RecentSessionProps = {
  readonly session: {
    readonly id: string;
    readonly syncType: SyncType;
    readonly status: SyncSessionStatus;
    readonly totalItems: number;
    readonly successCount: number;
    readonly failCount: number;
    readonly orderId: string | null;
    readonly createdAt: Date;
  };
  readonly onNavigate: () => void;
};

function RecentSessionItem({ session, onNavigate }: RecentSessionProps) {
  const typeConfig = SYNC_TYPE_CONFIG[session.syncType];
  const hasItems = session.totalItems > 0;
  const displayedSuccessCount =
    session.status === "completed" ? session.totalItems - session.failCount : session.successCount;

  const statusIcon = resolveStatusIcon(session.status);

  return (
    <Link
      to="/sync/$id"
      params={{ id: session.id }}
      onClick={onNavigate}
      className="group flex items-start gap-2.5 rounded-md p-2 hover:bg-accent"
      aria-label={`View ${typeConfig.label} sync session from ${formatRelativeTimeToNow(session.createdAt)}`}
    >
      <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center">
        <HugeiconsIcon icon={statusIcon.icon} className={`size-3.5 ${statusIcon.className}`} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium">{typeConfig.label}</span>
          </div>
          <span className="shrink-0 text-[0.6875rem] text-muted-foreground">
            {formatRelativeTimeToNow(session.createdAt)}
          </span>
        </div>

        {hasItems && (
          <div className="mt-1 flex items-center gap-2 text-[0.6875rem] text-muted-foreground">
            <span>
              {displayedSuccessCount}/{session.totalItems} synced
            </span>
            {session.failCount > 0 && (
              <span className="text-destructive">{session.failCount} failed</span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}

function resolveStatusIcon(status: SyncSessionStatus): {
  readonly icon: typeof Tick02Icon;
  readonly className: string;
} {
  switch (status) {
    case "completed":
      return { icon: Tick02Icon, className: "text-success" };
    case "failed":
      return { icon: CancelCircleIcon, className: "text-destructive" };
    case "partial":
      return { icon: AlertCircleIcon, className: "text-warning" };
    case "processing":
      return { icon: Loading03Icon, className: "text-info animate-spin" };
    case "pending":
      return { icon: Loading03Icon, className: "text-muted-foreground" };
  }
}
