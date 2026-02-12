import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DataGrid, DataGridContainer } from "@/components/ui/data-grid";
import { DataGridPagination } from "@/components/ui/data-grid-pagination";
import { DataGridTable } from "@/components/ui/data-grid-table";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { getCoreRowModel, type PaginationState, useReactTable } from "@tanstack/react-table";
import { Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import type { EnrichedSyncSessionItemRow, SyncSessionStatus } from "@myakiba/types";
import { SYNC_SESSION_SUBGRID_PAGE_SIZE } from "@myakiba/constants/sync";
import { fetchSyncSessionDetail, retrySyncFailedItems } from "@/queries/sync";
import { createSyncSessionItemSubColumns } from "./sync-session-item-sub-columns";

interface SyncSessionItemSubDataGridProps {
  readonly sessionId: string;
  readonly sessionStatus: SyncSessionStatus;
  readonly failCount: number;
}

export function SyncSessionItemSubDataGrid({
  sessionId,
  sessionStatus,
  failCount,
}: SyncSessionItemSubDataGridProps) {
  const queryClient = useQueryClient();
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: SYNC_SESSION_SUBGRID_PAGE_SIZE,
  });

  const page = pagination.pageIndex + 1;

  const {
    data: detailData,
    isPending: isDetailPending,
    isError: isDetailError,
    error: detailError,
  } = useQuery({
    queryKey: ["syncSessionDetail", sessionId, page, SYNC_SESSION_SUBGRID_PAGE_SIZE] as const,
    queryFn: () =>
      fetchSyncSessionDetail(sessionId, { page, limit: SYNC_SESSION_SUBGRID_PAGE_SIZE }),
    staleTime: 30_000,
  });

  const retryAllMutation = useMutation({
    mutationFn: () => retrySyncFailedItems(sessionId),
    onSuccess: (data) => {
      toast.success(`Retrying ${data.itemCount} failed items...`);
      void queryClient.invalidateQueries({ queryKey: ["syncSessions"] });
      void queryClient.invalidateQueries({
        queryKey: ["syncSessionDetail", sessionId],
      });
    },
    onError: (error: Error) => {
      toast.error("Failed to retry.", { description: error.message });
    },
  });

  const responseData = detailData;
  const items = responseData?.session?.items ?? [];
  const totalItems = responseData?.totalItems ?? 0;

  const isRetryable = (sessionStatus === "failed" || sessionStatus === "partial") && failCount > 0;

  const columns = useMemo(() => createSyncSessionItemSubColumns(), []);

  const subTable = useReactTable({
    columns,
    data: items,
    pageCount: Math.max(1, Math.ceil(totalItems / SYNC_SESSION_SUBGRID_PAGE_SIZE)),
    state: { pagination },
    onPaginationChange: setPagination,
    manualPagination: true,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row: EnrichedSyncSessionItemRow) => row.id,
  });

  if (isDetailError) {
    return (
      <div className="bg-muted/30 p-4">
        <p className="py-3 text-center text-sm text-destructive">
          Failed to load session items: {detailError.message}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-muted/30 p-4" onClick={(e) => e.stopPropagation()}>
      {isRetryable && (
        <div className="mb-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => retryAllMutation.mutate()}
            disabled={retryAllMutation.isPending}
          >
            {retryAllMutation.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RotateCcw className="size-3.5" />
            )}
            Retry all failed ({failCount})
          </Button>
        </div>
      )}
      <DataGrid
        table={subTable}
        recordCount={totalItems}
        isLoading={isDetailPending}
        loadingMode="skeleton"
        skeletonRowCount={1}
        tableLayout={{
          rowBorder: true,
          headerBackground: true,
          headerBorder: true,
        }}
      >
        <div className="w-full space-y-2.5 overflow-x-auto">
          <div className="bg-card rounded-lg">
            <DataGridContainer>
              <ScrollArea>
                <DataGridTable />
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            </DataGridContainer>
          </div>
          <div className="flex items-center justify-end">
            <DataGridPagination className="pb-1.5" />
          </div>
        </div>
      </DataGrid>
    </div>
  );
}
