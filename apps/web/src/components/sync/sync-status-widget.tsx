import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowRight01Icon,
  CancelCircleIcon,
  Loading03Icon,
  Tick02Icon,
  AlertCircleIcon,
  Clock02Icon,
} from "@hugeicons/core-free-icons";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button, buttonVariants } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ThemedBadge } from "@/components/reui/badge";
import { Progress } from "@/components/ui/progress";
import type { SyncSessionStatus, SyncType } from "@myakiba/contracts/shared/types";
import { fetchSyncSessions } from "@/queries/sync";
import { resolveSyncMessage, SESSION_STATUS_CONFIG, SYNC_TYPE_CONFIG } from "@/lib/sync";
import { formatRelativeTimeToNow } from "@/lib/date-display";
import { ACTIVE_SYNC_SESSION_STATUS_SET } from "@myakiba/contracts/sync/constants";
import { useSyncJobStatusQuery } from "@/hooks/use-sync-job-status-query";
import { Spinner } from "@/components/ui/spinner";
import { SparkleTrail } from "@/components/ui/sparkle-trail";
import { cn } from "@/lib/utils";

export default function SyncStatusWidget() {
  const {
    data: recentData,
    isPending: isRecentPending,
    isError: isRecentError,
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

  const closePopover = () => setOpen(false);

  return (
    <>
      {activeSessions.map((activeSession) =>
        activeSession.jobId ? (
          <SyncSessionObserver
            key={activeSession.id}
            jobId={activeSession.jobId}
            sessionId={activeSession.id}
            syncType={activeSession.syncType}
          />
        ) : null,
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              size="sm"
              variant="outline"
              className="relative mx-2 text-xs text-muted-foreground"
              disabled={isRecentPending}
              aria-busy={isRecentPending}
            >
              {hasActive ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <HugeiconsIcon icon={Clock02Icon} data-icon="inline-start" />
              )}
              <span className={hasActive ? "shimmer" : undefined}>
                {hasActive ? "Importing..." : "Imports"}
              </span>
              {hasActive && <SparkleTrail />}
            </Button>
          }
        />
        <PopoverContent
          align="start"
          aria-label="Imports"
          className="h-85 max-h-[calc(100dvh-120px)] w-80 max-w-[calc(100vw-2rem)] gap-0 overflow-hidden p-0 ease-out"
        >
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {isRecentError ? (
              <div className="p-4">
                <Alert variant="destructive">
                  <HugeiconsIcon icon={AlertCircleIcon} />
                  <AlertTitle>History unavailable</AlertTitle>
                  <AlertDescription>
                    Refresh the page to reload your import history.
                  </AlertDescription>
                </Alert>
              </div>
            ) : (
              <>
                {hasActive && (
                  <section aria-label="Active imports" className="px-2 pt-3 pb-1.5">
                    <h3 className="px-2 pb-1.75 text-[0.625rem] font-medium text-muted-foreground">
                      Active
                    </h3>
                    {activeSessions.map((s) => (
                      <ActiveSessionItem key={s.id} session={s} onNavigate={closePopover} />
                    ))}
                  </section>
                )}

                {finishedSessions.length > 0 && (
                  <section
                    aria-label="Recent imports"
                    className={cn("px-2 pt-3 pb-1.5", hasActive && "border-t")}
                  >
                    <h3 className="px-2 pb-1.75 text-[0.625rem] font-medium text-muted-foreground">
                      Recent
                    </h3>
                    {finishedSessions.map((s) => (
                      <RecentSessionItem key={s.id} session={s} onNavigate={closePopover} />
                    ))}
                  </section>
                )}

                {!hasActive && finishedSessions.length === 0 && (
                  <Empty className="h-full">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <HugeiconsIcon icon={Clock02Icon} />
                      </EmptyMedia>
                      <EmptyTitle>No recent imports</EmptyTitle>
                      <EmptyDescription>Your import activity will appear here.</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
              </>
            )}
          </div>
          <footer className="shrink-0 border-t p-1.5">
            <Link
              to="/sync"
              onClick={closePopover}
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "w-full justify-between",
              )}
            >
              View import history
              <HugeiconsIcon icon={ArrowRight01Icon} data-icon="inline-end" />
            </Link>
          </footer>
        </PopoverContent>
      </Popover>
    </>
  );
}

function SyncSessionObserver({
  jobId,
  sessionId,
  syncType,
}: {
  readonly jobId: string;
  readonly sessionId: string;
  readonly syncType: SyncType;
}) {
  useSyncJobStatusQuery(jobId, sessionId, syncType);
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
  const { data: jobStatus, isError: isJobError } = useSyncJobStatusQuery(
    session.jobId,
    session.id,
    session.syncType,
  );

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
  let statusIcon = Clock02Icon;
  if (isJobError) statusIcon = CancelCircleIcon;
  else if (showSpinner) statusIcon = Loading03Icon;

  return (
    <Link
      to="/sync/$id"
      params={{ id: session.id }}
      onClick={onNavigate}
      className="mb-1 block rounded-sm p-2 hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      aria-label={`View ${typeConfig.label} import`}
    >
      <div className="flex min-w-0 items-center gap-1.75">
        <span
          className={cn(
            "inline-flex size-4.5 shrink-0 items-center justify-center text-muted-foreground",
            session.status === "processing" && "text-info-foreground",
            isJobError && "text-destructive",
          )}
        >
          <HugeiconsIcon
            icon={statusIcon}
            className={cn("size-3.5", showSpinner && "motion-safe:animate-spin")}
          />
        </span>
        <span className="min-w-0 flex-1 text-xs font-[550]">{typeConfig.label}</span>
        <ThemedBadge variant={SESSION_STATUS_CONFIG[session.status].variant} size="xs">
          {SESSION_STATUS_CONFIG[session.status].label}
        </ThemedBadge>
      </div>

      {displayedTotal > 0 && (
        <div className="mt-2.75">
          <Progress
            value={displayedProcessed}
            max={displayedTotal}
            aria-label={`${typeConfig.label} import progress`}
            className="[&_[data-slot=progress-indicator]]:transition-none"
          />
          <div className="mt-1.25 flex items-center justify-between text-[0.625rem] text-muted-foreground tabular-nums">
            <span>
              {displayedProcessed} of {displayedTotal}
            </span>
            <span>{progressPercent}%</span>
          </div>
        </div>
      )}

      {displayStatus && (
        <p
          className={cn(
            "mt-1.75 text-[0.6875rem] leading-normal wrap-anywhere",
            isJobError ? "text-destructive" : "text-muted-foreground",
          )}
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
    readonly updatedAt: Date;
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
      className="flex items-start gap-1.75 rounded-sm px-2 py-2.25 hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      aria-label={`View ${typeConfig.label} import updated ${formatRelativeTimeToNow(session.updatedAt)}`}
    >
      <div className="inline-flex size-4.5 shrink-0 items-center justify-center">
        <HugeiconsIcon icon={statusIcon.icon} className={cn("size-3.5", statusIcon.className)} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.75">
          <span className="min-w-0 flex-1 text-xs font-[550]">{typeConfig.label}</span>
          <span className="shrink-0 text-[0.625rem] text-muted-foreground">
            {formatRelativeTimeToNow(session.updatedAt)}
          </span>
        </div>

        <div className="mt-0.75 flex flex-wrap items-center gap-x-1.25 gap-y-0.5 text-[0.625rem] leading-normal text-muted-foreground tabular-nums">
          <span>{SESSION_STATUS_CONFIG[session.status].label}</span>
          {hasItems && (
            <>
              <span aria-hidden="true">·</span>
              <span>
                {displayedSuccessCount}/{session.totalItems} added
              </span>
              {session.failCount > 0 && (
                <span className="text-destructive">{session.failCount} failed</span>
              )}
            </>
          )}
        </div>
      </div>
    </Link>
  );
}

function resolveStatusIcon(status: SyncSessionStatus) {
  switch (status) {
    case "completed":
      return { icon: Tick02Icon, className: "text-success-foreground" };
    case "failed":
      return { icon: CancelCircleIcon, className: "text-destructive" };
    case "partial":
      return { icon: AlertCircleIcon, className: "text-warning-foreground" };
    case "processing":
      return { icon: Loading03Icon, className: "text-info-foreground motion-safe:animate-spin" };
    case "pending":
      return { icon: Loading03Icon, className: "text-muted-foreground" };
  }
}
