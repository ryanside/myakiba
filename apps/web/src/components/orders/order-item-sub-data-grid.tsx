import { useMemo, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, DragDropVerticalIcon } from "@hugeicons/core-free-icons";
import { useQuery } from "@tanstack/react-query";
import { DataGrid, DataGridContainer } from "@/components/reui/data-grid/data-grid";
import { DataGridPagination } from "@/components/reui/data-grid/data-grid-pagination";
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { DataGridColumnCombobox } from "@/components/ui/data-grid-column-combobox";
import {
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  functionalUpdate,
} from "@tanstack/react-table";
import type {
  ColumnPinningState,
  ColumnSizingState,
  PaginationState,
  RowSelectionState,
  SortingState,
  VisibilityState,
} from "@tanstack/react-table";
import type { OrderItem } from "@myakiba/contracts/orders/types";
import type { CollectionItemFormValues } from "@myakiba/contracts/collection/types";
import { createOrderItemSubColumns } from "./order-item-sub-columns";
import { OrderItemSyncSheet } from "./order-item-sync-sheet";
import { orderItemsQueryOptions } from "@/hooks/use-orders";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useUserPreferences } from "@/hooks/use-user-preferences";

const ORDER_ITEM_PAGE_SIZE = 12;
const DEFAULT_COLUMN_ORDER = [
  "select",
  "title",
  "orderDate",
  "releaseDate",
  "count",
  "price",
  "status",
  "actions",
];

export function OrderItemSubDataGrid({
  orderId,
  selectedOrderIdByCollectionId,
  setSelectedOrderIdByCollectionId,
  onEditItem,
  onDeleteItem,
  isCollectionItemPending,
  heading,
  wrapped = true,
  isLoading = false,
}: {
  orderId: string;
  selectedOrderIdByCollectionId: ReadonlyMap<string, string>;
  setSelectedOrderIdByCollectionId: Dispatch<SetStateAction<Map<string, string>>>;
  onEditItem: (values: CollectionItemFormValues) => Promise<void>;
  onDeleteItem: (orderId: string, itemId: string) => Promise<void>;
  isCollectionItemPending: (collectionId: string) => boolean;
  heading?: ReactNode;
  wrapped?: boolean;
  isLoading?: boolean;
}) {
  const { currency, locale, dateFormat } = useUserPreferences();

  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: ORDER_ITEM_PAGE_SIZE,
  });
  const [columnOrder, setColumnOrder] = useLocalStorage<string[]>(
    "orderItems:columnOrder:v1",
    DEFAULT_COLUMN_ORDER,
  );
  const [columnSizing, setColumnSizing] = useLocalStorage<ColumnSizingState>(
    "orderItems:columnSizing:v1",
    {},
  );
  const [columnPinning, setColumnPinning] = useLocalStorage<ColumnPinningState>(
    "orderItems:columnPinning:v1",
    {},
  );
  const [columnVisibility, setColumnVisibility] = useLocalStorage<VisibilityState>(
    "orderItems:columnVisibility:v1",
    {},
  );

  const offset = pagination.pageIndex * pagination.pageSize;

  const {
    data: itemsData,
    isPending,
    isError,
    error,
  } = useQuery({
    ...orderItemsQueryOptions(orderId, pagination.pageSize, offset),
    enabled: !isLoading,
  });

  const items = itemsData?.items ?? [];
  const totalCount = itemsData?.totalCount ?? 0;
  const isGridLoading = isPending || isLoading;
  const itemSelection = useMemo<RowSelectionState>(
    () =>
      Object.fromEntries(
        Array.from(selectedOrderIdByCollectionId.keys(), (id) => [id, true] as const),
      ),
    [selectedOrderIdByCollectionId],
  );

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
      columnSizing,
      columnPinning,
      columnVisibility,
    },
    columnResizeMode: "onChange",
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    onRowSelectionChange: (updater) => {
      setSelectedOrderIdByCollectionId((current) => {
        const currentSelection = Object.fromEntries(
          Array.from(current.keys(), (id) => [id, true] as const),
        );
        const nextSelection = functionalUpdate(updater, currentSelection);
        const next = new Map(current);

        for (const item of items) {
          if (nextSelection[item.id]) next.set(item.id, orderId);
          else next.delete(item.id);
        }

        return next;
      });
    },
    onColumnOrderChange: setColumnOrder,
    onColumnSizingChange: setColumnSizing,
    onColumnPinningChange: setColumnPinning,
    onColumnVisibilityChange: setColumnVisibility,
    manualPagination: true,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row: OrderItem) => row.id,
    enableRowSelection: true,
  });

  const grid =
    isError && !isLoading ? (
      <p className="animate-data-in py-3 text-center text-sm text-destructive">
        Failed to load order items: {error.message}
      </p>
    ) : (
      <DataGrid
        table={subTable}
        recordCount={totalCount}
        isLoading={isGridLoading}
        loadingMode="skeleton"
        skeletonRowCount={1}
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
          <DataGridContainer className={wrapped ? "bg-card" : undefined}>
            <ScrollArea horizontal>
              <DataGridTable />
            </ScrollArea>
          </DataGridContainer>
          <div className="flex items-center justify-between">
            <div className="flex-1 text-sm text-muted-foreground">
              {isGridLoading ? (
                <span className="flex items-center gap-1">
                  <Skeleton className="size-4" /> of <Skeleton className="h-4 w-5" /> item(s)
                  selected
                </span>
              ) : (
                <span>
                  <span className="animate-data-in inline-block">
                    {subTable.getFilteredSelectedRowModel().rows.length}
                  </span>{" "}
                  of <span className="animate-data-in inline-block">{totalCount}</span> item(s)
                  selected
                </span>
              )}
            </div>
            <DataGridPagination className="pb-1.5" />
          </div>
        </div>
      </DataGrid>
    );

  const content = (
    <>
      <div className="flex items-center justify-between gap-2">
        {heading}
        <div className="ml-auto flex items-center gap-2">
          <DataGridColumnCombobox
            table={subTable}
            trigger={
              <Button variant="outline" size="sm">
                <HugeiconsIcon icon={DragDropVerticalIcon} strokeWidth={2} />
                Columns
              </Button>
            }
          />
          {isLoading ? (
            <Button size="sm" disabled>
              <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
              Add Item
            </Button>
          ) : (
            <OrderItemSyncSheet orderId={orderId} label="Add Item" />
          )}
        </div>
      </div>
      {grid}
    </>
  );

  if (!wrapped) return content;

  return (
    <div
      className="space-y-2.5 bg-muted/30 p-4"
      role="presentation"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {content}
    </div>
  );
}
