import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon, CancelCircleIcon, Loading03Icon } from "@hugeicons/core-free-icons";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ShimmeringText } from "@/components/ui/shimmering-text";
import type { SyncSessionStatus, SyncType } from "@myakiba/types";
import { fetchSyncSessions } from "@/queries/sync";
import { SESSION_STATUS_CONFIG, SYNC_TYPE_CONFIG } from "@/lib/sync";
import { formatRelativeTime } from "@myakiba/utils/dates";
import { ACTIVE_SYNC_SESSION_STATUS_SET, SYNC_WIDGET_RECENT_LIMIT } from "@myakiba/constants/sync";
import { useSyncJobStatusQuery } from "@/hooks/use-sync-job-status-query";

export default function SyncStatusWidget() {
  const {
    data: recentData,
    isPending: isRecentPending,
    isError: isRecentError,
    error: recentError,
  } = useQuery({
    queryKey: ["syncSessions", 1, SYNC_WIDGET_RECENT_LIMIT, undefined, undefined] as const,
    queryFn: () => fetchSyncSessions({ page: 1, limit: SYNC_WIDGET_RECENT_LIMIT }),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const sessions = recentData?.sessions ?? [];

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
  const hasSessions = sessions.length > 0;

  const totalActiveItems = activeSessions.reduce((sum, s) => sum + s.totalItems, 0);
  const totalActiveSynced = activeSessions.reduce((sum, s) => sum + s.successCount, 0);

  if (isRecentPending || (!hasSessions && !isRecentError)) {
    return null;
  }

  return (
    <>
      {activeSessions.map((activeSession) =>
        activeSession.jobId ? (
          <SyncSessionObserver key={activeSession.id} jobId={activeSession.jobId} />
        ) : null,
      )}

      <Popover>
        <PopoverTrigger asChild>
          <Button size="sm" variant="outline" appearance="ghost" className="mx-2">
            {hasActive ? (
              <div className="flex items-center gap-2">
                <PulsingDot />
                <ShimmeringText
                  text={
                    totalActiveItems > 0
                      ? `Syncing ${totalActiveSynced}/${totalActiveItems}`
                      : "Syncing..."
                  }
                  duration={2.5}
                  repeat={true}
                  startOnView={false}
                  className="text-xs font-medium"
                  spread={1.5}
                />
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="relative flex size-2">
                  <span className="relative inline-flex size-2 rounded-full bg-border" />
                </span>
                <span className="text-xs text-muted-foreground">No active sync sessions</span>
              </div>
            )}
          </Button>
        </PopoverTrigger>

        <PopoverContent align="center" className="w-80 p-0">
          <div className="max-h-[400px] overflow-y-auto">
            <div className="space-y-4 p-4">
              {isRecentError && <p className="text-xs text-destructive">{recentError.message}</p>}

              {!isRecentError && (
                <>
                  {hasActive && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Active
                      </p>
                      <div className="space-y-1.5">
                        {activeSessions.map((s) => (
                          <ActiveSessionItem key={s.id} session={s} />
                        ))}
                      </div>
                    </div>
                  )}

                  {finishedSessions.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Recent
                      </p>
                      <div className="space-y-1.5">
                        {finishedSessions.map((s) => (
                          <RecentSessionItem key={s.id} session={s} />
                        ))}
                      </div>
                    </div>
                  )}

                  {!hasActive && finishedSessions.length === 0 && (
                    <p className="text-xs text-muted-foreground">No recent syncs</p>
                  )}
                </>
              )}

              <div className="border-t pt-2">
                <PopoverClose asChild>
                  <Link to="/sync">
                    <Button variant="ghost" size="sm" className="w-full justify-between">
                      View sync history
                      <HugeiconsIcon icon={ArrowRight01Icon} className="size-3" />
                    </Button>
                  </Link>
                </PopoverClose>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}

function PulsingDot() {
  return (
    <span className="relative flex size-2">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
      <span className="relative inline-flex size-2 rounded-full bg-primary" />
    </span>
  );
}

function SyncSessionObserver({ jobId }: { readonly jobId: string }) {
  useSyncJobStatusQuery(jobId);
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
    readonly statusMessage: string;
  };
};

function ActiveSessionItem({ session }: ActiveSessionProps) {
  const {
    data: jobStatus,
    isError: isJobError,
    error: jobError,
  } = useSyncJobStatusQuery(session.jobId);

  const isFinished = jobStatus?.finished === true;
  const displayStatus = isJobError
    ? jobError.message
    : (jobStatus?.status ?? session.statusMessage);
  const typeConfig = SYNC_TYPE_CONFIG[session.syncType];

  return (
    <PopoverClose asChild>
      <Link
        to="/sync/$id"
        params={{ id: session.id }}
        className="block w-full rounded-lg border p-3 text-left text-sm transition-colors hover:bg-accent"
        aria-label="View sync session details"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant={typeConfig.variant} appearance="outline" size="sm">
              {typeConfig.label}
            </Badge>
            <Badge
              variant={SESSION_STATUS_CONFIG[session.status].variant}
              appearance="light"
              size="sm"
            >
              {SESSION_STATUS_CONFIG[session.status].label}
            </Badge>
          </div>
          {session.status === "processing" && !isFinished && !isJobError && (
            <HugeiconsIcon
              icon={Loading03Icon}
              className="size-3 animate-spin text-muted-foreground"
            />
          )}
          {isJobError && (
            <HugeiconsIcon icon={CancelCircleIcon} className="size-3 text-destructive" />
          )}
        </div>
        {session.totalItems > 0 && (
          <div className="mt-2.5 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {session.successCount} of {session.totalItems} synced
              </span>
              <span className="tabular-nums">
                {Math.round((session.successCount / session.totalItems) * 100)}%
              </span>
            </div>
            <Progress value={session.successCount} max={session.totalItems} className="h-1" />
          </div>
        )}
        {displayStatus && (
          <p
            className={`mt-1.5 text-xs ${
              isJobError ? "text-destructive" : "text-muted-foreground"
            }`}
          >
            {displayStatus}
          </p>
        )}
      </Link>
    </PopoverClose>
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
};

function RecentSessionItem({ session }: RecentSessionProps) {
  const statusConfig = SESSION_STATUS_CONFIG[session.status];
  const typeConfig = SYNC_TYPE_CONFIG[session.syncType];
  const hasItems = session.totalItems > 0;
  const progressPercent = hasItems
    ? Math.round((session.successCount / session.totalItems) * 100)
    : 0;

  return (
    <PopoverClose asChild>
      <Link
        to="/sync/$id"
        params={{ id: session.id }}
        className="block w-full rounded-lg border p-3 text-left text-sm transition-colors hover:bg-accent"
        aria-label="View sync session details"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" appearance="ghost" size="sm">
              {typeConfig.label}
            </Badge>
            <Badge variant={statusConfig.variant} appearance="light" size="sm">
              {statusConfig.label}
            </Badge>
            {session.orderId && (
              <Badge variant="info" appearance="outline" size="sm">
                Order
              </Badge>
            )}
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">
            {formatRelativeTime(session.createdAt)}
          </span>
        </div>

        {hasItems && (
          <div className="mt-2.5 space-y-1.5">
            <Progress value={session.successCount} max={session.totalItems} className="h-1" />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {session.successCount}/{session.totalItems} synced
                {session.failCount > 0 && (
                  <span className="text-destructive"> &middot; {session.failCount} failed</span>
                )}
              </span>
              <span className="tabular-nums">{progressPercent}%</span>
            </div>
          </div>
        )}
      </Link>
    </PopoverClose>
  );
}
