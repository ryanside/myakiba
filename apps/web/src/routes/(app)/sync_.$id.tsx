import { useMemo, useState } from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import type { PaginationState } from "@tanstack/react-table";
import { DataGrid, DataGridContainer } from "@/components/reui/data-grid/data-grid";
import { DataGridPagination } from "@/components/reui/data-grid/data-grid-pagination";
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { ThemedBadge } from "@/components/reui/badge";
import { BackLink } from "@/components/ui/back-link";
import { PulsingDot } from "@/components/ui/pulsing-dot";
import { Progress } from "@/components/ui/progress";
import type { EnrichedSyncSessionItemRow, SyncSessionRow } from "@myakiba/contracts/sync/types";
import type { SyncSessionStatus, SyncType } from "@myakiba/contracts/shared/types";
import { fetchSyncSessionDetail } from "@/queries/sync";
import { createSyncSessionItemSubColumns } from "@/components/sync/sync-session-item-sub-columns";
import { resolveSyncMessage, SESSION_STATUS_CONFIG, SYNC_TYPE_CONFIG } from "@/lib/sync";
import { formatShortDateTime, formatSyncDuration } from "@/lib/date-display";
import Loader from "@/components/loader";
import { cn } from "@/lib/utils";
import {
  ACTIVE_SYNC_SESSION_STATUS_SET,
  SYNC_SESSION_DETAIL_PAGE_SIZE,
} from "@myakiba/contracts/sync/constants";
import { useSyncJobStatusQuery } from "@/hooks/use-sync-job-status-query";

export const Route = createFileRoute("/(app)/sync_/$id")({
  component: RouteComponent,
  head: ({ params }) => ({
    meta: [
      { name: "description", content: `Sync session ${params.id}` },
      { title: "Sync Session - myakiba" },
    ],
  }),
});

function SessionStatusPanel({
  session,
  isActive,
}: {
  readonly session: Pick<
    SyncSessionRow,
    "id" | "jobId" | "statusMessage" | "totalItems" | "successCount" | "failCount"
  >;
  readonly isActive: boolean;
}) {
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
          <PulsingDot />
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

function RouteComponent() {
  const { id } = useParams({ from: "/(app)/sync_/$id" });

  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: SYNC_SESSION_DETAIL_PAGE_SIZE,
  });
  const page = pagination.pageIndex + 1;

  const {
    data: responseData,
    isPending,
    isFetching,
    isError,
    error,
  } = useQuery({
    queryKey: ["syncSessionDetail", id, page, SYNC_SESSION_DETAIL_PAGE_SIZE] as const,
    queryFn: () => fetchSyncSessionDetail(id, { page, limit: SYNC_SESSION_DETAIL_PAGE_SIZE }),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });

  const session = responseData?.session;
  const items = session?.items ?? [];
  const totalItems = responseData?.totalItems ?? 0;

  const sessionStatus = (session?.status ?? "pending") as SyncSessionStatus;
  const sessionSyncType = (session?.syncType ?? "csv") as SyncType;
  const isActive = session ? ACTIVE_SYNC_SESSION_STATUS_SET.has(sessionStatus) : false;

  const columns = useMemo(() => createSyncSessionItemSubColumns(), []);

  const table = useReactTable({
    columns,
    data: items,
    pageCount: Math.max(1, Math.ceil(totalItems / SYNC_SESSION_DETAIL_PAGE_SIZE)),
    state: { pagination },
    onPaginationChange: setPagination,
    manualPagination: true,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row: EnrichedSyncSessionItemRow) => row.id,
  });

  if (isPending) return <Loader />;

  if (isError) {
    return (
      <div className="flex flex-col gap-4 mx-auto max-w-[88rem]">
        <div>
          <BackLink to="/sync" text="Back" font="sans" className="self-start" />

          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-col gap-1.5">
              <h1 className="text-2xl font-medium tracking-tight">Sync Session</h1>
              <p className="text-sm font-normal text-destructive">Error: {error.message}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex flex-col gap-4 mx-auto max-w-[88rem]">
        <div>
          <BackLink to="/sync" text="Back" font="sans" className="self-start" />

          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-col gap-1.5">
              <h1 className="text-2xl font-medium tracking-tight">Sync Session</h1>
              <p className="text-muted-foreground text-sm font-normal">Session not found</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const statusConfig = SESSION_STATUS_CONFIG[sessionStatus];
  const typeConfig = SYNC_TYPE_CONFIG[sessionSyncType];

  return (
    <div className="flex flex-col gap-4 mx-auto max-w-[88rem]">
      <div>
        <BackLink to="/sync" text="Back" font="sans" className="self-start" />

        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-medium tracking-tight">{typeConfig.label} Sync</h1>
              <ThemedBadge variant={statusConfig.variant} size="sm">
                {statusConfig.label}
              </ThemedBadge>
            </div>
            <p className="text-muted-foreground text-sm font-normal">
              Started {formatShortDateTime(session.createdAt)}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground font-normal">Total Items</span>
          <span className="text-2xl font-normal tabular-nums tracking-tight">
            {session.totalItems}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground font-normal">Succeeded</span>
          <span className="text-2xl font-normal tabular-nums tracking-tight">
            {session.successCount}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground font-normal">Failed</span>
          <span
            className={cn(
              "text-2xl font-normal tabular-nums tracking-tight",
              session.failCount > 0 && "text-destructive",
            )}
          >
            {session.failCount}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground font-normal">Duration</span>
          <span className="text-2xl font-normal tabular-nums tracking-tight">
            {formatSyncDuration(session.createdAt, session.completedAt)}
          </span>
        </div>
      </div>

      <SessionStatusPanel session={session} isActive={isActive} />

      <DataGrid
        table={table}
        recordCount={totalItems}
        isLoading={isFetching}
        loadingMode="skeleton"
        tableLayout={{
          rowBorder: true,
          headerBackground: true,
          headerBorder: true,
        }}
        skeletonRowCount={1}
      >
        <div className="w-full space-y-2.5">
          <DataGridContainer>
            <ScrollArea>
              <DataGridTable />
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </DataGridContainer>
          <div className="flex items-center justify-end">
            <DataGridPagination />
          </div>
        </div>
      </DataGrid>
    </div>
  );
}
