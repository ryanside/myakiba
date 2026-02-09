import { useMemo, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  experimental_streamedQuery as streamedQuery,
} from "@tanstack/react-query";
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
import { Loader2, ArrowRight, XCircle, Library, ShoppingCart, FileUp } from "lucide-react";
import { toast } from "sonner";
import { tryCatch } from "@myakiba/utils";
import type { SyncType, SyncSessionStatus } from "@myakiba/types";
import { sendItems, sendOrder, sendCollection, fetchSyncSessions } from "@/queries/sync";
import { app } from "@/lib/treaty-client";
import {
  transformCSVData,
  SESSION_STATUS_CONFIG,
  SYNC_TYPE_CONFIG,
  SYNC_OPTION_META,
} from "@/lib/sync";
import { formatRelativeTime } from "@myakiba/utils/dates";
import SyncCsvForm from "@/components/sync/sync-csv-form";
import SyncOrderForm from "@/components/sync/sync-order-form";
import SyncCollectionForm from "@/components/sync/sync-collection-form";
import type { RouterAppContext } from "@/routes/__root";
import type { SyncOrder, SyncCollectionItem, UserItem } from "@myakiba/types";
import { PlusIcon } from "@/components/ui/plus";

const ACTIVE_STATUSES: ReadonlySet<SyncSessionStatus> = new Set(["pending", "processing"]);

const SYNC_OPTIONS: readonly {
  readonly type: SyncType;
  readonly icon: typeof Library;
  readonly description: string;
}[] = [
  { type: "collection", icon: Library, description: "Add items by MFC ID" },
  { type: "order", icon: ShoppingCart, description: "Create an order with MFC items" },
  { type: "csv", icon: FileUp, description: "Import from MFC CSV export" },
];

type JobStatusEvent = {
  readonly status: string;
  readonly finished: boolean;
  readonly createdAt: string;
};

type SSEJobStatusChunk = {
  readonly data: JobStatusEvent;
};

