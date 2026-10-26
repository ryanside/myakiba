import { useMemo, useState } from "react";
import { DataGrid, DataGridContainer } from "@/components/reui/data-grid/data-grid";
import { DataGridPagination } from "@/components/reui/data-grid/data-grid-pagination";
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import type { PaginationState } from "@tanstack/react-table";
import type { EnrichedSyncSessionItemRow } from "@myakiba/contracts/sync/types";
import { SYNC_SESSION_SUBGRID_PAGE_SIZE } from "@myakiba/contracts/sync/constants";
import { failureText, useRead } from "@/data/client";
import { sync } from "@/data/resources/sync";
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
  } = useRead(sync.sessionItems, { sessionId, page });

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
          Failed to load session items: {failureText(detailError)}
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
              <ScrollArea horizontal>
                <DataGridTable />
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
