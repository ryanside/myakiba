import type { ReactNode } from "react";
import type { ColumnDef, Row } from "@tanstack/react-table";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import type { SyncSessionRow } from "@myakiba/types";
import { SESSION_STATUS_CONFIG, SYNC_TYPE_CONFIG } from "@/lib/sync";
import { formatDateTime, formatDuration } from "@myakiba/utils/dates";
import { fetchSyncSessionDetail } from "@/queries/sync";
import {
  ACTIVE_SYNC_SESSION_STATUS_SET,
  SYNC_SESSION_SUBGRID_PAGE_SIZE,
} from "@myakiba/constants/sync";
import { useSyncJobStatusQuery } from "@/hooks/use-sync-job-status-query";

interface SyncSessionColumnsParams {
  readonly expandedContent: (session: SyncSessionRow) => ReactNode;
}

function ExpandButton({ row }: { readonly row: Row<SyncSessionRow> }) {
  const queryClient = useQueryClient();

  const handlePointerEnter = () => {
    void queryClient.prefetchQuery({
      queryKey: ["syncSessionDetail", row.original.id, 1, SYNC_SESSION_SUBGRID_PAGE_SIZE] as const,
      queryFn: () =>
        fetchSyncSessionDetail(row.original.id, { page: 1, limit: SYNC_SESSION_SUBGRID_PAGE_SIZE }),
      staleTime: 30_000,
    });
  };

  return (
    <Button
      onClick={(e) => {
        e.stopPropagation();
        row.toggleExpanded();
      }}
      onPointerEnter={handlePointerEnter}
      mode="icon"
      size="sm"
      variant="ghost"
    >
      {row.getIsExpanded() ? (
        <ChevronDown className="size-4 text-muted-foreground" />
      ) : (
        <ChevronRight className="size-4 text-muted-foreground" />
      )}
    </Button>
  );
}

export function createSyncSessionColumns({
  expandedContent,
}: SyncSessionColumnsParams): ColumnDef<SyncSessionRow>[] {
  return [
    {
      id: "expand",
      header: () => null,
      cell: ({ row }) => <ExpandButton row={row} />,
      size: 40,
      enableSorting: false,
      enableHiding: false,
      enableResizing: false,
      meta: {
        expandedContent,
        skeleton: <Skeleton className="size-6 rounded" />,
      },
    },
    {
      accessorKey: "syncType",
      id: "syncType",
      header: () => <span className="text-foreground font-normal text-[0.8125rem]">Type</span>,
      cell: ({ row }) => {
        const config = SYNC_TYPE_CONFIG[row.original.syncType];
        return (
          <Badge variant="outline" appearance="ghost" size="sm">
            {config.label}
          </Badge>
        );
      },
      size: 110,
      enableSorting: false,
      enableHiding: false,
      enableResizing: false,
      meta: {
        skeleton: <Skeleton className="h-7 w-14 rounded-full" />,
      },
    },
    {
      accessorKey: "status",
      id: "status",
      header: () => <span className="text-foreground font-normal text-[0.8125rem]">Status</span>,
      cell: ({ row }) => {
        const status = row.original.status;
        const isActive = ACTIVE_SYNC_SESSION_STATUS_SET.has(status);
        if (isActive) {
          return <ActiveStatusCell session={row.original} />;
        }
        const config = SESSION_STATUS_CONFIG[status];
        return (
          <Badge variant={config.variant} appearance="light" size="sm">
            {config.label}
          </Badge>
        );
      },
      size: 200,
      enableSorting: false,
      enableHiding: false,
      enableResizing: false,
      meta: {
        skeleton: <Skeleton className="h-7 w-20 rounded-full" />,
      },
    },
    {
      accessorKey: "totalItems",
      id: "totalItems",
      header: () => (
        <span className="text-foreground font-normal text-[0.8125rem] block">Items</span>
      ),
      cell: ({ row }) => <span className="block tabular-nums">{row.original.totalItems}</span>,
      size: 80,
      enableSorting: false,
      enableHiding: false,
      enableResizing: false,
      meta: {
        skeleton: <Skeleton className="h-7 w-8" />,
      },
    },
    {
      accessorKey: "successCount",
      id: "successCount",
      header: () => (
        <span className="text-foreground font-normal text-[0.8125rem] block">Success</span>
      ),
      cell: ({ row }) => <span className="block tabular-nums">{row.original.successCount}</span>,
      size: 80,
      enableSorting: false,
      enableHiding: false,
      enableResizing: false,
      meta: {
        skeleton: <Skeleton className="h-7 w-8" />,
      },
    },
    {
      accessorKey: "failCount",
      id: "failCount",
      header: () => (
        <span className="text-foreground font-normal text-[0.8125rem] block">Failed</span>
      ),
      cell: ({ row }) => {
        const count = row.original.failCount;
        return (
          <span className="block tabular-nums">
            {count > 0 ? <span className="text-destructive">{count}</span> : count}
          </span>
        );
      },
      size: 80,
      enableSorting: false,
      enableHiding: false,
      enableResizing: false,
      meta: {
        skeleton: <Skeleton className="h-7 w-8" />,
      },
    },
    {
      accessorKey: "createdAt",
      id: "createdAt",
      header: () => <span className="text-foreground font-normal text-[0.8125rem]">Created</span>,
      cell: ({ row }) => (
        <span className="text-muted-foreground">{formatDateTime(row.original.createdAt)}</span>
      ),
      size: 150,
      enableSorting: false,
      enableHiding: false,
      enableResizing: false,
      meta: {
        skeleton: <Skeleton className="h-7 w-28" />,
      },
    },
    {
      id: "duration",
      header: () => <span className="text-foreground font-normal text-[0.8125rem]">Duration</span>,
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {formatDuration(row.original.createdAt, row.original.completedAt)}
        </span>
      ),
      size: 100,
      enableSorting: false,
      enableHiding: false,
      enableResizing: false,
      meta: {
        skeleton: <Skeleton className="h-7 w-16" />,
      },
    },
  ];
}

function ActiveStatusCell({ session }: { readonly session: SyncSessionRow }) {
  const status = session.status;
  const config = SESSION_STATUS_CONFIG[status];

  const { data: jobStatus, isError: isJobError } = useSyncJobStatusQuery(session.jobId);

  const isFinished = jobStatus?.finished === true;
  const displayStatus = isJobError ? "Stream error" : (jobStatus?.status ?? session.statusMessage);

  return (
    <div className="flex items-center gap-1.5">
      <Badge variant={config.variant} appearance="light" size="sm">
        {config.label}
      </Badge>
      {!isFinished && !isJobError && (
        <Loader2 className="size-3 shrink-0 animate-spin text-muted-foreground" />
      )}
      {displayStatus && (
        <span className="truncate text-xs text-muted-foreground">{displayStatus}</span>
      )}
    </div>
  );
}
