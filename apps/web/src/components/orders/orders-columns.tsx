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
import { DataGridColumnHeader } from "@/components/ui/data-grid-column-header";
import { type ColumnDef, type RowSelectionState, type OnChangeFn } from "@tanstack/react-table";
import { SquareMinus, SquarePlus, MoreHorizontal, Eye, Edit, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrencyFromMinorUnits, getCurrencyLocale } from "@myakiba/utils";
import type { CascadeOptions, EditedOrder, Order } from "@myakiba/types";
import { OrderForm } from "./order-form";
import { OrderItemSubDataGrid } from "./order-item-sub-data-grid";
import { PopoverMultiInputCell } from "../cells/popover-multi-input-cell";
import { SelectCell } from "../cells/select-cell";
import { InlineTextCell } from "../cells/inline-text-cell";
import { InlineCurrencyCell } from "../cells/inline-currency-cell";
import { PopoverDatePickerCell } from "../cells/popover-date-picker-cell";
import type { CollectionItemFormValues } from "@myakiba/types";
import { SHIPPING_METHODS, ORDER_STATUSES } from "@myakiba/constants";
import type { ShippingMethod, OrderStatus, DateFormat } from "@myakiba/types";

interface OrdersColumnsParams {
  onEditOrder: (values: EditedOrder, cascadeOptions: CascadeOptions) => Promise<void>;
  onDeleteOrders: (orderIds: Set<string>) => Promise<void>;
  onEditItem: (values: CollectionItemFormValues) => Promise<void>;
  onDeleteItem: (orderId: string, itemId: string) => Promise<void>;
  currency: string;
  itemSelection: RowSelectionState;
  setItemSelection: OnChangeFn<RowSelectionState>;
  dateFormat: DateFormat;
}

