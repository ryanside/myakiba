import { HugeiconsIcon } from "@hugeicons/react";
import {
  AddSquareIcon,
  ArrowRight01Icon,
  Delete02Icon,
  Edit01Icon,
  Loading03Icon,
  MinusSignSquareIcon,
  MoreHorizontalIcon,
  PackageIcon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link } from "@tanstack/react-router";
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header";
import {
  type ColumnDef,
  type Row,
  type RowSelectionState,
  type OnChangeFn,
} from "@tanstack/react-table";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import type { CascadeOptions, EditedOrder } from "@myakiba/contracts/orders/schema";
import type { OrderListItem } from "@myakiba/contracts/orders/types";
import { OrderForm } from "./order-form";
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
import { orderItemsQueryOptions } from "@/hooks/use-orders";
import { ORDER_ITEM_PAGE_SIZE } from "./order-item-sub-data-grid";

function ExpandButton({ row }: { readonly row: Row<OrderListItem> }) {
  const queryClient = useQueryClient();

  const handlePointerEnter = () => {
    void queryClient.prefetchQuery(
      orderItemsQueryOptions(row.original.orderId, ORDER_ITEM_PAGE_SIZE, 0),
    );
  };

  return row.getCanExpand() ? (
    <Button
      onClick={row.getToggleExpandedHandler()}
      onPointerEnter={handlePointerEnter}
      size="icon-sm"
      variant="ghost"
    >
      {row.getIsExpanded() ? (
        <HugeiconsIcon icon={MinusSignSquareIcon} />
      ) : (
        <HugeiconsIcon icon={AddSquareIcon} />
      )}
    </Button>
  ) : null;
}

interface OrdersColumnsParams {
  onEditOrder: (values: EditedOrder, cascadeOptions: CascadeOptions) => Promise<void>;
  onDeleteOrders: (orderIds: Set<string>) => Promise<void>;
  onEditItem: (values: CollectionItemFormValues) => Promise<void>;
  onDeleteItem: (orderId: string, itemId: string) => Promise<void>;
  currency: Currency;
  locale: string;
  itemSelection: RowSelectionState;
  setItemSelection: OnChangeFn<RowSelectionState>;
  dateFormat: DateFormat;
  isOrderPending: (orderId: string) => boolean;
  isCollectionItemPending: (collectionId: string) => boolean;
}

