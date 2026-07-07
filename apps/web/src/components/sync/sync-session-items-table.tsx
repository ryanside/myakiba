import type { ReactNode } from "react";
import { useMemo } from "react";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import type { OnChangeFn, PaginationState } from "@tanstack/react-table";
import type { EnrichedSyncSessionItemRow } from "@myakiba/contracts/sync/types";
import { SYNC_SESSION_DETAIL_PAGE_SIZE } from "@myakiba/contracts/sync/constants";
import { DataGrid, DataGridContainer } from "@/components/reui/data-grid/data-grid";
import { DataGridPagination } from "@/components/reui/data-grid/data-grid-pagination";
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { createSyncSessionItemSubColumns } from "@/components/sync/sync-session-item-sub-columns";

export function SyncSessionItemsTable({
  items,
  totalItems,
  isLoading,
  pagination,
  onPaginationChange,
}: {
  readonly items: readonly EnrichedSyncSessionItemRow[];
  readonly totalItems: number;
  readonly isLoading: boolean;
  readonly pagination: PaginationState;
  readonly onPaginationChange: OnChangeFn<PaginationState>;
}): ReactNode {
  const columns = useMemo(() => createSyncSessionItemSubColumns(), []);

  const tableData = useMemo(() => [...items], [items]);

  const table = useReactTable({
    columns,
    data: tableData,
    pageCount: Math.max(1, Math.ceil(totalItems / SYNC_SESSION_DETAIL_PAGE_SIZE)),
    state: { pagination },
    onPaginationChange,
    manualPagination: true,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row: EnrichedSyncSessionItemRow) => row.id,
  });

  return (
    <DataGrid
      table={table}
      recordCount={totalItems}
      isLoading={isLoading}
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
  );
}
