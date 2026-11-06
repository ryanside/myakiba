import { createContext } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon, PackageIcon } from "@hugeicons/core-free-icons";
import { Checkbox } from "@/components/ui/checkbox";
import { Link } from "@tanstack/react-router";
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import { cn } from "@/lib/utils";
import type { CascadeOptions, EditedOrder } from "@myakiba/contracts/orders/schema";
import type { Order } from "@myakiba/contracts/orders/types";
import { OrderItemSubDataGrid } from "./order-item-sub-data-grid";
import { PopoverMultiInputCell } from "../cells/popover-multi-input-cell";
import { SelectCell } from "../cells/select-cell";
import { InlineTextCell } from "../cells/inline-text-cell";
import { InlineCurrencyCell } from "../cells/inline-currency-cell";
import { PopoverDatePickerCell } from "../cells/popover-date-picker-cell";
import { PopoverReleaseDateCell } from "../cells/popover-release-date-cell";
import type { CollectionItemFormValues } from "@myakiba/contracts/collection/types";
import { SHIPPING_METHODS, ORDER_STATUSES } from "@myakiba/contracts/shared/constants";
import { ORDER_STATUS_COLORS } from "@/lib/orders";
import type {
  Currency,
  ShippingMethod,
  OrderStatus,
  DateFormat,
} from "@myakiba/contracts/shared/types";
import { Skeleton } from "../ui/skeleton";
import { ImageThumbnail } from "../ui/image-thumbnail";
import { RowExpandButton } from "@/components/data-table/row-expand-button";
import { NUMERIC_COLUMN_META } from "@/components/reui/data-grid/data-grid";
import { OrderActionsCell, OrderItemCountCell } from "./order-row-cells";

const SHIPPING_METHOD_OPTIONS = [...SHIPPING_METHODS];
const ORDER_STATUS_OPTIONS = [...ORDER_STATUSES];

export const OrderItemSelectionContext = createContext<{
  selectedOrderIdByCollectionId: ReadonlyMap<string, string>;
  setSelectedOrderIdByCollectionId: Dispatch<SetStateAction<Map<string, string>>>;
} | null>(null);

interface OrdersColumnsParams {
  onEditOrder: (values: EditedOrder, cascadeOptions: CascadeOptions) => Promise<void>;
  onDeleteOrders: (orderIds: ReadonlySet<string>) => Promise<void>;
  onEditItem: (values: CollectionItemFormValues) => Promise<void>;
  onDeleteItem: (orderId: string, itemId: string) => Promise<void>;
  currency: Currency;
  locale: string;
  dateFormat: DateFormat;
}

interface OrdersPendingState {
  isOrderPending: (orderId: string) => boolean;
  isCollectionItemPending: (collectionId: string) => boolean;
}

export const OrderPendingContext = createContext<OrdersPendingState>({
  isOrderPending: () => false,
  isCollectionItemPending: () => false,
});

function withOrderPending(
  render: (context: CellContext<Order, unknown>, pending: OrdersPendingState) => ReactNode,
) {
  return (context: CellContext<Order, unknown>) => (
    <OrderPendingContext.Consumer>
      {(pending) => render(context, pending)}
    </OrderPendingContext.Consumer>
  );
}

