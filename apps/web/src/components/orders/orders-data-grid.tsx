import { useCallback, useMemo, useState } from "react";
import { DataGrid, DataGridContainer } from "@/components/reui/data-grid/data-grid";
import { DataGridPagination } from "@/components/reui/data-grid/data-grid-pagination";
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  type ExpandedState,
  getCoreRowModel,
  type PaginationState,
  type SortingState,
  type VisibilityState,
  useReactTable,
  type Updater,
} from "@tanstack/react-table";
import type { OrderFilters, OrderListItem } from "@myakiba/types/orders";
import { useSelection } from "@/hooks/use-selection";
import { DataGridColumnCombobox } from "../ui/data-grid-column-combobox";
import { OrdersToolbar } from "./orders-toolbar";
import { DEFAULT_PAGE_INDEX, DEFAULT_PAGE_SIZE } from "@myakiba/constants/pagination";
import { createOrdersColumns } from "./orders-columns";
import { SyncSheetButton } from "@/components/sync/sync-sheet-button";
import { useOrdersFilters, useOrdersQuery, useOrdersMutations } from "@/hooks/use-orders";
import { useUserPreferences } from "@/hooks/use-collection";

export { DEFAULT_PAGE_INDEX, DEFAULT_PAGE_SIZE };

export default function OrdersDataGrid() {
  const { filters, setFilters } = useOrdersFilters();
  const { orders, totalCount, isPending } = useOrdersQuery();
  const {
    handleEditOrder,
    handleDeleteOrders,
    handleMerge,
    handleSplit,
    handleEditItem,
    handleDeleteItem,
    handleDeleteItems,
    handleMoveItem,
    isOrderPending,
    isCollectionItemPending,
    isMerging,
    isSplitting,
    isDeletingOrders,
    isDeletingItems,
    isMovingItems,
  } = useOrdersMutations();
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
    rowSelection,
    setRowSelection,
    itemSelection,
    setItemSelection,
    getSelectedOrderIds,
    getSelectedItemData,
    clearSelections,
  } = useSelection();

  const [expandedRows, setExpandedRows] = useState<ExpandedState>({});
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    orderDate: false,
    paymentDate: false,
    shippingDate: false,
    collectionDate: false,
    shippingFee: false,
    taxes: false,
    duties: false,
    tariffs: false,
    miscFees: false,
  });
  const [columnOrder, setColumnOrder] = useState<string[]>([
    "select",
    "expand",
    "title",
    "shop",
    "shippingMethod",
    "releaseDate",
    "orderDate",
    "paymentDate",
    "shippingDate",
    "collectionDate",
    "itemCount",
    "total",
    "shippingFee",
    "taxes",
    "duties",
    "tariffs",
    "miscFees",
    "status",
    "actions",
  ]);

  const columns = useMemo(
    () =>
      createOrdersColumns({
        onEditOrder: handleEditOrder,
        onDeleteOrders: handleDeleteOrders,
        onEditItem: handleEditItem,
        onDeleteItem: handleDeleteItem,
        currency,
        itemSelection,
        setItemSelection,
        dateFormat,
        isOrderPending,
        isCollectionItemPending,
      }),
    [
      handleEditItem,
      handleDeleteItem,
      handleEditOrder,
      handleDeleteOrders,
      currency,
      itemSelection,
      setItemSelection,
      dateFormat,
      isCollectionItemPending,
      isOrderPending,
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
          sort: sortConfig.id as OrderFilters["sort"],
          order: sortConfig.desc ? "desc" : "asc",
          offset: 0,
        });
      }
    },
    [sorting, setFilters],
  );

  const table = useReactTable({
    columns,
    data: orders,
    pageCount: Math.ceil(totalCount / limit),
    getRowId: (row: OrderListItem) => row.orderId,
    getRowCanExpand: () => true,
    state: {
      pagination,
      sorting,
      expanded: expandedRows,
      rowSelection,
      columnOrder,
      columnVisibility,
    },
    columnResizeMode: "onChange",
    onPaginationChange: handlePaginationChange,
    onSortingChange: handleSortingChange,
    onExpandedChange: setExpandedRows,
    onRowSelectionChange: setRowSelection,
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
          <OrdersToolbar
            selectedOrderIds={getSelectedOrderIds}
            selectedItemData={getSelectedItemData}
            clearSelections={clearSelections}
            onMerge={handleMerge}
            onSplit={handleSplit}
            onDeleteOrders={handleDeleteOrders}
            onMoveItem={handleMoveItem}
            onDeleteItems={handleDeleteItems}
            isMerging={isMerging}
            isSplitting={isSplitting}
            isDeletingOrders={isDeletingOrders}
            isDeletingItems={isDeletingItems}
            isMovingItems={isMovingItems}
          />
          <DataGridColumnCombobox table={table} />
        </div>
        <SyncSheetButton syncType="order" label="Add" className="ml-auto" />
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
}
