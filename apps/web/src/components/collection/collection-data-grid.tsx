import { useSelection } from "@/hooks/use-selection";
import type { CollectionItem } from "@myakiba/types/collection";
import type {
  Updater,
  ExpandedState,
  PaginationState,
  SortingState,
  VisibilityState,
} from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { DataGridPagination } from "@/components/reui/data-grid/data-grid-pagination";
import { DataGrid, DataGridContainer } from "@/components/reui/data-grid/data-grid";
import { ScrollArea, ScrollBar } from "../ui/scroll-area";
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table";
import { DataGridColumnCombobox } from "../ui/data-grid-column-combobox";
import { CollectionToolbar } from "./collection-toolbar";
import { createCollectionColumns } from "./collection-columns";
import { SyncSheetButton } from "@/components/sync/sync-sheet-button";
import {
  useCollectionFilters,
  useCollectionQuery,
  useCollectionMutations,
  useUserPreferences,
} from "@/hooks/use-collection";

export const CollectionDataGrid = () => {
  const { filters, setFilters } = useCollectionFilters();
  const { items, totalCount, isPending } = useCollectionQuery();
  const {
    handleEditCollectionItem,
    handleDeleteCollectionItems,
    isCollectionPending,
    isDeletingCollectionItems,
  } = useCollectionMutations();
  const { currency, dateFormat } = useUserPreferences();

  const limit = filters.limit ?? 10;
  const offset = filters.offset ?? 0;

  const pagination = useMemo<PaginationState>(
    () => ({
      pageIndex: Math.floor(offset / limit),
      pageSize: limit,
    }),
    [offset, limit],
  );

  const sorting = useMemo<SortingState>(
    () => [
      {
        id: filters.sort ?? "createdAt",
        desc: (filters.order ?? "desc") === "desc",
      },
    ],
    [filters.sort, filters.order],
  );

  const {
    rowSelection: collectionSelection,
    setRowSelection: setCollectionSelection,
    getSelectedOrderIds: getSelectedCollectionIds,
    clearSelections,
  } = useSelection();

  const [expandedRows, setExpandedRows] = useState<ExpandedState>({});
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    orderDate: false,
    paymentDate: false,
    shippingDate: false,
  });
  const [columnOrder, setColumnOrder] = useState<string[]>([
    "select",
    "itemTitle",
    "itemScale",
    "count",
    "score",
    "price",
    "shop",
    "orderDate",
    "paymentDate",
    "shippingDate",
    "collectionDate",
    "actions",
  ]);

  const columns = useMemo(
    () =>
      createCollectionColumns({
        onEditCollectionItem: handleEditCollectionItem,
        onDeleteCollectionItems: handleDeleteCollectionItems,
        currency,
        dateFormat,
        isCollectionPending,
      }),
    [
      currency,
      dateFormat,
      handleEditCollectionItem,
      handleDeleteCollectionItems,
      isCollectionPending,
    ],
  );

  const handlePaginationChange = useCallback(
    (updater: Updater<PaginationState>) => {
      const newPagination = typeof updater === "function" ? updater(pagination) : updater;

      const newOffset = newPagination.pageIndex * newPagination.pageSize;
      setFilters({
        limit: newPagination.pageSize,
        offset: newOffset,
      });
    },
    [pagination, setFilters],
  );

  const handleSortingChange = useCallback(
    (updater: Updater<SortingState>) => {
      const newSorting = typeof updater === "function" ? updater(sorting) : updater;

      if (newSorting.length > 0) {
        const sortConfig = newSorting[0];
        setFilters({
          sort: sortConfig.id as
            | "itemTitle"
            | "itemScale"
            | "count"
            | "score"
            | "price"
            | "shop"
            | "orderDate"
            | "paymentDate"
            | "shippingDate"
            | "collectionDate"
            | "createdAt",
          order: sortConfig.desc ? "desc" : "asc",
          offset: 0,
        });
      }
    },
    [sorting, setFilters],
  );

  const table = useReactTable({
    columns,
    data: items,
    pageCount: Math.ceil(totalCount / limit),
    getRowId: (row: CollectionItem) => row.id,
    getRowCanExpand: () => true,
    state: {
      pagination,
      sorting,
      expanded: expandedRows,
      rowSelection: collectionSelection,
      columnOrder,
      columnVisibility,
    },
    columnResizeMode: "onChange",
    onPaginationChange: handlePaginationChange,
    onSortingChange: handleSortingChange,
    onExpandedChange: setExpandedRows,
    onRowSelectionChange: setCollectionSelection,
    onColumnOrderChange: setColumnOrder,
    onColumnVisibilityChange: setColumnVisibility,
    manualFiltering: true,
    manualSorting: true,
    manualPagination: true,
    getCoreRowModel: getCoreRowModel(),
    enableRowSelection: true,
  });

  return (
    <>
      <div className="flex w-full flex-wrap items-center gap-2">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <CollectionToolbar
            selectedCollectionIds={getSelectedCollectionIds}
            clearSelections={clearSelections}
            onDeleteCollectionItems={handleDeleteCollectionItems}
            isDeletingCollectionItems={isDeletingCollectionItems}
          />
          <DataGridColumnCombobox table={table} />
        </div>
        <SyncSheetButton syncType="collection" label="Add" className="ml-auto" />
      </div>
      <div className="space-y-4">
        <DataGrid
          table={table}
          isLoading={isPending}
          recordCount={totalCount}
          tableLayout={{
            dense: true,
            columnsPinnable: true,
            columnsResizable: true,
            columnsMovable: true,
            columnsVisibility: true,
          }}
        >
          <div className="w-full space-y-2.5">
            <DataGridContainer>
              <ScrollArea>
                <DataGridTable />
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            </DataGridContainer>
            <div className="flex items-center justify-between">
              <div className="flex-1 text-sm text-muted-foreground">
                {table.getFilteredSelectedRowModel().rows.length} of{" "}
                {table.getFilteredRowModel().rows.length} row(s) selected
              </div>
              <DataGridPagination />
            </div>
          </div>
        </DataGrid>
      </div>
    </>
  );
};
