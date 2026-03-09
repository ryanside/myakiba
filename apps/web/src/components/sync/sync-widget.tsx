import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowRight01Icon,
  CancelCircleIcon,
  FileUploadIcon,
  LibraryIcon,
  Loading03Icon,
  PackageIcon,
} from "@hugeicons/core-free-icons";
import type { ComponentType, PropsWithChildren } from "react";
import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { SyncSessionStatus, SyncType } from "@myakiba/types";
import { fetchSyncSessions } from "@/queries/sync";
import { SESSION_STATUS_CONFIG, SYNC_TYPE_CONFIG, SYNC_OPTION_META } from "@/lib/sync";
import { formatRelativeTime } from "@myakiba/utils/dates";
import SyncCsvForm from "@/components/sync/sync-csv-form";
import SyncOrderForm from "@/components/sync/sync-order-form";
import SyncCollectionForm from "@/components/sync/sync-collection-form";
import type { RouterAppContext } from "@/routes/__root";
import { PlusIcon, type PlusIconHandle } from "@/components/ui/plus";
import { useSyncMutations } from "@/hooks/use-sync-mutations";
import { ACTIVE_SYNC_SESSION_STATUS_SET, SYNC_WIDGET_RECENT_LIMIT } from "@myakiba/constants/sync";
import { useSyncJobStatusQuery } from "@/hooks/use-sync-job-status-query";

const SYNC_OPTIONS: readonly {
  readonly type: SyncType;
  readonly icon: typeof LibraryIcon;
  readonly description: string;
}[] = [
  { type: "collection", icon: LibraryIcon, description: "Add items by MFC ID" },
  { type: "order", icon: PackageIcon, description: "Create an order with MFC items" },
  { type: "csv", icon: FileUploadIcon, description: "Import from MFC CSV export" },
];

type SyncWidgetProps = {
  readonly session: RouterAppContext["session"];
  readonly TriggerWrapper?: ComponentType<PropsWithChildren<Record<string, unknown>>>;
  readonly triggerWrapperProps?: Record<string, unknown>;
};

export default function SyncWidget({
  session,
  TriggerWrapper,
  triggerWrapperProps = {},
}: SyncWidgetProps) {
  const queryClient = useQueryClient();
  const [syncType, setSyncType] = useState<SyncType | null>(null);
  const addItemsIconRef = useRef<PlusIconHandle>(null);

  const userCurrency = session?.user.currency || "USD";

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

  const { handleSyncCsvSubmit, handleSyncOrderSubmit, handleSyncCollectionSubmit } =
    useSyncMutations(queryClient, () => {
      setSyncType(null);
    });

  return (
    <>
      {activeSessions.map((activeSession) =>
        activeSession.jobId ? (
          <SyncSessionObserver key={activeSession.id} jobId={activeSession.jobId} />
        ) : null,
      )}

      <Popover>
        <PopoverTrigger asChild>
          {TriggerWrapper ? (
            <TriggerWrapper
              aria-label="Sync Items"
              onMouseEnter={() => addItemsIconRef.current?.startAnimation()}
              onMouseLeave={() => addItemsIconRef.current?.stopAnimation()}
              {...triggerWrapperProps}
            >
              {hasActive ? (
                <HugeiconsIcon icon={Loading03Icon} className="size-3 animate-spin" />
              ) : (
                <PlusIcon ref={addItemsIconRef} size={17} />
              )}
              <span>Sync Items</span>
            </TriggerWrapper>
          ) : (
            <Button
              variant="primary"
              size="sm"
              autoHeight={true}
              aria-label="Add items"
              onMouseEnter={() => addItemsIconRef.current?.startAnimation()}
              onMouseLeave={() => addItemsIconRef.current?.stopAnimation()}
            >
              {hasActive ? (
                <HugeiconsIcon icon={Loading03Icon} className="size-3 animate-spin" />
              ) : (
                <PlusIcon ref={addItemsIconRef} size={17} />
              )}
              Add items
            </Button>
          )}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 p-0">
          <div className="max-h-[400px] overflow-y-auto">
            <div className="space-y-4 p-4">
              <div className="space-y-1.5">
                {SYNC_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  const config = SYNC_TYPE_CONFIG[option.type];
                  return (
                    <button
                      key={option.type}
                      type="button"
                      onClick={() => setSyncType(option.type)}
                      className="flex w-full items-center gap-3 rounded-lg cursor-pointer border p-3 text-left transition-colors hover:bg-accent"
                    >
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
                        <HugeiconsIcon icon={Icon} className="size-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{config.label}</p>
                        <p className="text-xs text-muted-foreground">{option.description}</p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {isRecentPending && (
                <div className="flex items-center justify-center py-4">
                  <HugeiconsIcon
                    icon={Loading03Icon}
                    className="size-3 animate-spin text-muted-foreground"
                  />
                </div>
              )}

              {isRecentError && <p className="text-xs text-destructive">{recentError.message}</p>}

              {!isRecentPending && !isRecentError && (
                <>
                  {hasActive && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Active Sessions</p>
                      <div className="space-y-1.5">
                        {activeSessions.map((s) => (
                          <ActiveSessionItem key={s.id} session={s} />
                        ))}
                      </div>
                    </div>
                  )}

                  {finishedSessions.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Recent Sessions</p>
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
                      View all sessions
                      <HugeiconsIcon icon={ArrowRight01Icon} className="size-3" />
                    </Button>
                  </Link>
                </PopoverClose>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <Sheet
        open={syncType !== null}
        onOpenChange={(open) => {
          if (!open) setSyncType(null);
        }}
      >
        <SheetContent side="right" className="sm:max-w-xl overflow-y-auto">
          {syncType && (
            <>
              <SheetHeader>
                <SheetTitle>{SYNC_OPTION_META[syncType].title}</SheetTitle>
                <SheetDescription>{SYNC_OPTION_META[syncType].description}</SheetDescription>
              </SheetHeader>
              <div className="px-4 pb-4">
                {syncType === "csv" && <SyncCsvForm handleSyncCsvSubmit={handleSyncCsvSubmit} />}
                {syncType === "order" && (
                  <SyncOrderForm
                    handleSyncOrderSubmit={handleSyncOrderSubmit}
                    currency={userCurrency}
                  />
                )}
                {syncType === "collection" && (
                  <SyncCollectionForm
                    handleSyncCollectionSubmit={handleSyncCollectionSubmit}
                    currency={userCurrency}
                  />
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
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