export default function SyncWidget({ session }: { readonly session: RouterAppContext["session"] }) {
  const queryClient = useQueryClient();
  const [syncType, setSyncType] = useState<SyncType | null>(null);

  const userCurrency = session?.user.currency || "USD";

  const {
    data: recentData,
    isPending: isRecentPending,
    isError: isRecentError,
    error: recentError,
  } = useQuery({
    queryKey: ["syncSessions", 1, 5, undefined] as const,
    queryFn: () => fetchSyncSessions({ page: 1, limit: 5 }),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const sessions = recentData?.sessions ?? [];

  const { activeSessions, finishedSessions } = useMemo(() => {
    const active: typeof sessions = [];
    const finished: typeof sessions = [];
    for (const s of sessions) {
      if (ACTIVE_STATUSES.has(s.status as SyncSessionStatus)) {
        active.push(s);
      } else {
        finished.push(s);
      }
    }
    return { activeSessions: active, finishedSessions: finished };
  }, [sessions]);

  const hasActive = activeSessions.length > 0;

  function handleFormResult(data: {
    readonly syncSessionId: string;
    readonly jobId: string | null | undefined;
    readonly isFinished: boolean;
    readonly status: string;
  }): void {
    setSyncType(null);
    if (data.isFinished) {
      toast.success(data.status);
      void queryClient.invalidateQueries();
      return;
    }
    void queryClient.invalidateQueries({
      queryKey: ["syncSessions"],
    });
  }

  const csvMutation = useMutation({
    mutationFn: (userItems: UserItem[]) => sendItems(userItems),
    onSuccess: (data) =>
      handleFormResult({
        syncSessionId: data.syncSessionId,
        jobId: data.jobId,
        isFinished: data.isFinished,
        status: data.status,
      }),
    onError: (error: Error) => {
      toast.error("Failed to submit CSV.", {
        description: error.message,
      });
    },
  });

  const orderMutation = useMutation({
    mutationFn: (order: SyncOrder) => sendOrder(order),
    onSuccess: (data) =>
      handleFormResult({
        syncSessionId: data.syncSessionId,
        jobId: data.jobId,
        isFinished: data.isFinished,
        status: data.status,
      }),
    onError: (error: Error) => {
      toast.error("Failed to submit order.", {
        description: error.message,
      });
    },
  });

  const collectionMutation = useMutation({
    mutationFn: (items: SyncCollectionItem[]) => sendCollection(items),
    onSuccess: (data) =>
      handleFormResult({
        syncSessionId: data.syncSessionId,
        jobId: data.jobId,
        isFinished: data.isFinished,
        status: data.status,
      }),
    onError: (error: Error) => {
      toast.error("Failed to submit collection.", {
        description: error.message,
      });
    },
  });

  async function handleSyncCsvSubmit(value: File | undefined): Promise<void> {
    const { data: userItems, error } = await tryCatch(transformCSVData({ file: value }));
    if (error) {
      toast.error(error instanceof Error ? error.message : "An error occurred");
      return;
    }
    await csvMutation.mutateAsync(userItems);
  }

  async function handleSyncOrderSubmit(values: SyncOrder): Promise<void> {
    await orderMutation.mutateAsync(values);
  }

  async function handleSyncCollectionSubmit(values: SyncCollectionItem[]): Promise<void> {
    await collectionMutation.mutateAsync(values);
  }

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="primary" size="sm" autoHeight={true} aria-label="Add items">
            {hasActive ? <Loader2 className="size-3 animate-spin" /> : <PlusIcon size={17} />}
            Add items
          </Button>
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
                        <Icon className="size-4 text-muted-foreground" />
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
                  <Loader2 className="size-3 animate-spin text-muted-foreground" />
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
                      <ArrowRight className="size-3" />
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

type ActiveSessionProps = {
  readonly session: {
    readonly id: string;
    readonly syncType: string;
    readonly status: SyncSessionStatus;
    readonly jobId: string | null;
    readonly totalItems: number;
    readonly successCount: number;
    readonly statusMessage: string;
  };
};

function ActiveSessionItem({ session }: ActiveSessionProps) {
  const queryClient = useQueryClient();

  const onFinished = (): void => {
    void queryClient.invalidateQueries({
      queryKey: ["syncSessions"],
    });
  };

  const {
    data: jobStatus,
    isError: isJobError,
    error: jobError,
  } = useQuery({
    queryKey: ["syncJobStatus", session.jobId] as const,
    enabled: session.jobId !== null,
    queryFn: streamedQuery({
      streamFn: async ({ signal }) => {
        const { data, error } = await app.api.sync["job-status"].get({
          query: { jobId: session.jobId! },
          fetch: { signal },
        });

        if (error) throw new Error("Failed to connect to job status stream");
        if (!data) throw new Error("No data received from job status stream");

        const stream = data as unknown as AsyncIterable<SSEJobStatusChunk>;

        async function* withFinishedCheck(): AsyncGenerator<SSEJobStatusChunk> {
          for await (const chunk of stream) {
            yield chunk;
            if (chunk.data.finished) {
              onFinished();
            }
          }
        }

        return withFinishedCheck();
      },
      reducer: (_prev: JobStatusEvent, chunk: SSEJobStatusChunk) => chunk.data,
      initialValue: {
        status: "Connecting...",
        finished: false,
        createdAt: "",
      },
    }),
    refetchOnWindowFocus: false,
    retry: false,
  });

  const isFinished = jobStatus?.finished === true;
  const displayStatus = isJobError
    ? jobError.message
    : (jobStatus?.status ?? session.statusMessage);
  const typeConfig = SYNC_TYPE_CONFIG[session.syncType as SyncType];

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
            <Loader2 className="size-3 animate-spin text-muted-foreground" />
          )}
          {isJobError && <XCircle className="size-3 text-destructive" />}
        </div>
        {session.totalItems > 0 && (
          <div className="mt-2.5 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {session.successCount} of {session.totalItems} scraped
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
            className={`mt-1.5 truncate text-xs ${
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
    readonly syncType: string;
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
  const typeConfig = SYNC_TYPE_CONFIG[session.syncType as SyncType];
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
                {session.successCount}/{session.totalItems} scraped
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
