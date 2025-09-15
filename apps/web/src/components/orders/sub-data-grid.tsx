import { useMemo, useState, useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type PaginationState,
  type SortingState,
  useReactTable,
  type Updater,
  type OnChangeFn,
} from "@tanstack/react-table";
import { SquareMinus, SquarePlus, Calendar, Package, MoreHorizontal, Copy, Eye, Edit, Trash2 } from "lucide-react";
import type { VariantProps } from "class-variance-authority";
import { formatCurrency } from "@/lib/utils";

export const DEFAULT_PAGE_INDEX = 0;
export const DEFAULT_PAGE_SIZE = 10;

interface OrderItemData {
  id: number;
  title: string;
  image: string | null;
  price: string;
}

interface OrderData {
  orderId: string;
  title: string;
  shop: string | null;
  releaseMonthYear: string | null;
  shippingMethod: string | null;
  orderDate: string | null;
  paymentDate: string | null;
  shippingDate: string | null;
  orderStatus: string;
  total: string;
  itemCount: number;
  itemImages: (string | null)[];
  itemTitles: string[];
  itemIds: number[];
  itemPrices: string[];
  items?: OrderItemData[]; // Transformed items for sub-table
}

// Helper function to transform order data arrays into items
function transformOrderItems(order: OrderData): OrderItemData[] {
  if (order.items) {
    return order.items;
  }

  const items: OrderItemData[] = [];
  const maxLength = Math.max(order.itemIds.length, order.itemTitles.length);

  for (let i = 0; i < maxLength; i++) {
    items.push({
      id: order.itemIds[i] || 0,
      title: order.itemTitles[i] || "Unknown Item",
      image: order.itemImages[i] || null,
      price: order.itemPrices[i] || "N/A",
    });
  }

  return items;
}

// Helper function to get order status badge variant
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

// Helper function to format date
function formatDate(dateString: string | null): string {
  if (!dateString) return "N/A";
  try {
    return new Date(dateString).toLocaleDateString();
  } catch {
    return "Invalid Date";
  }
}

interface OrdersDataGridProps {
  orders: OrderData[];
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
  setFilters: (filters: Partial<{
    limit: number;
    offset: number;
    sort: "title" | "shop" | "orderDate" | "releaseMonthYear" | "shippingMethod" | "total" | "itemCount" | "createdAt";
    order: "asc" | "desc";
    search: string;
  }>) => void;
  rowSelection: RowSelectionState;
  setRowSelection: OnChangeFn<RowSelectionState>;
}

