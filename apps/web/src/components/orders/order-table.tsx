import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DataGrid, DataGridContainer } from "@/components/ui/data-grid";
import { DataGridPagination } from "@/components/ui/data-grid-pagination";
import { DataGridTable } from "@/components/ui/data-grid-table";
import { DataGridColumnHeader } from "@/components/ui/data-grid-column-header";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  type ColumnDef,
  type ExpandedState,
  type RowSelectionState,
  getCoreRowModel,
  type PaginationState,
  type SortingState,
  useReactTable,
  type Updater,
  type OnChangeFn,
} from "@tanstack/react-table";
import {
  SquareMinus,
  SquarePlus,
  MoreHorizontal,
  Eye,
  Edit,
  Trash2,
} from "lucide-react";
import type { VariantProps } from "class-variance-authority";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Order } from "@/lib/types";
import { OrderItemsSubTable } from "./order-item-subtable";

export const DEFAULT_PAGE_INDEX = 0;
export const DEFAULT_PAGE_SIZE = 10;

function getOrderStatusVariant(
  status: string
): VariantProps<typeof Badge>["variant"] {
  switch (status.toLowerCase()) {
    case "collected":
      return "success";
    case "shipped":
      return "primary";
    default:
      return "info";
  }
}

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
  search?: string;
  setFilters: (
    filters: Partial<{
      limit: number;
      offset: number;
      sort:
        | "title"
        | "shop"
        | "orderDate"
        | "releaseMonthYear"
        | "shippingMethod"
        | "total"
        | "itemCount"
        | "createdAt";
      order: "asc" | "desc";
      search: string;
    }>
  ) => void;
  rowSelection: RowSelectionState;
  setRowSelection: OnChangeFn<RowSelectionState>;
  itemSelection: RowSelectionState;
  setItemSelection: OnChangeFn<RowSelectionState>;
  setEditDialogState: (state: { isOpen: boolean; order: Order | null }) => void;
}

