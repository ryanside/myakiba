import { useSelection } from "@/hooks/use-selection";
import type { CollectionFilters, CollectionItem, CollectionItemFormValues } from "@myakiba/types";
import type {
  Updater,
  ExpandedState,
  PaginationState,
  SortingState,
  VisibilityState,
} from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { DataGridPagination } from "../ui/data-grid-pagination";
import { DataGrid, DataGridContainer } from "../ui/data-grid";
import { ScrollArea, ScrollBar } from "../ui/scroll-area";
import { DataGridTable } from "../ui/data-grid-table";
import { DataGridColumnCombobox } from "../ui/data-grid-column-combobox";
import { CollectionToolbar } from "./collection-toolbar";
import { DEFAULT_PAGE_INDEX, DEFAULT_PAGE_SIZE } from "@myakiba/constants";
import { createCollectionColumns } from "./collection-columns";
import type { DateFormat } from "@myakiba/types";

export { DEFAULT_PAGE_INDEX, DEFAULT_PAGE_SIZE };

interface CollectionDataGridProps {
  collection: CollectionItem[];
  totalCount: number;
  pagination: {
    limit: number;
    offset: number;
  };
  sorting: {
    sort: string;
    order: string;
  };
  search: string;
  filters: CollectionFilters;
  onFilterChange: (filters: CollectionFilters) => void;
  onSearchChange: (search: string) => void;
  onResetFilters: () => void;
  onDeleteCollectionItems: (collectionIds: Set<string>) => Promise<void>;
  onEditCollectionItem: (values: CollectionItemFormValues) => void;
  currency?: string;
  dateFormat: DateFormat;
}

export const CollectionDataGrid = ({
  collection,
  totalCount,
  pagination: serverPagination,
  sorting: serverSorting,
  search,
  filters,
  onFilterChange,
  onSearchChange,
  onResetFilters,
  onDeleteCollectionItems,
  onEditCollectionItem,
  currency = "USD",
  dateFormat,
}: CollectionDataGridProps) => {
  const pagination = useMemo<PaginationState>(
    () => ({
      pageIndex: Math.floor(serverPagination.offset / serverPagination.limit),
      pageSize: serverPagination.limit,
    }),
    [serverPagination.offset, serverPagination.limit],
  );

  const sorting = useMemo<SortingState>(
    () => [
      {
        id: serverSorting.sort,
        desc: serverSorting.order === "desc",
      },
    ],
    [serverSorting.sort, serverSorting.order],
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
        onEditCollectionItem,
        onDeleteCollectionItems,
        currency,
        dateFormat,
      }),
    [currency, dateFormat, onEditCollectionItem, onDeleteCollectionItems],
  );
  const handlePaginationChange = useCallback(
    (updater: Updater<PaginationState>) => {
      const newPagination = typeof updater === "function" ? updater(pagination) : updater;

      const newOffset = newPagination.pageIndex * newPagination.pageSize;
      onFilterChange({
        limit: newPagination.pageSize,
        offset: newOffset,
      });
    },
    [pagination, onFilterChange],
  );

  const handleSortingChange = useCallback(
    (updater: Updater<SortingState>) => {
      const newSorting = typeof updater === "function" ? updater(sorting) : updater;

      if (newSorting.length > 0) {
        const sortConfig = newSorting[0];
        onFilterChange({
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
    [sorting, onFilterChange],
  );

  const table = useReactTable({
    columns,
    data: collection,
    pageCount: Math.ceil(totalCount / serverPagination.limit),
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
      <div className="flex items-center justify-start gap-2">
        <CollectionToolbar
          search={search}
          filters={filters}
          onSearchChange={onSearchChange}
          onFilterChange={onFilterChange}
          onResetFilters={onResetFilters}
          currency={currency}
          selectedCollectionIds={getSelectedCollectionIds}
          clearSelections={clearSelections}
          onDeleteCollectionItems={onDeleteCollectionItems}
        />
        <DataGridColumnCombobox table={table} />
      </div>
      <div className="space-y-4">
        <DataGrid
          table={table}
          recordCount={totalCount}
          tableLayout={{
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
