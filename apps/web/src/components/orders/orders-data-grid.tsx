import { useCallback, useMemo, useState } from "react";
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
  type VisibilityState,
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
  Trash,
  Info,
  Move,
  Filter,
  Columns,
} from "lucide-react";
import { cn, formatCurrency, getCurrencyLocale } from "@/lib/utils";
import type {
  CascadeOptions,
  EditedOrder,
  OrderFilters,
  NewOrder,
  Order,
} from "@/lib/orders/types";
import { OrderItemSubDataGrid } from "./order-item-sub-data-grid";
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
import UnifiedItemMoveForm from "./unified-item-move-form";
import type { CollectionItemFormValues } from "@/lib/collection/types";
import OrdersFiltersForm from "./orders-filters-form";
import { PopoverMultiInputCell } from "../cells/popover-multi-input-cell";
import { SelectCell } from "../cells/select-cell";
import { InlineTextCell } from "../cells/inline-text-cell";
import { InlineCurrencyCell } from "../cells/inline-currency-cell";
import { PopoverDatePickerCell } from "../cells/popover-date-picker-cell";
import { DataGridColumnCombobox } from "../ui/data-grid-column-combobox";
import { DataGridSortCombobox } from "../ui/data-grid-sort-combobox";
import { DEFAULT_PAGE_INDEX, DEFAULT_PAGE_SIZE } from "@myakiba/constants";

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
  onEditItem: (values: CollectionItemFormValues) => Promise<void>;
  onDeleteItem: (orderId: string, itemId: string) => Promise<void>;
  onMoveItem: (
    targetOrderId: string,
    collectionIds: Set<string>,
    orderIds: Set<string>
  ) => Promise<void>;
  currency?: string;
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
  onMoveItem,
  currency = "USD",
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
    "releaseMonthYear",
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
            onClick={(e) => e.stopPropagation()}
            aria-label="Select all"
            size="sm"
            className="align-[inherit] mb-0.5 rounded-xs"
          />
        ),
        cell: ({ row }) => (
          <>
            <div
              className={cn(
                "hidden absolute top-0 bottom-0 start-0 w-[2px] bg-primary",
                row.getIsSelected() && "block"
              )}
            ></div>
            <Checkbox
              checked={row.getIsSelected()}
              onCheckedChange={(value) => row.toggleSelected(!!value)}
              onClick={(e) => e.stopPropagation()}
              aria-label="Select row"
              size="sm"
              className="align-[inherit] mb-0.5 rounded-xs"
            />
          </>
        ),
        size: 30,
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
            <OrderItemSubDataGrid
              items={row.items}
              orderId={row.orderId}
              itemSelection={itemSelection}
              setItemSelection={setItemSelection}
              onEditItem={onEditItem}
              onDeleteItem={onDeleteItem}
              currency={currency}
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
              <Link
                to="/orders/$id"
                params={{ id: order.orderId }}
                className="font-medium text-foreground truncate"
              >
                {order.title}
              </Link>
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
        cell: ({ row }) => (
          <InlineTextCell
            value={row.original.shop}
            onSubmit={async (newValue) => {
              const { createdAt, updatedAt, ...orderWithoutTimestamps } =
                row.original;
              await onEditOrder(
                {
                  ...orderWithoutTimestamps,
                  shop: newValue,
                },
                ["shop"] as CascadeOptions
              );
            }}
          />
        ),
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
              <SelectCell
                value={order.shippingMethod}
                options={[
                  "n/a",
                  "EMS",
                  "SAL",
                  "AIRMAIL",
                  "SURFACE",
                  "FEDEX",
                  "DHL",
                  "Colissimo",
                  "UPS",
                  "Domestic",
                ]}
                onSubmit={async (value) => {
                  const { createdAt, updatedAt, ...orderWithoutTimestamps } =
                    row.original;
                  await onEditOrder(
                    {
                      ...orderWithoutTimestamps,
                      shippingMethod: value as
                        | "n/a"
                        | "EMS"
                        | "SAL"
                        | "AIRMAIL"
                        | "SURFACE"
                        | "FEDEX"
                        | "DHL"
                        | "Colissimo"
                        | "UPS"
                        | "Domestic",
                    },
                    ["shippingMethod"] as CascadeOptions
                  );
                }}
              />
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
            <PopoverDatePickerCell
              value={order.releaseMonthYear}
              onSubmit={async (newValue) => {
                const { createdAt, updatedAt, ...orderWithoutTimestamps } =
                  row.original;
                await onEditOrder(
                  {
                    ...orderWithoutTimestamps,
                    releaseMonthYear: newValue,
                  },
                  [] as CascadeOptions
                );
              }}
            />
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
            <PopoverDatePickerCell
              value={order.orderDate}
              onSubmit={async (newValue) => {
                const { createdAt, updatedAt, ...orderWithoutTimestamps } =
                  row.original;
                await onEditOrder(
                  {
                    ...orderWithoutTimestamps,
                    orderDate: newValue,
                  },
                  ["orderDate"] as CascadeOptions
                );
              }}
            />
          );
        },
        enableSorting: true,
        enableHiding: true,
        enableResizing: true,
        size: 120,
        meta: {
          headerTitle: "Order Date",
        },
      },
      {
        accessorKey: "paymentDate",
        id: "paymentDate",
        header: ({ column }) => (
          <DataGridColumnHeader
            title="Payment Date"
            visibility={true}
            column={column}
          />
        ),
        cell: ({ row }) => {
          const order = row.original;
          return (
            <PopoverDatePickerCell
              value={order.paymentDate}
              onSubmit={async (newValue) => {
                const { createdAt, updatedAt, ...orderWithoutTimestamps } =
                  row.original;
                await onEditOrder(
                  {
                    ...orderWithoutTimestamps,
                    paymentDate: newValue,
                  },
                  ["paymentDate"] as CascadeOptions
                );
              }}
            />
          );
        },
        enableSorting: true,
        enableHiding: true,
        enableResizing: true,
        size: 120,
        meta: {
          headerTitle: "Payment Date",
        },
      },
      {
        accessorKey: "shippingDate",
        id: "shippingDate",
        header: ({ column }) => (
          <DataGridColumnHeader
            title="Shipping Date"
            visibility={true}
            column={column}
          />
        ),
        cell: ({ row }) => {
          const order = row.original;
          return (
            <PopoverDatePickerCell
              value={order.shippingDate}
              onSubmit={async (newValue) => {
                const { createdAt, updatedAt, ...orderWithoutTimestamps } =
                  row.original;
                await onEditOrder(
                  {
                    ...orderWithoutTimestamps,
                    shippingDate: newValue,
                  },
                  ["shippingDate"] as CascadeOptions
                );
              }}
            />
          );
        },
        enableSorting: true,
        enableHiding: true,
        enableResizing: true,
        size: 120,
        meta: {
          headerTitle: "Shipping Date",
        },
      },
      {
        accessorKey: "collectionDate",
        id: "collectionDate",
        header: ({ column }) => (
          <DataGridColumnHeader
            title="Collection Date"
            visibility={true}
            column={column}
          />
        ),
        cell: ({ row }) => {
          const order = row.original;
          return (
            <PopoverDatePickerCell
              value={order.collectionDate}
              onSubmit={async (newValue) => {
                const { createdAt, updatedAt, ...orderWithoutTimestamps } =
                  row.original;
                await onEditOrder(
                  {
                    ...orderWithoutTimestamps,
                    collectionDate: newValue,
                  },
                  ["collectionDate"] as CascadeOptions
                );
              }}
            />
          );
        },
        enableSorting: true,
        enableHiding: true,
        enableResizing: true,
        size: 120,
        meta: {
          headerTitle: "Collection Date",
        },
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
          const order = row.original;
          const inputs = [
            {
              title: "Shipping Fee",
              name: "shippingFee",
              type: "currency" as const,
              value: order.shippingFee,
            },
            {
              title: "Taxes",
              name: "taxes",
              type: "currency" as const,
              value: order.taxes,
            },
            {
              title: "Duties",
              name: "duties",
              type: "currency" as const,
              value: order.duties,
            },
            {
              title: "Tariffs",
              name: "tariffs",
              type: "currency" as const,
              value: order.tariffs,
            },
            {
              title: "Misc Fees",
              name: "miscFees",
              type: "currency" as const,
              value: order.miscFees,
            },
          ];
          const locale = getCurrencyLocale(currency);
          return (
            <PopoverMultiInputCell
              inputs={inputs}
              total={formatCurrency(order.total, currency)}
              currency={currency}
              locale={locale}
              onSubmit={async (newValues) => {
                const { createdAt, updatedAt, ...orderWithoutTimestamps } =
                  order;
                await onEditOrder(
                  {
                    ...orderWithoutTimestamps,
                    ...newValues,
                  },
                  [] as CascadeOptions
                );
              }}
            />
          );
        },
        enableSorting: true,
        enableHiding: true,
        enableResizing: true,
        size: 100,
        meta: {
          headerTitle: "Total",
        },
      },
      {
        accessorKey: "shippingFee",
        accessorFn: (row) => Number(row.shippingFee),
        id: "shippingFee",
        header: ({ column }) => (
          <DataGridColumnHeader
            title="Shipping Fee"
            visibility={true}
            column={column}
          />
        ),
        cell: ({ row }) => {
          const order = row.original;
          return (
            <InlineCurrencyCell
              value={order.shippingFee}
              currency={currency}
              locale={getCurrencyLocale(currency)}
              onSubmit={async (newValue) => {
                const { createdAt, updatedAt, ...orderWithoutTimestamps } =
                  row.original;
                await onEditOrder(
                  {
                    ...orderWithoutTimestamps,
                    shippingFee: newValue,
                  },
                  [] as CascadeOptions
                );
              }}
              disabled={false}
            />
          );
        },
        enableSorting: true,
        enableHiding: true,
        enableResizing: true,
        size: 100,
        meta: {
          headerTitle: "Shipping Fee",
        },
      },
      {
        accessorKey: "taxes",
        accessorFn: (row) => Number(row.taxes),
        id: "taxes",
        header: ({ column }) => (
          <DataGridColumnHeader
            title="Taxes"
            visibility={true}
            column={column}
          />
        ),
        cell: ({ row }) => {
          const order = row.original;
          return (
            <InlineCurrencyCell
              value={order.taxes}
              currency={currency}
              locale={getCurrencyLocale(currency)}
              onSubmit={async (newValue) => {
                const { createdAt, updatedAt, ...orderWithoutTimestamps } =
                  row.original;
                await onEditOrder(
                  {
                    ...orderWithoutTimestamps,
                    taxes: newValue,
                  },
                  [] as CascadeOptions
                );
              }}
              disabled={false}
            />
          );
        },
        enableSorting: true,
        enableHiding: true,
        enableResizing: true,
        size: 100,
        meta: {
          headerTitle: "Taxes",
        },
      },
      {
        accessorKey: "duties",
        accessorFn: (row) => Number(row.duties),
        id: "duties",
        header: ({ column }) => (
          <DataGridColumnHeader
            title="Duties"
            visibility={true}
            column={column}
          />
        ),
        cell: ({ row }) => {
          const order = row.original;
          return (
            <InlineCurrencyCell
              value={order.duties}
              currency={currency}
              locale={getCurrencyLocale(currency)}
              onSubmit={async (newValue) => {
                const { createdAt, updatedAt, ...orderWithoutTimestamps } =
                  row.original;
                await onEditOrder(
                  {
                    ...orderWithoutTimestamps,
                    duties: newValue,
                  },
                  [] as CascadeOptions
                );
              }}
              disabled={false}
            />
          );
        },
        enableSorting: true,
        enableHiding: true,
        enableResizing: true,
        size: 100,
        meta: {
          headerTitle: "Duties",
        },
      },
      {
        accessorKey: "tariffs",
        accessorFn: (row) => Number(row.tariffs),
        id: "tariffs",
        header: ({ column }) => (
          <DataGridColumnHeader
            title="Tariffs"
            visibility={true}
            column={column}
          />
        ),
        cell: ({ row }) => {
          const order = row.original;
          return (
            <InlineCurrencyCell
              value={order.tariffs}
              currency={currency}
              locale={getCurrencyLocale(currency)}
              onSubmit={async (newValue) => {
                const { createdAt, updatedAt, ...orderWithoutTimestamps } =
                  row.original;
                await onEditOrder(
                  {
                    ...orderWithoutTimestamps,
                    tariffs: newValue,
                  },
                  [] as CascadeOptions
                );
              }}
              disabled={false}
            />
          );
        },
        enableSorting: true,
        enableHiding: true,
        enableResizing: true,
        size: 100,
        meta: {
          headerTitle: "Tariffs",
        },
      },
      {
        accessorKey: "miscFees",
        accessorFn: (row) => Number(row.miscFees),
        id: "miscFees",
        header: ({ column }) => (
          <DataGridColumnHeader
            title="Misc Fees"
            visibility={true}
            column={column}
          />
        ),
        cell: ({ row }) => {
          const order = row.original;
          return (
            <InlineCurrencyCell
              value={order.miscFees}
              currency={currency}
              locale={getCurrencyLocale(currency)}
              onSubmit={async (newValue) => {
                const { createdAt, updatedAt, ...orderWithoutTimestamps } =
                  row.original;
                await onEditOrder(
                  {
                    ...orderWithoutTimestamps,
                    miscFees: newValue,
                  },
                  [] as CascadeOptions
                );
              }}
              disabled={false}
            />
          );
        },
        enableSorting: true,
        enableHiding: true,
        enableResizing: true,
        size: 100,
        meta: {
          headerTitle: "Misc Fees",
        },
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
            // <Badge variant={getStatusVariant(status)} appearance="outline">
            //   {status}
            // </Badge>
            <SelectCell
              value={status}
              options={["Ordered", "Paid", "Shipped", "Owned"]}
              onSubmit={async (value) => {
                const { createdAt, updatedAt, ...orderWithoutTimestamps } =
                  row.original;
                await onEditOrder(
                  {
                    ...orderWithoutTimestamps,
                    status: value as "Ordered" | "Paid" | "Shipped" | "Owned",
                  },
                  ["status"] as CascadeOptions
                );
              }}
            />
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
                    currency={currency}
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
    [
      onEditItem,
      onDeleteItem,
      onEditOrder,
      onDeleteOrders,
      currency,
      itemSelection,
      setItemSelection,
    ]
  );

  const handlePaginationChange = useCallback(
    (updater: Updater<PaginationState>) => {
      const newPagination =
        typeof updater === "function" ? updater(pagination) : updater;

      const newOffset = newPagination.pageIndex * newPagination.pageSize;
      onFilterChange({
        limit: newPagination.pageSize,
        offset: newOffset,
      });
    },
    [pagination, onFilterChange]
  );

  const handleSortingChange = useCallback(
    (updater: Updater<SortingState>) => {
      const newSorting =
        typeof updater === "function" ? updater(sorting) : updater;

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
            | "releaseMonthYear"
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
    [sorting, onFilterChange]
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
        <DebouncedInput
          value={search ?? ""}
          onChange={(e) => onSearchChange(e.toString())}
          placeholder="Search"
          className="max-w-xs"
        />
        <Dialog key={JSON.stringify(filters)}>
          <DialogTrigger asChild>
            <Button variant="outline">
              <Filter className="" />
              <span className="hidden md:block">Filters</span>
            </Button>
          </DialogTrigger>
          <OrdersFiltersForm
            currentFilters={{
              ...filters,
            }}
            onApplyFilters={(newFilters) =>
              onFilterChange({ ...filters, ...newFilters, offset: 0 })
            }
            currency={currency}
          />
        </Dialog>
        <DataGridSortCombobox
          table={table}
          onSortChange={(columnId, direction) => {
            if (columnId === null || direction === null) {
              // Clear sorting - use default sort
              onFilterChange({
                sort: "createdAt",
                order: "desc",
                offset: 0,
              });
            } else {
              onFilterChange({
                sort: columnId as
                  | "title"
                  | "shop"
                  | "orderDate"
                  | "paymentDate"
                  | "shippingDate"
                  | "collectionDate"
                  | "releaseMonthYear"
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
                order: direction,
                offset: 0,
              });
            }
          }}
        />
        <Button onClick={onResetFilters} variant="outline">
          <ListRestart />
          <span className="hidden md:block">Reset Filters</span>
        </Button>
        <DataGridColumnCombobox table={table} />

        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" disabled={getSelectedOrderIds.size < 2}>
              <Merge />
              <span className="hidden md:block">Merge</span>
            </Button>
          </DialogTrigger>
          <OrderForm
            orderIds={getSelectedOrderIds}
            callbackFn={onMerge}
            type="merge"
            clearSelections={clearSelections}
            currency={currency}
          />
        </Dialog>
        <Dialog>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              disabled={getSelectedItemData.collectionIds.size === 0}
            >
              <Move />
              <span className="hidden md:block">Move Item</span>
            </Button>
          </DialogTrigger>
          <UnifiedItemMoveForm
            selectedItemData={getSelectedItemData}
            onMoveToExisting={onMoveItem}
            onMoveToNew={onSplit}
            clearSelections={clearSelections}
            currency={currency}
          />
        </Dialog>
        <Popover>
          <PopoverTrigger asChild disabled={getSelectedOrderIds.size === 0}>
            <Button
              variant="outline"
              disabled={getSelectedOrderIds.size === 0}
              size="icon"
            >
              <Trash className="" />
            </Button>
          </PopoverTrigger>
          <PopoverContent>
            <div className="flex flex-col items-center gap-2 text-sm text-pretty">
              <div className="flex flex-row items-center gap-2 mr-auto">
                <p>Delete the selected orders and their items?</p>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="w-4 h-4" />
                  </TooltipTrigger>
                  <TooltipContent className="max-h-40">
                    <p>
                      Items with "Owned" status will not be deleted. You can
                      delete owned items in the collection tab.
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
