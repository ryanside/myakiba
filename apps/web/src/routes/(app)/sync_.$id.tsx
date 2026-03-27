import { HugeiconsIcon } from "@hugeicons/react";
import { Loading03Icon } from "@hugeicons/core-free-icons";
import { useMemo, useState } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getCoreRowModel, type PaginationState, useReactTable } from "@tanstack/react-table";
import { DataGrid, DataGridContainer } from "@/components/reui/data-grid/data-grid";
import { DataGridPagination } from "@/components/reui/data-grid/data-grid-pagination";
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { ThemedBadge } from "@/components/reui/badge";
import { buttonVariants } from "@/components/ui/button";
import type { EnrichedSyncSessionItemRow } from "@myakiba/contracts/sync/types";
import type { SyncSessionStatus, SyncType } from "@myakiba/contracts/shared/types";
import { fetchSyncSessionDetail } from "@/queries/sync";
import { createSyncSessionItemSubColumns } from "@/components/sync/sync-session-item-sub-columns";
import { SESSION_STATUS_CONFIG, SYNC_TYPE_CONFIG } from "@/lib/sync";
import { formatShortDateTime, formatSyncDuration } from "@/lib/date-display";
import Loader from "@/components/loader";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
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

function LiveStatusBanner({ jobId }: { readonly jobId: string }) {
  const { data: jobStatus, isError: isJobError } = useSyncJobStatusQuery(jobId);

  const isFinished = jobStatus?.finished === true;
  const displayStatus = isJobError ? "Stream error" : (jobStatus?.status ?? "Connecting...");

  if (isFinished) return null;

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-4 py-3">
      {!isJobError && (
        <HugeiconsIcon
          icon={Loading03Icon}
          className="size-4 shrink-0 animate-spin text-muted-foreground"
        />
      )}
      <p className="text-sm text-muted-foreground">{displayStatus}</p>
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
      <div className="w-full space-y-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl tracking-tight">Sync Session</h1>
        </div>
        <div className="flex flex-col items-center justify-center h-64 gap-y-4">
          <p className="text-lg font-medium text-destructive">Error: {error.message}</p>
          <Link
            to="/sync"
            className={cn(
              buttonVariants({ variant: "link" }),
              "mx-0 p-0 w-fit text-xs text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline",
            )}
          >
            Back to Sync
          </Link>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-y-4">
        <p className="text-lg font-medium text-muted-foreground">Session not found</p>
        <Link
          to="/sync"
          className={cn(
            buttonVariants({ variant: "link" }),
            "mx-0 p-0 w-fit text-xs text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline",
          )}
        >
          Back to Sync
        </Link>
      </div>
    );
  }

  const statusConfig = SESSION_STATUS_CONFIG[sessionStatus];
  const typeConfig = SYNC_TYPE_CONFIG[sessionSyncType];

  return (
    <div className="w-full space-y-8">
      <div>
        <Link
          to="/sync"
          className={cn(
            buttonVariants({ variant: "link" }),
            "mb-4 mx-0 p-0 w-fit text-xs text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline",
          )}
        >
          Back to Sync
        </Link>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl tracking-tight">{typeConfig.label} Sync</h1>
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

      {isActive && session.jobId && <LiveStatusBanner jobId={session.jobId} />}

      {!isActive && session.statusMessage && (
        <div className="rounded-lg flex items-center gap-2">
          <Separator orientation="vertical" className="h-4 inline-block" />
          <p className="text-sm">Status: {session.statusMessage}</p>
        </div>
      )}

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
