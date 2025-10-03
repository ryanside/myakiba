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
import { Link } from "@tanstack/react-router";
import { DataGrid, DataGridContainer } from "@/components/ui/data-grid";
import { DataGridPagination } from "@/components/ui/data-grid-pagination";
import { DataGridTable } from "@/components/ui/data-grid-table";
import { DataGridColumnHeader } from "@/components/ui/data-grid-column-header";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  type ColumnDef,
  type ExpandedState,
  getCoreRowModel,
  type PaginationState,
  type SortingState,
  useReactTable,
  type Updater,
} from "@tanstack/react-table";
import {
  SquareMinus,
  SquarePlus,
  MoreHorizontal,
  Eye,
  Edit,
  Trash2,
  ListRestart,
  Merge,
  Split,
  Trash,
  Info,
  Move,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { getOrderStatusVariant } from "@/lib/orders/utils";
import type {
  CascadeOptions,
  EditedOrder,
  Filters,
  NewOrder,
  Order,
  OrderItem,
} from "@/lib/orders/types";
import { OrderItemsSubTable } from "./order-item-subtable";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { OrderForm } from "./order-form";
import { DebouncedInput } from "@/components/debounced-input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  PopoverClose,
} from "@/components/ui/popover";
import { useSelection } from "@/hooks/use-selection";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import ItemMoveForm from "./item-move-form";

export const DEFAULT_PAGE_INDEX = 0;
export const DEFAULT_PAGE_SIZE = 10;

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
  onFilterChange: (filters: Filters) => void;
  onSearchChange: (search: string) => void;
  onResetFilters: () => void;
  onMerge: (
    values: NewOrder,
    cascadeOptions: CascadeOptions,
    orderIds: Set<string>
  ) => Promise<void>;
  onSplit: (
    values: NewOrder,
    cascadeOptions: CascadeOptions,
    collectionIds: Set<string>,
    orderIds: Set<string>
  ) => Promise<void>;
  onEditOrder: (
    values: EditedOrder,
    cascadeOptions: CascadeOptions
  ) => Promise<void>;
  onDeleteOrders: (orderIds: Set<string>) => Promise<void>;
  onEditItem: (
    orderId: string,
    itemId: string,
    values: OrderItem
  ) => Promise<void>;
  onDeleteItem: (orderId: string, itemId: string) => Promise<void>;
  onMoveItem: (
    targetOrderId: string,
    collectionIds: Set<string>,
    orderIds: Set<string>
  ) => Promise<void>;
}

export default function OrdersDataGrid({
  orders,
  totalCount,
  pagination: serverPagination,
  sorting: serverSorting,
  search,
  onFilterChange,
  onSearchChange,
  onResetFilters,
  onMerge,
  onSplit,
  onEditOrder,
  onDeleteOrders,
  onEditItem,
  onDeleteItem,
  onMoveItem,
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
              onEditItem={onEditItem}
              onDeleteItem={onDeleteItem}
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
        cell: (info) => (info.getValue() as string) || "n/a",
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
        accessorKey: "status",
        id: "status",
        header: ({ column }) => (
          <DataGridColumnHeader
            title="Status"
            visibility={true}
            column={column}
          />
        ),
        cell: ({ row }) => {
          const status = row.original.status;
          return (
            <Badge variant={getOrderStatusVariant(status)} appearance="outline">
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
                <DropdownMenuItem asChild>
                  <Link to="/orders/$id" params={{ id: order.orderId }}>
                    <Eye className="mr-2 h-4 w-4" />
                    View details
                  </Link>
                </DropdownMenuItem>
                <Dialog>
                  <DialogTrigger asChild>
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                      <Edit className="mr-2 h-4 w-4" />
                      Edit order
                    </DropdownMenuItem>
                  </DialogTrigger>
                  <OrderForm
                    type="edit-order"
                    orderData={order}
                    callbackFn={onEditOrder}
                  />
                </Dialog>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => onDeleteOrders(new Set([order.orderId]))}
                >
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
    onFilterChange({
      limit: newPagination.pageSize,
      offset: newOffset,
    });
  };

  const handleSortingChange = (updater: Updater<SortingState>) => {
    const newSorting =
      typeof updater === "function" ? updater(sorting) : updater;

    if (newSorting.length > 0) {
      const sortConfig = newSorting[0];
      onFilterChange({
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
    <>
      <div className="flex items-center justify-start gap-2">
        <DebouncedInput
          value={search ?? ""}
          onChange={(e) => onSearchChange(e.toString())}
          placeholder="Search"
          className="max-w-xs"
        />
        <Button onClick={onResetFilters} variant="outline">
          <ListRestart className="md:hidden" />
          <span className="hidden md:block">Reset Filters</span>
        </Button>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="primary" disabled={getSelectedOrderIds.size < 2}>
              <Merge className="md:hidden" />
              <span className="hidden md:block">Merge Orders</span>
            </Button>
          </DialogTrigger>
          <OrderForm
            orderIds={getSelectedOrderIds}
            callbackFn={onMerge}
            type="merge"
            clearSelections={clearSelections}
          />
        </Dialog>
        <Dialog>
          <DialogTrigger asChild>
            <Button
              variant="primary"
              disabled={getSelectedItemData.collectionIds.size === 0}
            >
              <Split className="md:hidden" />
              <span className="hidden md:block">Split Items</span>
            </Button>
          </DialogTrigger>
          <OrderForm
            collectionIds={getSelectedItemData.collectionIds}
            orderIds={getSelectedItemData.orderIds}
            callbackFn={onSplit}
            type="split"
            clearSelections={clearSelections}
          />
        </Dialog>
        <Dialog>
          <DialogTrigger asChild>
            <Button
              variant="primary"
              disabled={getSelectedItemData.collectionIds.size === 0}
            >
              <Move className="md:hidden" />
              <span className="hidden md:block">Move Items</span>
            </Button>
          </DialogTrigger>
          <ItemMoveForm
            selectedItemData={getSelectedItemData}
            callbackFn={onMoveItem}
            clearSelections={clearSelections}
          />
        </Dialog>
        <Popover>
          <PopoverTrigger asChild disabled={getSelectedOrderIds.size === 0}>
            <Button variant="outline" disabled={getSelectedOrderIds.size === 0}>
              <Trash className="stroke-white" />
            </Button>
          </PopoverTrigger>
          <PopoverContent>
            <div className="flex flex-col items-center gap-2 text-sm text-pretty">
              <div className="flex flex-row items-center gap-2">
                <p>Delete the selected orders and their items?</p>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="w-4 h-4" />
                  </TooltipTrigger>
                  <TooltipContent className="max-h-40">
                    <p>
                      Items with "Owned" status will not be deleted. You can
                      delete owned items in the manager tab.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="flex flex-row items-center gap-2 max-w-16 mr-auto">
                <PopoverClose asChild>
                  <Button
                    variant="outline"
                    disabled={getSelectedOrderIds.size === 0}
                    className="block"
                  >
                    Cancel
                  </Button>
                </PopoverClose>
                <PopoverClose asChild>
                  <Button
                    variant="destructive"
                    disabled={getSelectedOrderIds.size === 0}
                    className="block"
                    onClick={() => onDeleteOrders(getSelectedOrderIds)}
                  >
                    Delete
                  </Button>
                </PopoverClose>
              </div>
            </div>
          </PopoverContent>
        </Popover>
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
