import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { DataGrid, DataGridContainer } from "@/components/ui/data-grid";
import { DataGridPagination } from "@/components/ui/data-grid-pagination";
import { DataGridTable } from "@/components/ui/data-grid-table";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  type ExpandedState,
  getCoreRowModel,
  type PaginationState,
  useReactTable,
  type Updater,
} from "@tanstack/react-table";
import type { SyncSessionRow, SyncSessionStatus } from "@myakiba/types";
import { createSyncSessionColumns } from "./sync-sessions-columns";
import { SyncSessionItemSubDataGrid } from "./sync-session-item-sub-data-grid";

interface SyncSessionsDataGridProps {
  readonly sessions: SyncSessionRow[];
  readonly totalCount: number;
  readonly pagination: {
    readonly page: number;
    readonly limit: number;
  };
  readonly onPaginationChange: (page: number, limit: number) => void;
  readonly isLoading?: boolean;
}

export function SyncSessionsDataGrid({
  sessions,
  totalCount,
  pagination: serverPagination,
  onPaginationChange,
  isLoading,
}: SyncSessionsDataGridProps) {
  const navigate = useNavigate();
  const tablePagination = useMemo<PaginationState>(
    () => ({
      pageIndex: serverPagination.page - 1,
      pageSize: serverPagination.limit,
    }),
    [serverPagination.page, serverPagination.limit],
  );

  const [expandedRows, setExpandedRows] = useState<ExpandedState>({});

  const columns = useMemo(
    () =>
      createSyncSessionColumns({
        expandedContent: (session: SyncSessionRow) => (
          <SyncSessionItemSubDataGrid
            sessionId={session.id}
            sessionStatus={session.status as SyncSessionStatus}
            failCount={session.failCount}
          />
        ),
      }),
    [],
  );

  const handlePaginationChange = useCallback(
    (updater: Updater<PaginationState>) => {
      const newPagination = typeof updater === "function" ? updater(tablePagination) : updater;
      onPaginationChange(newPagination.pageIndex + 1, newPagination.pageSize);
    },
    [tablePagination, onPaginationChange],
  );

  const table = useReactTable({
    columns,
    data: sessions,
    pageCount: Math.max(1, Math.ceil(totalCount / serverPagination.limit)),
    getRowId: (row: SyncSessionRow) => row.id,
    getRowCanExpand: () => true,
    state: {
      pagination: tablePagination,
      expanded: expandedRows,
    },
    onPaginationChange: handlePaginationChange,
    onExpandedChange: setExpandedRows,
    manualPagination: true,
    getCoreRowModel: getCoreRowModel(),
  });

  const handleRowClick = useCallback(
    (row: SyncSessionRow) => {
      navigate({ to: "/sync/$id", params: { id: row.id } });
    },
    [navigate],
  );

  return (
    <div className="space-y-4">
      <DataGrid
        table={table}
        recordCount={totalCount}
        isLoading={isLoading}
        loadingMode="skeleton"
        onRowClick={handleRowClick}
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
