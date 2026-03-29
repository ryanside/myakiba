import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DataGrid, DataGridContainer } from "@/components/reui/data-grid/data-grid";
import { DataGridPagination } from "@/components/reui/data-grid/data-grid-pagination";
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  type RowSelectionState,
  getCoreRowModel,
  type PaginationState,
  type SortingState,
  getSortedRowModel,
  useReactTable,
  type OnChangeFn,
} from "@tanstack/react-table";
import type { OrderItem } from "@myakiba/contracts/orders/types";
import type { CollectionItemFormValues } from "@myakiba/contracts/collection/types";
import { createOrderItemSubColumns } from "./order-item-sub-columns";
import { OrderItemSyncSheet } from "./order-item-sync-sheet";
import { orderItemsQueryOptions } from "@/hooks/use-orders";
import { useUserPreferences } from "@/hooks/use-user-preferences";

export const ORDER_ITEM_PAGE_SIZE = 12;

export function OrderItemSubDataGrid({
  orderId,
  itemSelection,
  setItemSelection,
  onEditItem,
  onDeleteItem,
  isCollectionItemPending,
}: {
  orderId: string;
  itemSelection: RowSelectionState;
  setItemSelection: OnChangeFn<RowSelectionState>;
  onEditItem: (values: CollectionItemFormValues) => Promise<void>;
  onDeleteItem: (orderId: string, itemId: string) => Promise<void>;
  isCollectionItemPending: (collectionId: string) => boolean;
}) {
  const { currency, locale, dateFormat } = useUserPreferences();

  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: ORDER_ITEM_PAGE_SIZE,
  });
  const [columnOrder, setColumnOrder] = useState<string[]>([
    "select",
    "title",
    "orderDate",
    "releaseDate",
    "count",
    "price",
    "status",
    "actions",
  ]);

  const offset = pagination.pageIndex * pagination.pageSize;

  const {
    data: itemsData,
    isPending,
    isError,
    error,
  } = useQuery(orderItemsQueryOptions(orderId, pagination.pageSize, offset));

  const items = itemsData?.items ?? [];
  const totalCount = itemsData?.totalCount ?? 0;

  const columns = useMemo(
    () =>
      createOrderItemSubColumns({
        orderId,
        onEditItem,
        onDeleteItem,
        currency,
        locale,
        dateFormat,
        isCollectionItemPending,
      }),
    [currency, locale, dateFormat, isCollectionItemPending, onDeleteItem, onEditItem, orderId],
  );

  const subTable = useReactTable({
    data: items as OrderItem[],
    columns,
    pageCount: Math.max(1, Math.ceil(totalCount / pagination.pageSize)),
    state: {
      sorting,
      pagination,
      rowSelection: itemSelection,
      columnOrder,
    },
    columnResizeMode: "onChange",
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    onRowSelectionChange: setItemSelection,
    onColumnOrderChange: setColumnOrder,
    manualPagination: true,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row: OrderItem) => `${orderId}-${row.id}`,
    enableRowSelection: true,
  });

  if (isError) {
    return (
      <div className="bg-muted/30 p-4">
        <p className="py-3 text-center text-sm text-destructive">
          Failed to load order items: {error.message}
        </p>
      </div>
    );
  }

  return (
    <div
      className="bg-muted/30 p-4"
      role="presentation"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <DataGrid
        table={subTable}
        recordCount={totalCount}
        isLoading={isPending}
        loadingMode="skeleton"
        tableLayout={{
          dense: true,
          rowBorder: true,
          headerBackground: true,
          headerBorder: true,
          columnsPinnable: true,
          columnsResizable: true,
          columnsMovable: true,
          columnsVisibility: true,
        }}
      >
        <div className="w-full space-y-2.5 overflow-x-auto">
          <div className="flex items-center justify-end">
            <OrderItemSyncSheet orderId={orderId} label="Add Item" />
          </div>
          <div className="bg-card rounded-lg">
            <DataGridContainer>
              <ScrollArea>
                <DataGridTable />
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            </DataGridContainer>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex-1 text-sm text-muted-foreground">
              {subTable.getFilteredSelectedRowModel().rows.length} of {totalCount} item(s) selected
            </div>
            <DataGridPagination className="pb-1.5" />
          </div>
        </div>
      </DataGrid>
    </div>
  );
}