export function createOrdersColumns({
  onEditOrder,
  onDeleteOrders,
  onEditItem,
  onDeleteItem,
  currency,
  locale,
  dateFormat,
}: OrdersColumnsParams): ColumnDef<Order>[] {
  return [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          indeterminate={table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected()}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          onClick={(e) => e.stopPropagation()}
          aria-label="Select all"
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
          />
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            onClick={(e) => e.stopPropagation()}
            aria-label="Select row"
            className="align-[inherit] mb-0.5 rounded-xs"
          />
        </>
      ),
      size: 28,
      enableSorting: false,
      enableHiding: false,
      enableResizing: false,
      meta: {
        skeleton: <Skeleton className="size-4 rounded-xs" />,
      },
    },
    {
      id: "expand",
      header: () => null,
      cell: ({ row }) => <RowExpandButton row={row} />,
      size: 24,
      enableSorting: false,
      enableHiding: false,
      enableResizing: false,
      meta: {
        skeleton: <Skeleton className="size-4 rounded-sm ml-1.5" />,
        expandedContent: (row) => (
          <OrderItemSelectionContext.Consumer>
            {(itemSelection) => {
              if (!itemSelection) {
                throw new Error(
                  "Order item grids must be rendered within OrderItemSelectionContext",
                );
              }

              return (
                <OrderPendingContext.Consumer>
                  {({ isCollectionItemPending }) => (
                    <OrderItemSubDataGrid
                      orderId={row.orderId}
                      selectedOrderIdByCollectionId={itemSelection.selectedOrderIdByCollectionId}
                      setSelectedOrderIdByCollectionId={
                        itemSelection.setSelectedOrderIdByCollectionId
                      }
                      onEditItem={onEditItem}
                      onDeleteItem={onDeleteItem}
                      isCollectionItemPending={isCollectionItemPending}
                    />
                  )}
                </OrderPendingContext.Consumer>
              );
            }}
          </OrderItemSelectionContext.Consumer>
        ),
      },
    },
    {
      accessorKey: "title",
      id: "title",
      header: ({ column }) => (
        <DataGridColumnHeader title="Order" visibility={true} column={column} />
      ),
      cell: withOrderPending(({ row }, { isOrderPending }) => {
        const order = row.original;
        return (
          <div className="flex items-center gap-3 pe-4">
            <Link
              to="/orders/$id"
              params={{ id: order.orderId }}
              aria-label={`View ${order.title}`}
              onClick={(e) => e.stopPropagation()}
            >
              <ImageThumbnail
                images={order.images}
                title={order.title}
                fallbackIcon={<HugeiconsIcon icon={PackageIcon} className="size-4" />}
                className="size-8 shrink-0 rounded-md"
                showRemainingCount
              />
            </Link>
            <div className="min-w-0 flex-1">
              <InlineTextCell
                label="Order title"
                value={order.title}
                disabled={isOrderPending(order.orderId)}
                onSubmit={async (newValue) => {
                  const { createdAt, updatedAt, ...orderWithoutTimestamps } = order;
                  void createdAt;
                  void updatedAt;
                  await onEditOrder(
                    {
                      ...orderWithoutTimestamps,
                      title: newValue,
                    },
                    [] as CascadeOptions,
                  );
                }}
                validate={(value) => {
                  if (!value || value.trim().length === 0) {
                    return "Order title cannot be empty";
                  }
                  return true;
                }}
                previewClassName="text-sm font-medium"
              />
            </div>
            <Link
              to="/orders/$id"
              params={{ id: order.orderId }}
              className="shrink-0 rounded-sm p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover/row:opacity-100 hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              aria-label={`View ${order.title}`}
              onClick={(e) => e.stopPropagation()}
            >
              <HugeiconsIcon icon={ArrowRight01Icon} className="size-3.5" strokeWidth={2} />
            </Link>
          </div>
        );
      }),
      enableSorting: true,
      enableHiding: true,
      enableResizing: true,
      size: 264,
      meta: {
        skeleton: <Skeleton className="h-6 my-1" />,
      },
    },
    {
      accessorKey: "shop",
      id: "shop",
      header: ({ column }) => (
        <DataGridColumnHeader title="Shop" visibility={true} column={column} />
      ),
      cell: withOrderPending(({ row }, { isOrderPending }) => {
        return (
          <InlineTextCell
            label="Shop"
            value={row.original.shop}
            disabled={isOrderPending(row.original.orderId)}
            onSubmit={async (newValue) => {
              const { createdAt, updatedAt, ...orderWithoutTimestamps } = row.original;
              void createdAt;
              void updatedAt;
              await onEditOrder(
                {
                  ...orderWithoutTimestamps,
                  shop: newValue,
                },
                ["shop"] as CascadeOptions,
              );
            }}
          />
        );
      }),
      enableSorting: true,
      enableHiding: true,
      enableResizing: true,
      size: 152,
      meta: {
        skeleton: <Skeleton className="h-6" />,
      },
    },
    {
      accessorKey: "shippingMethod",
      id: "shippingMethod",
      header: ({ column }) => (
        <DataGridColumnHeader title="Shipping" visibility={true} column={column} />
      ),
      cell: withOrderPending(({ row }, { isOrderPending }) => {
        const order = row.original;
        const isPending = isOrderPending(order.orderId);
        return (
          <div className="space-y-px">
            <SelectCell
              label="Shipping method"
              value={order.shippingMethod}
              options={SHIPPING_METHOD_OPTIONS}
              disabled={isPending}
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
      }),
      enableSorting: true,
      enableHiding: true,
      enableResizing: true,
      size: 115,
      meta: {
        headerTitle: "Shipping Method",
        skeleton: <Skeleton className="h-6" />,
      },
    },
    {
      accessorKey: "releaseDate",
      id: "releaseDate",
      header: ({ column }) => (
        <DataGridColumnHeader title="Release" visibility={true} column={column} />
      ),
      cell: withOrderPending(({ row }, { isOrderPending }) => {
        const order = row.original;
        const isPending = isOrderPending(order.orderId);
        return (
          <PopoverReleaseDateCell
            value={order.releaseDate}
            dateFormat={dateFormat}
            disabled={isPending}
            orderId={order.orderId}
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
      }),
      enableSorting: true,
      enableHiding: true,
      enableResizing: true,
      size: 95,
      meta: {
        skeleton: <Skeleton className="h-6" />,
      },
    },
    {
      accessorKey: "orderDate",
      id: "orderDate",
      header: ({ column }) => (
        <DataGridColumnHeader title="Order Date" visibility={true} column={column} />
      ),
      cell: withOrderPending(({ row }, { isOrderPending }) => {
        const order = row.original;
        const isPending = isOrderPending(order.orderId);
        return (
          <PopoverDatePickerCell
            value={order.orderDate}
            dateFormat={dateFormat}
            disabled={isPending}
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
      }),
      enableSorting: true,
      enableHiding: true,
      enableResizing: true,
      size: 108,
      meta: {
        headerTitle: "Order Date",
        skeleton: <Skeleton className="h-6" />,
      },
    },
    {
      accessorKey: "paymentDate",
      id: "paymentDate",
      header: ({ column }) => (
        <DataGridColumnHeader title="Payment Date" visibility={true} column={column} />
      ),
      cell: withOrderPending(({ row }, { isOrderPending }) => {
        const order = row.original;
        const isPending = isOrderPending(order.orderId);
        return (
          <PopoverDatePickerCell
            value={order.paymentDate}
            dateFormat={dateFormat}
            disabled={isPending}
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
      }),
      enableSorting: true,
      enableHiding: true,
      enableResizing: true,
      size: 108,
      meta: {
        headerTitle: "Payment Date",
        skeleton: <Skeleton className="h-6" />,
      },
    },
    {
      accessorKey: "shippingDate",
      id: "shippingDate",
      header: ({ column }) => (
        <DataGridColumnHeader title="Shipping Date" visibility={true} column={column} />
      ),
      cell: withOrderPending(({ row }, { isOrderPending }) => {
        const order = row.original;
        const isPending = isOrderPending(order.orderId);
        return (
          <PopoverDatePickerCell
            value={order.shippingDate}
            dateFormat={dateFormat}
            disabled={isPending}
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
      }),
      enableSorting: true,
      enableHiding: true,
      enableResizing: true,
      size: 108,
      meta: {
        headerTitle: "Shipping Date",
        skeleton: <Skeleton className="h-6" />,
      },
    },
    {
      accessorKey: "collectionDate",
      id: "collectionDate",
      header: ({ column }) => (
        <DataGridColumnHeader title="Collection Date" visibility={true} column={column} />
      ),
      cell: withOrderPending(({ row }, { isOrderPending }) => {
        const order = row.original;
        const isPending = isOrderPending(order.orderId);
        return (
          <PopoverDatePickerCell
            value={order.collectionDate}
            dateFormat={dateFormat}
            disabled={isPending}
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
      }),
      enableSorting: true,
      enableHiding: true,
      enableResizing: true,
      size: 108,
      meta: {
        headerTitle: "Collection Date",
        skeleton: <Skeleton className="h-6" />,
      },
    },
    {
      accessorKey: "itemCount",
      id: "itemCount",
      header: ({ column }) => (
        <DataGridColumnHeader title="Items" visibility={true} column={column} />
      ),
      cell: ({ row }) => <OrderItemCountCell row={row} />,
      enableSorting: true,
      enableHiding: true,
      enableResizing: true,
      size: 88,
      meta: {
        ...NUMERIC_COLUMN_META,
        skeleton: <Skeleton className="h-6" />,
      },
    },
    {
      accessorKey: "total",
      id: "total",
      header: ({ column }) => (
        <DataGridColumnHeader title="Total" visibility={true} column={column} />
      ),
      cell: withOrderPending(({ row }, { isOrderPending }) => {
        const order = row.original;
        const isPending = isOrderPending(order.orderId);
        const inputs = [
          {
            title: "Shipping",
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
            title: "Miscellaneous",
            name: "miscFees",
            type: "currency" as const,
            value: order.miscFees,
          },
        ];
        return (
          <PopoverMultiInputCell
            inputs={inputs}
            title="Fees & Charges"
            description="Expand order to edit item prices"
            totalAmount={order.total}
            currency={currency}
            locale={locale}
            disabled={isPending}
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
      }),
      enableSorting: true,
      enableHiding: true,
      enableResizing: true,
      // Wide enough for a seven-figure total in any currency; figures never truncate.
      size: 128,
      meta: {
        ...NUMERIC_COLUMN_META,
        headerTitle: "Total",
        skeleton: <Skeleton className="h-6" />,
      },
    },
    {
      accessorKey: "shippingFee",
      accessorFn: (row) => Number(row.shippingFee),
      id: "shippingFee",
      header: ({ column }) => (
        <DataGridColumnHeader title="Shipping Fee" visibility={true} column={column} />
      ),
      cell: withOrderPending(({ row }, { isOrderPending }) => {
        const order = row.original;
        const isPending = isOrderPending(order.orderId);
        return (
          <InlineCurrencyCell
            label="Shipping fee"
            value={order.shippingFee}
            currency={currency}
            locale={locale}
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
            disabled={isPending}
          />
        );
      }),
      enableSorting: true,
      enableHiding: true,
      enableResizing: true,
      size: 90,
      meta: {
        ...NUMERIC_COLUMN_META,
        headerTitle: "Shipping Fee",
        skeleton: <Skeleton className="h-6" />,
      },
    },
    {
      accessorKey: "taxes",
      accessorFn: (row) => Number(row.taxes),
      id: "taxes",
      header: ({ column }) => (
        <DataGridColumnHeader title="Taxes" visibility={true} column={column} />
      ),
      cell: withOrderPending(({ row }, { isOrderPending }) => {
        const order = row.original;
        const isPending = isOrderPending(order.orderId);
        return (
          <InlineCurrencyCell
            label="Taxes"
            value={order.taxes}
            currency={currency}
            locale={locale}
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
            disabled={isPending}
          />
        );
      }),
      enableSorting: true,
      enableHiding: true,
      enableResizing: true,
      size: 90,
      meta: {
        ...NUMERIC_COLUMN_META,
        headerTitle: "Taxes",
        skeleton: <Skeleton className="h-6" />,
      },
    },
    {
      accessorKey: "duties",
      accessorFn: (row) => Number(row.duties),
      id: "duties",
      header: ({ column }) => (
        <DataGridColumnHeader title="Duties" visibility={true} column={column} />
      ),
      cell: withOrderPending(({ row }, { isOrderPending }) => {
        const order = row.original;
        const isPending = isOrderPending(order.orderId);
        return (
          <InlineCurrencyCell
            label="Duties"
            value={order.duties}
            currency={currency}
            locale={locale}
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
            disabled={isPending}
          />
        );
      }),
      enableSorting: true,
      enableHiding: true,
      enableResizing: true,
      size: 90,
      meta: {
        ...NUMERIC_COLUMN_META,
        headerTitle: "Duties",
        skeleton: <Skeleton className="h-6" />,
      },
    },
    {
      accessorKey: "tariffs",
      accessorFn: (row) => Number(row.tariffs),
      id: "tariffs",
      header: ({ column }) => (
        <DataGridColumnHeader title="Tariffs" visibility={true} column={column} />
      ),
      cell: withOrderPending(({ row }, { isOrderPending }) => {
        const order = row.original;
        const isPending = isOrderPending(order.orderId);
        return (
          <InlineCurrencyCell
            label="Tariffs"
            value={order.tariffs}
            currency={currency}
            locale={locale}
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
            disabled={isPending}
          />
        );
      }),
      enableSorting: true,
      enableHiding: true,
      enableResizing: true,
      size: 90,
      meta: {
        ...NUMERIC_COLUMN_META,
        headerTitle: "Tariffs",
        skeleton: <Skeleton className="h-6" />,
      },
    },
    {
      accessorKey: "miscFees",
      accessorFn: (row) => Number(row.miscFees),
      id: "miscFees",
      header: ({ column }) => (
        <DataGridColumnHeader title="Misc Fees" visibility={true} column={column} />
      ),
      cell: withOrderPending(({ row }, { isOrderPending }) => {
        const order = row.original;
        const isPending = isOrderPending(order.orderId);
        return (
          <InlineCurrencyCell
            label="Other fees"
            value={order.miscFees}
            currency={currency}
            locale={locale}
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
            disabled={isPending}
          />
        );
      }),
      enableSorting: true,
      enableHiding: true,
      enableResizing: true,
      size: 90,
      meta: {
        ...NUMERIC_COLUMN_META,
        headerTitle: "Misc Fees",
        skeleton: <Skeleton className="h-6" />,
      },
    },
    {
      accessorKey: "status",
      id: "status",
      header: ({ column }) => (
        <DataGridColumnHeader title="Status" visibility={true} column={column} />
      ),
      cell: withOrderPending(({ row }, { isOrderPending }) => {
        const status = row.original.status;
        const isPending = isOrderPending(row.original.orderId);
        return (
          <SelectCell
            label="Status"
            value={status}
            options={ORDER_STATUS_OPTIONS}
            colorMap={ORDER_STATUS_COLORS}
            disabled={isPending}
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
      }),
      enableSorting: true,
      enableHiding: true,
      enableResizing: true,
      size: 136,
      meta: {
        skeleton: <Skeleton className="h-6" />,
      },
    },
    {
      id: "actions",
      header: () => null,
      cell: withOrderPending(({ row }, { isOrderPending }) => {
        const order = row.original;
        const isPending = isOrderPending(order.orderId);
        return (
          <OrderActionsCell
            order={order}
            isPending={isPending}
            onEditOrder={onEditOrder}
            onDeleteOrders={onDeleteOrders}
            currency={currency}
          />
        );
      }),
      size: 72,
      enableSorting: false,
      enableHiding: false,
      enableResizing: false,
      meta: {
        skeleton: <Skeleton className="h-4 w-1/2" />,
      },
    },
  ];
}