export function createOrdersColumns({
  onEditOrder,
  onDeleteOrders,
  onEditItem,
  onDeleteItem,
  currency,
  itemSelection,
  setItemSelection,
  dateFormat,
}: OrdersColumnsParams): ColumnDef<Order>[] {
  return [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
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
              row.getIsSelected() && "block",
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
          <Button onClick={row.getToggleExpandedHandler()} mode="icon" size="sm" variant="ghost">
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
            dateFormat={dateFormat}
          />
        ),
      },
    },
    {
      accessorKey: "title",
      id: "title",
      header: ({ column }) => (
        <DataGridColumnHeader title="Order" visibility={true} column={column} />
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
        <DataGridColumnHeader title="Shop" visibility={true} column={column} />
      ),
      cell: ({ row }) => (
        <InlineTextCell
          value={row.original.shop}
          onSubmit={async (newValue) => {
            const { ...orderWithoutTimestamps } = row.original;
            await onEditOrder(
              {
                ...orderWithoutTimestamps,
                shop: newValue,
              },
              ["shop"] as CascadeOptions,
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
        <DataGridColumnHeader title="Shipping Method" visibility={true} column={column} />
      ),
      cell: ({ row }) => {
        const order = row.original;
        return (
          <div className="space-y-px">
            <SelectCell
              value={order.shippingMethod}
              options={[...SHIPPING_METHODS]}
              onSubmit={async (value) => {
                const { createdAt, updatedAt, ...orderWithoutTimestamps } = row.original;
                void createdAt;
                void updatedAt;
                await onEditOrder(
                  {
                    ...orderWithoutTimestamps,
                    shippingMethod: value as ShippingMethod,
                  },
                  ["shippingMethod"] as CascadeOptions,
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
      accessorKey: "releaseDate",
      id: "releaseDate",
      header: ({ column }) => (
        <DataGridColumnHeader title="Release" visibility={true} column={column} />
      ),
      cell: ({ row }) => {
        const order = row.original;
        return (
          <PopoverDatePickerCell
            value={order.releaseDate}
            dateFormat={dateFormat}
            onSubmit={async (newValue) => {
              const { createdAt, updatedAt, ...orderWithoutTimestamps } = row.original;
              void createdAt;
              void updatedAt;
              await onEditOrder(
                {
                  ...orderWithoutTimestamps,
                  releaseDate: newValue,
                },
                [] as CascadeOptions,
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
        <DataGridColumnHeader title="Order Date" visibility={true} column={column} />
      ),
      cell: ({ row }) => {
        const order = row.original;
        return (
          <PopoverDatePickerCell
            value={order.orderDate}
            dateFormat={dateFormat}
            onSubmit={async (newValue) => {
              const { createdAt, updatedAt, ...orderWithoutTimestamps } = row.original;
              void createdAt;
              void updatedAt;
              await onEditOrder(
                {
                  ...orderWithoutTimestamps,
                  orderDate: newValue,
                },
                ["orderDate"] as CascadeOptions,
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
        <DataGridColumnHeader title="Payment Date" visibility={true} column={column} />
      ),
      cell: ({ row }) => {
        const order = row.original;
        return (
          <PopoverDatePickerCell
            value={order.paymentDate}
            dateFormat={dateFormat}
            onSubmit={async (newValue) => {
              const { createdAt, updatedAt, ...orderWithoutTimestamps } = row.original;
              void createdAt;
              void updatedAt;
              await onEditOrder(
                {
                  ...orderWithoutTimestamps,
                  paymentDate: newValue,
                },
                ["paymentDate"] as CascadeOptions,
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
        <DataGridColumnHeader title="Shipping Date" visibility={true} column={column} />
      ),
      cell: ({ row }) => {
        const order = row.original;
        return (
          <PopoverDatePickerCell
            value={order.shippingDate}
            dateFormat={dateFormat}
            onSubmit={async (newValue) => {
              const { createdAt, updatedAt, ...orderWithoutTimestamps } = row.original;
              void createdAt;
              void updatedAt;
              await onEditOrder(
                {
                  ...orderWithoutTimestamps,
                  shippingDate: newValue,
                },
                ["shippingDate"] as CascadeOptions,
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
        <DataGridColumnHeader title="Collection Date" visibility={true} column={column} />
      ),
      cell: ({ row }) => {
        const order = row.original;
        return (
          <PopoverDatePickerCell
            value={order.collectionDate}
            dateFormat={dateFormat}
            onSubmit={async (newValue) => {
              const { createdAt, updatedAt, ...orderWithoutTimestamps } = row.original;
              void createdAt;
              void updatedAt;
              await onEditOrder(
                {
                  ...orderWithoutTimestamps,
                  collectionDate: newValue,
                },
                ["collectionDate"] as CascadeOptions,
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
        <DataGridColumnHeader title="Items" visibility={true} column={column} />
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
        <DataGridColumnHeader title="Total" visibility={true} column={column} />
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
            total={formatCurrencyFromMinorUnits(order.total, currency)}
            currency={currency}
            locale={locale}
            onSubmit={async (newValues) => {
              const { createdAt, updatedAt, ...orderWithoutTimestamps } = order;
              void createdAt;
              void updatedAt;
              await onEditOrder(
                {
                  ...orderWithoutTimestamps,
                  ...newValues,
                },
                [] as CascadeOptions,
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
        <DataGridColumnHeader title="Shipping Fee" visibility={true} column={column} />
      ),
      cell: ({ row }) => {
        const order = row.original;
        return (
          <InlineCurrencyCell
            value={order.shippingFee}
            currency={currency}
            locale={getCurrencyLocale(currency)}
            onSubmit={async (newValue) => {
              const { createdAt, updatedAt, ...orderWithoutTimestamps } = row.original;
              void createdAt;
              void updatedAt;
              await onEditOrder(
                {
                  ...orderWithoutTimestamps,
                  shippingFee: newValue,
                },
                [] as CascadeOptions,
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
        <DataGridColumnHeader title="Taxes" visibility={true} column={column} />
      ),
      cell: ({ row }) => {
        const order = row.original;
        return (
          <InlineCurrencyCell
            value={order.taxes}
            currency={currency}
            locale={getCurrencyLocale(currency)}
            onSubmit={async (newValue) => {
              const { createdAt, updatedAt, ...orderWithoutTimestamps } = row.original;
              void createdAt;
              void updatedAt;
              await onEditOrder(
                {
                  ...orderWithoutTimestamps,
                  taxes: newValue,
                },
                [] as CascadeOptions,
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
        <DataGridColumnHeader title="Duties" visibility={true} column={column} />
      ),
      cell: ({ row }) => {
        const order = row.original;
        return (
          <InlineCurrencyCell
            value={order.duties}
            currency={currency}
            locale={getCurrencyLocale(currency)}
            onSubmit={async (newValue) => {
              const { createdAt, updatedAt, ...orderWithoutTimestamps } = row.original;
              void createdAt;
              void updatedAt;
              await onEditOrder(
                {
                  ...orderWithoutTimestamps,
                  duties: newValue,
                },
                [] as CascadeOptions,
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
        <DataGridColumnHeader title="Tariffs" visibility={true} column={column} />
      ),
      cell: ({ row }) => {
        const order = row.original;
        return (
          <InlineCurrencyCell
            value={order.tariffs}
            currency={currency}
            locale={getCurrencyLocale(currency)}
            onSubmit={async (newValue) => {
              const { createdAt, updatedAt, ...orderWithoutTimestamps } = row.original;
              void createdAt;
              void updatedAt;
              await onEditOrder(
                {
                  ...orderWithoutTimestamps,
                  tariffs: newValue,
                },
                [] as CascadeOptions,
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
        <DataGridColumnHeader title="Misc Fees" visibility={true} column={column} />
      ),
      cell: ({ row }) => {
        const order = row.original;
        return (
          <InlineCurrencyCell
            value={order.miscFees}
            currency={currency}
            locale={getCurrencyLocale(currency)}
            onSubmit={async (newValue) => {
              const { createdAt, updatedAt, ...orderWithoutTimestamps } = row.original;
              void createdAt;
              void updatedAt;
              await onEditOrder(
                {
                  ...orderWithoutTimestamps,
                  miscFees: newValue,
                },
                [] as CascadeOptions,
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
        <DataGridColumnHeader title="Status" visibility={true} column={column} />
      ),
      cell: ({ row }) => {
        const status = row.original.status;
        return (
          <SelectCell
            value={status}
            options={[...ORDER_STATUSES]}
            onSubmit={async (value) => {
              const { createdAt, updatedAt, ...orderWithoutTimestamps } = row.original;
              void createdAt;
              void updatedAt;
              await onEditOrder(
                {
                  ...orderWithoutTimestamps,
                  status: value as OrderStatus,
                },
                ["status"] as CascadeOptions,
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
              <OrderForm
                renderTrigger={
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                    <Edit className="mr-2 h-4 w-4" />
                    Edit order
                  </DropdownMenuItem>
                }
                type="edit-order"
                orderData={order}
                callbackFn={onEditOrder}
                currency={currency}
              />
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
  ];
}
