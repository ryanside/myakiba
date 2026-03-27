import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { DataGrid, DataGridContainer } from "@/components/reui/data-grid/data-grid";
import { DataGridPagination } from "@/components/reui/data-grid/data-grid-pagination";
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { getCoreRowModel, type PaginationState, useReactTable } from "@tanstack/react-table";
import type { EnrichedSyncSessionItemRow } from "@myakiba/contracts/sync/types";
import { SYNC_SESSION_SUBGRID_PAGE_SIZE } from "@myakiba/contracts/sync/constants";
import { fetchSyncSessionDetail } from "@/queries/sync";
import { createSyncSessionItemSubColumns } from "./sync-session-item-sub-columns";

interface SyncSessionItemSubDataGridProps {
  readonly sessionId: string;
}

export function SyncSessionItemSubDataGrid({ sessionId }: SyncSessionItemSubDataGridProps) {
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
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const responseData = detailData;
  const items = responseData?.session?.items ?? [];
  const totalItems = responseData?.totalItems ?? 0;

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
    <div
      role="presentation"
      className="bg-muted/30 p-4"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <DataGrid
        table={subTable}
        recordCount={totalItems}
        isLoading={isDetailPending}
        loadingMode="skeleton"
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
