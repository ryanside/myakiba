import { useMemo, useState } from "react";
import { DataGrid, DataGridContainer } from "@/components/ui/data-grid";
import { DataGridPagination } from "@/components/ui/data-grid-pagination";
import { DataGridTable } from "@/components/ui/data-grid-table";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  type RowSelectionState,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type PaginationState,
  type SortingState,
  useReactTable,
  type OnChangeFn,
} from "@tanstack/react-table";
import type { OrderItem } from "@/lib/orders/types";
import type { CollectionItemFormValues } from "@/lib/collection/types";
import { createOrderItemSubColumns } from "./order-item-sub-columns";
import type { DateFormat } from "@myakiba/types";

export function OrderItemSubDataGrid({
  items,
  orderId,
  itemSelection,
  setItemSelection,
  onEditItem,
  onDeleteItem,
  currency = "USD",
  dateFormat = "MM/DD/YYYY",
}: {
  items: OrderItem[];
  orderId: string;
  itemSelection: RowSelectionState;
  setItemSelection: OnChangeFn<RowSelectionState>;
  onEditItem: (values: CollectionItemFormValues) => Promise<void>;
  onDeleteItem: (orderId: string, itemId: string) => Promise<void>;
  currency?: string;
  dateFormat?: DateFormat;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 5,
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

  const columns = useMemo(
    () =>
      createOrderItemSubColumns({
        orderId,
        onEditItem,
        onDeleteItem,
        currency,
        dateFormat,
      }),
    [currency, dateFormat, onDeleteItem, onEditItem, orderId]
  );

  const subTable = useReactTable({
    data: items,
    columns,
    pageCount: Math.ceil(items.length / pagination.pageSize),
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
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (row: OrderItem) => `${orderId}-${row.id}`,
    enableRowSelection: true,
  });

  return (
    <div className="bg-muted/30 p-4" onClick={(e) => e.stopPropagation()}>
      <DataGrid
        table={subTable}
        recordCount={items.length}
        tableLayout={{
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
              {subTable.getFilteredSelectedRowModel().rows.length} of{" "}
              {subTable.getFilteredRowModel().rows.length} item(s) selected
            </div>
            <DataGridPagination className="pb-1.5" />
          </div>
        </div>
      </DataGrid>
    </div>
  );
}