export default function OrdersDataGrid({
  orders,
  totalCount,
  pagination: serverPagination,
  sorting: serverSorting,
  search,
  setFilters,
  rowSelection,
  setRowSelection,
  itemSelection,
  setItemSelection,
  setEditDialogState,
}: OrdersDataGridProps) {
  const pagination = useMemo<PaginationState>(
    () => ({
      pageIndex: Math.floor(serverPagination.offset / serverPagination.limit),
      pageSize: serverPagination.limit,
    }),
    [serverPagination.offset, serverPagination.limit]
  );

  const sorting = useMemo<SortingState>(
    () => [
      {
        id: serverSorting.sort,
        desc: serverSorting.order === "desc",
      },
    ],
    [serverSorting.sort, serverSorting.order]
  );

  const [expandedRows, setExpandedRows] = useState<ExpandedState>({});
  const [columnOrder, setColumnOrder] = useState<string[]>([
    "select",
    "expand",
    "title",
    "shop",
    "shippingMethod",
    "releaseMonthYear",
    "orderDate",
    "paymentDate",
    "shippingDate",
    "itemCount",
    "total",
    "status",
    "actions",
  ]);

  const columns = useMemo<ColumnDef<Order>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && "indeterminate")
            }
            onCheckedChange={(value) =>
              table.toggleAllPageRowsSelected(!!value)
            }
            aria-label="Select all"
            size="sm"
            className="align-[inherit] mb-0.5 rounded-xs"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
            size="sm"
            className="align-[inherit] mb-0.5 rounded-xs"
          />
        ),
        size: 25,
        enableSorting: false,
        enableHiding: false,
        enableResizing: false,
      },
      {
        id: "expand",
        header: () => null,
        cell: ({ row }) => {
          return row.getCanExpand() ? (
            <Button
              onClick={row.getToggleExpandedHandler()}
              mode="icon"
              size="sm"
              variant="ghost"
            >
              {row.getIsExpanded() ? <SquareMinus /> : <SquarePlus />}
            </Button>
          ) : null;
        },
        size: 25,
        enableResizing: false,
        meta: {
          expandedContent: (row) => (
            <OrderItemsSubTable
              items={row.items}
              orderId={row.orderId}
              itemSelection={itemSelection}
              setItemSelection={setItemSelection}
            />
          ),
        },
      },
      {
        accessorKey: "title",
        id: "title",
        header: ({ column }) => (
          <DataGridColumnHeader
            title="Order"
            visibility={true}
            column={column}
          />
        ),
        cell: ({ row }) => {
          const order = row.original;
          return (
            <div className="space-y-px">
              <div className="font-medium text-foreground truncate">
                {order.title}
              </div>
            </div>
          );
        },
        enableSorting: true,
        enableHiding: true,
        enableResizing: true,
        size: 250,
      },
      {
        accessorKey: "shop",
        id: "shop",
        header: ({ column }) => (
          <DataGridColumnHeader
            title="Shop"
            visibility={true}
            column={column}
          />
        ),
        cell: (info) => (info.getValue() as string) || "N/A",
        enableSorting: true,
        enableHiding: true,
        enableResizing: true,
        size: 120,
      },
      {
        accessorKey: "shippingMethod",
        id: "shippingMethod",
        header: ({ column }) => (
          <DataGridColumnHeader
            title="Shipping Method"
            visibility={true}
            column={column}
          />
        ),
        cell: ({ row }) => {
          const order = row.original;
          return (
            <div className="space-y-px">
              <div className="text-sm">{order.shippingMethod}</div>
            </div>
          );
        },
        enableSorting: true,
        enableHiding: true,
        enableResizing: true,
        size: 140,
      },
      {
        accessorKey: "releaseMonthYear",
        id: "releaseMonthYear",
        header: ({ column }) => (
          <DataGridColumnHeader
            title="Release"
            visibility={true}
            column={column}
          />
        ),
        cell: ({ row }) => {
          const order = row.original;
          return (
            <div className="space-y-px">
              <div className="text-sm">
                {formatDate(order.releaseMonthYear)}
              </div>
            </div>
          );
        },
        enableSorting: true,
        enableHiding: true,
        enableResizing: true,
        size: 120,
      },
      {
        accessorKey: "orderDate",
        id: "orderDate",
        header: ({ column }) => (
          <DataGridColumnHeader
            title="Order Date"
            visibility={true}
            column={column}
          />
        ),
        cell: ({ row }) => {
          const order = row.original;
          return (
            <div className="space-y-px">
              <div className="text-sm">{formatDate(order.orderDate)}</div>
              {order.paymentDate && (
                <div className="text-xs text-muted-foreground">
                  Paid: {formatDate(order.paymentDate)}
                </div>
              )}
            </div>
          );
        },
        enableSorting: true,
        enableHiding: true,
        enableResizing: true,
        size: 120,
      },
      {
        accessorKey: "itemCount",
        id: "itemCount",
        header: ({ column }) => (
          <DataGridColumnHeader
            title="Items"
            visibility={true}
            column={column}
          />
        ),
        cell: ({ row }) => {
          const itemCount = row.original.itemCount;
          return (
            <div
              className="text-sm font-medium text-foreground hover:text-primary cursor-pointer"
              onClick={() => row.getToggleExpandedHandler()()}
            >
              {itemCount} {itemCount === 1 ? "item" : "items"}
            </div>
          );
        },
        enableSorting: true,
        enableHiding: true,
        enableResizing: true,
        size: 100,
      },
      {
        accessorKey: "total",
        id: "total",
        header: ({ column }) => (
          <DataGridColumnHeader
            title="Total"
            visibility={true}
            column={column}
          />
        ),
        cell: ({ row }) => {
          const total = row.original.total;
          return (
            <div className="font-medium text-foreground">
              {formatCurrency(total)}
            </div>
          );
        },
        enableSorting: true,
        enableHiding: true,
        enableResizing: true,
        size: 100,
      },
      {
        accessorKey: "orderStatus",
        id: "status",
        header: ({ column }) => (
          <DataGridColumnHeader
            title="Status"
            visibility={true}
            column={column}
          />
        ),
        cell: ({ row }) => {
          const status = row.original.orderStatus;
          return (
            <Badge variant={getOrderStatusVariant(status)} appearance="light">
              {status}
            </Badge>
          );
        },
        enableSorting: true,
        enableHiding: true,
        enableResizing: true,
        size: 120,
      },
      {
        id: "actions",
        header: () => null,
        cell: ({ row }) => {
          const order = row.original;

          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                  <span className="sr-only">Open menu</span>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuItem>
                  <Eye className="mr-2 h-4 w-4" />
                  View details
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    setEditDialogState({
                      isOpen: true,
                      order,
                    })
                  }
                >
                  <Edit className="mr-2 h-4 w-4" />
                  Edit order
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete order
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
        size: 50,
        enableSorting: false,
        enableHiding: false,
        enableResizing: false,
      },
    ],
    [itemSelection, setItemSelection, rowSelection, setRowSelection]
  );

  const handlePaginationChange = (updater: Updater<PaginationState>) => {
    const newPagination =
      typeof updater === "function" ? updater(pagination) : updater;

    const newOffset = newPagination.pageIndex * newPagination.pageSize;
    setFilters({
      limit: newPagination.pageSize,
      offset: newOffset,
    });
  };

  const handleSortingChange = (updater: Updater<SortingState>) => {
    const newSorting =
      typeof updater === "function" ? updater(sorting) : updater;

    if (newSorting.length > 0) {
      const sortConfig = newSorting[0];
      setFilters({
        sort: sortConfig.id as
          | "title"
          | "shop"
          | "orderDate"
          | "releaseMonthYear"
          | "shippingMethod"
          | "total"
          | "itemCount"
          | "createdAt",
        order: sortConfig.desc ? "desc" : "asc",
        offset: 0,
      });
    }
  };

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
    },
    columnResizeMode: "onChange",
    onPaginationChange: handlePaginationChange,
    onSortingChange: handleSortingChange,
    onExpandedChange: setExpandedRows,
    onRowSelectionChange: setRowSelection,
    onColumnOrderChange: setColumnOrder,
    manualFiltering: true,
    manualSorting: true,
    manualPagination: true,
    getCoreRowModel: getCoreRowModel(),
    enableRowSelection: true,
  });

  return (
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
  );
}