export function createOrdersColumns({
  onEditOrder,
  onDeleteOrders,
  onEditItem,
  onDeleteItem,
  currency,
  locale,
  itemSelection,
  setItemSelection,
  dateFormat,
  isOrderPending,
  isCollectionItemPending,
}: OrdersColumnsParams): ColumnDef<OrderListItem>[] {
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
          ></div>
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            onClick={(e) => e.stopPropagation()}
            aria-label="Select row"
            className="align-[inherit] mb-0.5 rounded-xs"
          />
        </>
      ),
      size: 30,
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
      cell: ({ row }) => <ExpandButton row={row} />,
      size: 25,
      enableSorting: false,
      enableHiding: false,
      enableResizing: false,
      meta: {
        skeleton: <Skeleton className="size-4 rounded-sm ml-1.5" />,
        expandedContent: (row) => (
          <OrderItemSubDataGrid
            orderId={row.orderId}
            itemSelection={itemSelection}
            setItemSelection={setItemSelection}
            onEditItem={onEditItem}
            onDeleteItem={onDeleteItem}
            isCollectionItemPending={isCollectionItemPending}
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
          <div className="flex items-center gap-3">
            <ImageThumbnail
              images={order.images}
              title={order.title}
              fallbackIcon={<HugeiconsIcon icon={PackageIcon} className="size-4" />}
              className="size-8 rounded-md"
            />
            <div className="min-w-0 flex-1">
              <InlineTextCell
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
              className="shrink-0 rounded-sm p-0.5 text-muted-foreground/60 opacity-0 transition-opacity group-hover/row:opacity-100 hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              aria-label={`View ${order.title}`}
              onClick={(e) => e.stopPropagation()}
            >
              <HugeiconsIcon icon={ArrowRight01Icon} className="size-3.5" strokeWidth={2} />
            </Link>
          </div>
        );
      },
      enableSorting: true,
      enableHiding: true,
      enableResizing: true,
      size: 320,
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
      cell: ({ row }) => (
        <InlineTextCell
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
      ),
      enableSorting: true,
      enableHiding: true,
      enableResizing: true,
      size: 120,
      meta: {
        skeleton: <Skeleton className="h-6" />,
      },
    },
    {
      accessorKey: "shippingMethod",
      id: "shippingMethod",
      header: ({ column }) => (
        <DataGridColumnHeader title="Shipping Method" visibility={true} column={column} />
      ),
      cell: ({ row }) => {
        const order = row.original;
        const isPending = isOrderPending(order.orderId);
        return (
          <div className="space-y-px">
            <SelectCell
              value={order.shippingMethod}
              options={[...SHIPPING_METHODS]}
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
      },
      enableSorting: true,
      enableHiding: true,
      enableResizing: true,
      size: 115,
      meta: {
        skeleton: <Skeleton className="h-6" />,
      },
    },
    {
      accessorKey: "releaseDate",
      id: "releaseDate",
      header: ({ column }) => (
        <DataGridColumnHeader title="Release" visibility={true} column={column} />
      ),
      cell: ({ row }) => {
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
      },
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
      cell: ({ row }) => {
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
      },
      enableSorting: true,
      enableHiding: true,
      enableResizing: true,
      size: 120,
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
      cell: ({ row }) => {
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
      },
      enableSorting: true,
      enableHiding: true,
      enableResizing: true,
      size: 120,
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
      cell: ({ row }) => {
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
      },
      enableSorting: true,
      enableHiding: true,
      enableResizing: true,
      size: 120,
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
      cell: ({ row }) => {
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
      },
      enableSorting: true,
      enableHiding: true,
      enableResizing: true,
      size: 120,
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
      cell: ({ row }) => {
        const { itemCount } = row.original;
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
      meta: {
        skeleton: <Skeleton className="h-6" />,
      },
    },
    {
      accessorKey: "total",
      id: "total",
      header: ({ column }) => (
        <DataGridColumnHeader title="Total" visibility={true} column={column} />
      ),
      cell: ({ row }) => {
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
            total={formatCurrencyFromMinorUnits(order.total, currency, locale)}
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
      },
      enableSorting: true,
      enableHiding: true,
      enableResizing: true,
      size: 100,
      meta: {
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
      cell: ({ row }) => {
        const order = row.original;
        const isPending = isOrderPending(order.orderId);
        return (
          <InlineCurrencyCell
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
      },
      enableSorting: true,
      enableHiding: true,
      enableResizing: true,
      size: 100,
      meta: {
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
      cell: ({ row }) => {
        const order = row.original;
        const isPending = isOrderPending(order.orderId);
        return (
          <InlineCurrencyCell
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
      },
      enableSorting: true,
      enableHiding: true,
      enableResizing: true,
      size: 100,
      meta: {
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
      cell: ({ row }) => {
        const order = row.original;
        const isPending = isOrderPending(order.orderId);
        return (
          <InlineCurrencyCell
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
      },
      enableSorting: true,
      enableHiding: true,
      enableResizing: true,
      size: 100,
      meta: {
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
      cell: ({ row }) => {
        const order = row.original;
        const isPending = isOrderPending(order.orderId);
        return (
          <InlineCurrencyCell
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
      },
      enableSorting: true,
      enableHiding: true,
      enableResizing: true,
      size: 100,
      meta: {
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
      cell: ({ row }) => {
        const order = row.original;
        const isPending = isOrderPending(order.orderId);
        return (
          <InlineCurrencyCell
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
      },
      enableSorting: true,
      enableHiding: true,
      enableResizing: true,
      size: 100,
      meta: {
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
      cell: ({ row }) => {
        const status = row.original.status;
        const isPending = isOrderPending(row.original.orderId);
        return (
          <SelectCell
            value={status}
            options={[...ORDER_STATUSES]}
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
      },
      enableSorting: true,
      enableHiding: true,
      enableResizing: true,
      size: 90,
      meta: {
        skeleton: <Skeleton className="h-6" />,
      },
    },
    {
      id: "actions",
      header: () => null,
      cell: ({ row }) => {
        const order = row.original;
        const isPending = isOrderPending(order.orderId);

        return (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" className="h-8 w-8 p-0" disabled={isPending}>
                  <span className="sr-only">Open menu</span>
                  <HugeiconsIcon
                    icon={isPending ? Loading03Icon : MoreHorizontalIcon}
                    className={cn("h-4 w-4", isPending && "animate-spin")}
                  />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuItem>
                  <Link
                    to="/orders/$id"
                    params={{ id: order.orderId }}
                    className="flex items-center gap-1.5"
                  >
                    <HugeiconsIcon icon={ViewIcon} />
                    View details
                  </Link>
                </DropdownMenuItem>
                <OrderForm
                  renderTrigger={
                    <DropdownMenuItem closeOnClick={false} disabled={isPending}>
                      <HugeiconsIcon icon={Edit01Icon} />
                      {isPending ? "Saving..." : "Edit order"}
                    </DropdownMenuItem>
                  }
                  type="edit-order"
                  orderData={order}
                  callbackFn={onEditOrder}
                  currency={currency}
                />
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                disabled={isPending}
                onClick={() => onDeleteOrders(new Set([order.orderId]))}
              >
                <HugeiconsIcon icon={Delete02Icon} />
                {isPending ? "Deleting..." : "Delete order"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
      size: 50,
      enableSorting: false,
      enableHiding: false,
      enableResizing: false,
      meta: {
        skeleton: <Skeleton className="h-4 w-1/2" />,
      },
    },
  ];
}