// Sub-table component for order items
function OrderItemsSubTable({ items }: { items: OrderItemData[] }) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 5, // Show 5 items per page for sub-tables
  });

  const columns = useMemo<ColumnDef<OrderItemData>[]>(
    () => [
      {
        accessorKey: "title",
        header: ({ column }) => (
          <DataGridColumnHeader title="Item" column={column} />
        ),
        cell: ({ row }) => {
          const item = row.original;
          return (
            <div className="flex items-center gap-3">
              {item.image && (
                <Avatar className="size-8">
                  <AvatarImage
                    src={item.image}
                    alt={item.title}
                    className="rounded-sm"
                  />
                  <AvatarFallback>
                    <Package className="size-4" />
                  </AvatarFallback>
                </Avatar>
              )}
              <div className="space-y-px">
                <div className="font-medium text-foreground">{item.title}</div>
                <Button
                  className="text-xs text-muted-foreground"
                  mode="link"
                  size="sm"
                  variant="ghost"
                >
                  <a
                    href={`https://myfigurecollection.net/item/${item.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    https://myfigurecollection.net/item/{item.id}
                  </a>
                </Button>
              </div>
            </div>
          );
        },
        enableSorting: true,
        size: 300,
      },
      {
        accessorKey: "price",
        header: ({ column }) => (
          <DataGridColumnHeader title="Price" column={column} />
        ),
        cell: (info) => formatCurrency(info.getValue() as string),
        enableSorting: true,
        size: 100,
      },
    ],
    []
  );

  const table = useReactTable({
    data: items,
    columns,
    pageCount: Math.ceil(items.length / pagination.pageSize),
    state: {
      sorting,
      pagination,
    },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (row: OrderItemData) => row.id.toString(),
  });

  return (
    <div className="bg-muted/30 p-4">
      <DataGrid
        table={table}
        recordCount={items.length}
        tableLayout={{
          cellBorder: true,
          rowBorder: true,
          headerBackground: true,
          headerBorder: true,
        }}
      >
        <div className="w-full space-y-2.5">
          <div className="bg-card rounded-lg">
            <DataGridContainer>
              <ScrollArea>
                <DataGridTable />
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            </DataGridContainer>
          </div>
          <DataGridPagination className="pb-1.5" />
        </div>
      </DataGrid>
    </div>
  );
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
}: OrdersDataGridProps) {
  // Derive state directly from server state (no useEffect needed)
  const pagination = useMemo<PaginationState>(() => ({
    pageIndex: Math.floor(serverPagination.offset / serverPagination.limit),
    pageSize: serverPagination.limit,
  }), [serverPagination.offset, serverPagination.limit]);
  
  const sorting = useMemo<SortingState>(() => ([
    {
      id: serverSorting.sort,
      desc: serverSorting.order === "desc",
    },
  ]), [serverSorting.sort, serverSorting.order]);
  
  const [expandedRows, setExpandedRows] = useState<ExpandedState>({});
  const [columnOrder, setColumnOrder] = useState<string[]>([
    "select",
    "expand",
    "title",
    "shop",
    "orderDate",
    "items",
    "total",
    "status",
    "actions",
  ]);
  console.log(rowSelection);

  const columns = useMemo<ColumnDef<OrderData>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && "indeterminate")
            }
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="Select all"
            size="sm"
            className="align-[inherit] rounded-xs"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
            size="sm"
            className="align-[inherit] rounded-xs"
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
            <OrderItemsSubTable items={transformOrderItems(row)} />
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
              <div className="font-medium text-foreground truncate">{order.title}</div>
              <div className="text-xs text-muted-foreground">
                {order.releaseMonthYear || "N/A"} •{" "}
                {order.shippingMethod || "N/A"}
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
        size: 150,
      },
      {
        accessorKey: "itemCount",
        id: "items",
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
                <DropdownMenuItem
                  onClick={() => navigator.clipboard.writeText(order.orderId)}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copy order ID
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <Eye className="mr-2 h-4 w-4" />
                  View details
                </DropdownMenuItem>
                <DropdownMenuItem>
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
    []
  );

  // Handle pagination changes
  const handlePaginationChange = (updater: Updater<PaginationState>) => {
    const newPagination = typeof updater === 'function' ? updater(pagination) : updater;
    
    const newOffset = newPagination.pageIndex * newPagination.pageSize;
    setFilters({
      limit: newPagination.pageSize,
      offset: newOffset,
    });
  };

  // Handle sorting changes
  const handleSortingChange = (updater: Updater<SortingState>) => {
    const newSorting = typeof updater === 'function' ? updater(sorting) : updater;
    
    if (newSorting.length > 0) {
      const sortConfig = newSorting[0];
      setFilters({
        sort: sortConfig.id as "title" | "shop" | "orderDate" | "releaseMonthYear" | "shippingMethod" | "total" | "itemCount" | "createdAt",
        order: sortConfig.desc ? "desc" : "asc",
        // Reset to first page when sorting changes
        offset: 0,
      });
    }
  };

  const table = useReactTable({
    columns,
    data: orders,
    pageCount: Math.ceil(totalCount / serverPagination.limit),
    getRowId: (row: OrderData) => row.orderId,
    getRowCanExpand: (row) => Boolean(row.original.itemCount > 0),
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
