import { useCallback, useMemo, useState } from "react";
import { DataGrid, DataGridContainer } from "@/components/ui/data-grid";
import { DataGridPagination } from "@/components/ui/data-grid-pagination";
import { DataGridTable } from "@/components/ui/data-grid-table";
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
import type {
  CascadeOptions,
  EditedOrder,
  OrderFilters,
  NewOrder,
  Order,
} from "@/lib/orders/types";
import { useSelection } from "@/hooks/use-selection";
import type { CollectionItemFormValues } from "@/lib/collection/types";
import { DataGridColumnCombobox } from "../ui/data-grid-column-combobox";
import { OrdersToolbar } from "./orders-toolbar";
import { DEFAULT_PAGE_INDEX, DEFAULT_PAGE_SIZE } from "@myakiba/constants";
import { createOrdersColumns } from "./orders-columns";
import type { DateFormat } from "@myakiba/types";

export { DEFAULT_PAGE_INDEX, DEFAULT_PAGE_SIZE };

interface OrdersDataGridProps {
  orders: Order[];
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
  filters: OrderFilters;
  onFilterChange: (filters: OrderFilters) => void;
  onSearchChange: (search: string) => void;
  onResetFilters: () => void;
  onMerge: (
    values: NewOrder,
    cascadeOptions: CascadeOptions,
    orderIds: Set<string>,
  ) => Promise<void>;
  onSplit: (
    values: NewOrder,
    cascadeOptions: CascadeOptions,
    collectionIds: Set<string>,
    orderIds: Set<string>,
  ) => Promise<void>;
  onEditOrder: (values: EditedOrder, cascadeOptions: CascadeOptions) => Promise<void>;
  onDeleteOrders: (orderIds: Set<string>) => Promise<void>;
  onEditItem: (values: CollectionItemFormValues) => Promise<void>;
  onDeleteItem: (orderId: string, itemId: string) => Promise<void>;
  onDeleteItems: (collectionIds: Set<string>, orderIds: Set<string>) => Promise<void>;
  onMoveItem: (
    targetOrderId: string,
    collectionIds: Set<string>,
    orderIds: Set<string>,
  ) => Promise<void>;
  currency?: string;
  dateFormat: DateFormat;
}

export default function OrdersDataGrid({
  orders,
  totalCount,
  pagination: serverPagination,
  sorting: serverSorting,
  search,
  filters,
  onFilterChange,
  onSearchChange,
  onResetFilters,
  onMerge,
  onSplit,
  onEditOrder,
  onDeleteOrders,
  onEditItem,
  onDeleteItem,
  onDeleteItems,
  onMoveItem,
  currency = "USD",
  dateFormat,
}: OrdersDataGridProps) {
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
        onEditOrder,
        onDeleteOrders,
        onEditItem,
        onDeleteItem,
        currency,
        itemSelection,
        setItemSelection,
        dateFormat,
      }),
    [
      onEditItem,
      onDeleteItem,
      onEditOrder,
      onDeleteOrders,
      currency,
      itemSelection,
      setItemSelection,
      dateFormat,
    ],
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
            | "title"
            | "shop"
            | "orderDate"
            | "paymentDate"
            | "shippingDate"
            | "collectionDate"
            | "releaseDate"
            | "shippingMethod"
            | "total"
            | "shippingFee"
            | "taxes"
            | "duties"
            | "tariffs"
            | "miscFees"
            | "itemCount"
            | "status"
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
    data: orders,
    pageCount: Math.ceil(totalCount / serverPagination.limit),
    getRowId: (row: Order) => row.orderId,
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
      <div className="flex items-center justify-start gap-2">
        <OrdersToolbar
          search={search}
          filters={filters}
          onSearchChange={onSearchChange}
          onFilterChange={onFilterChange}
          onResetFilters={onResetFilters}
          currency={currency}
          selectedOrderIds={getSelectedOrderIds}
          selectedItemData={getSelectedItemData}
          clearSelections={clearSelections}
          onMerge={onMerge}
          onSplit={onSplit}
          onDeleteOrders={onDeleteOrders}
          onMoveItem={onMoveItem}
          onDeleteItems={onDeleteItems}
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
}
