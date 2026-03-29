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
import { ShimmeringText } from "@/components/ui/shimmering-text";
import type { SyncSessionStatus, SyncType } from "@myakiba/contracts/shared/types";
import { fetchSyncSessions } from "@/queries/sync";
import { SESSION_STATUS_CONFIG, SYNC_TYPE_CONFIG } from "@/lib/sync";
import { formatRelativeTimeToNow } from "@/lib/date-display";
import { ACTIVE_SYNC_SESSION_STATUS_SET } from "@myakiba/contracts/sync/constants";
import { useSyncJobStatusQuery } from "@/hooks/use-sync-job-status-query";
import { PulsingDot } from "@/components/ui/pulsing-dot";
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

  const totalActiveItems = activeSessions.reduce((sum, s) => sum + s.totalItems, 0);
  const totalActiveSynced = activeSessions.reduce((sum, s) => sum + s.successCount, 0);

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
          <SyncSessionObserver key={activeSession.id} jobId={activeSession.jobId} />
        ) : null,
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button size="sm" variant="outline" className="mx-2 w-41.5 justify-start!">
              {hasActive ? (
                <span className="flex w-full items-center gap-2">
                  <PulsingDot />
                  <ShimmeringText
                    text={
                      totalActiveItems > 0
                        ? `Syncing ${totalActiveSynced}/${totalActiveItems}`
                        : "Syncing..."
                    }
                    duration={1}
                    repeat={true}
                    startOnView={false}
                    className="text-xs font-medium"
                    spread={1.5}
                  />
                  <SparkleTrail />
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <span className="relative flex size-2">
                    <span className="relative inline-flex size-2 rounded-full bg-border" />
                  </span>
                  <span className="text-xs text-muted-foreground">No active sync sessions</span>
                </span>
              )}
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
                    <p className="mb-2.5 text-[0.6875rem] font-medium tracking-wide text-muted-foreground">
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
                    <p className="mb-2.5 text-[0.6875rem] font-medium tracking-wide text-muted-foreground">
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

            <div className="border-t px-1.5 py-1.5">
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
  readonly onNavigate: () => void;
};

function ActiveSessionItem({ session, onNavigate }: ActiveSessionProps) {
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
  const progressPercent =
    session.totalItems > 0 ? Math.round((session.successCount / session.totalItems) * 100) : 0;

  return (
    <Link
      to="/sync/$id"
      params={{ id: session.id }}
      onClick={onNavigate}
      className="group block rounded-md px-2.5 py-2 transition-colors duration-150 hover:bg-accent"
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
        <div className="mt-2 space-y-1">
          <Progress value={session.successCount} max={session.totalItems} className="h-1" />
          <div className="flex items-center justify-between text-[0.6875rem] text-muted-foreground">
            <span>
              {session.successCount} of {session.totalItems}
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

  const statusIcon = resolveStatusIcon(session.status);

  return (
    <Link
      to="/sync/$id"
      params={{ id: session.id }}
      onClick={onNavigate}
      className="group flex items-start gap-2.5 rounded-md px-2.5 py-2 transition-colors duration-150 hover:bg-accent"
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
              {session.successCount}/{session.totalItems} synced
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
