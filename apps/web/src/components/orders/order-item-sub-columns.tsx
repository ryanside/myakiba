import { HugeiconsIcon } from "@hugeicons/react";
import {
  Copy01Icon,
  Delete02Icon,
  Edit01Icon,
  Loading03Icon,
  MoreHorizontalIcon,
  PackageIcon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import { ImageThumbnail } from "@/components/ui/image-thumbnail";
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
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header";
import { cn } from "@/lib/utils";
import { formatDate, getCurrencyLocale } from "@myakiba/utils";
import type { DateFormat, OrderItem, CollectionItemFormValues, OrderStatus } from "@myakiba/types";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import CollectionItemForm from "../collection/collection-item-form";
import { PopoverDatePickerCell } from "../cells/popover-date-picker-cell";
import { InlineCountCell } from "../cells/inline-count-cell";
import { SelectCell } from "../cells/select-cell";
import { InlineCurrencyCell } from "../cells/inline-currency-cell";
import type { ColumnDef } from "@tanstack/react-table";
import { ORDER_STATUSES } from "@myakiba/constants";
import { ORDER_STATUS_COLORS } from "@/lib/orders";
import { Skeleton } from "@/components/ui/skeleton";

interface OrderItemSubColumnsParams {
  orderId: string;
  onEditItem: (values: CollectionItemFormValues) => Promise<void>;
  onDeleteItem: (orderId: string, itemId: string) => Promise<void>;
  currency: string;
  dateFormat: DateFormat;
  isCollectionItemPending: (collectionId: string) => boolean;
}

export function createOrderItemSubColumns({
  orderId,
  onEditItem,
  onDeleteItem,
  currency,
  dateFormat,
  isCollectionItemPending,
}: OrderItemSubColumnsParams): ColumnDef<OrderItem>[] {
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
      size: 40,
      enableSorting: false,
      enableHiding: false,
      enableResizing: false,
      meta: {
        skeleton: <Skeleton className="size-5 rounded-xs" />,
      },
    },
    {
      accessorKey: "title",
      header: ({ column }) => (
        <DataGridColumnHeader title="Item" visibility={true} column={column} />
      ),
      cell: ({ row }) => {
        const item = row.original;
        return (
          <div className="flex items-center gap-3">
            <ImageThumbnail
              images={item.itemImage ? [item.itemImage] : []}
              title={item.itemTitle}
              fallbackIcon={<HugeiconsIcon icon={PackageIcon} className="size-4" />}
              className="size-8 rounded-md"
            />
            <div className="min-w-0 space-y-px">
              <Link
                className="font-medium text-foreground truncate"
                to="/items/$id"
                params={{ id: item.itemId }}
              >
                {item.itemTitle}
              </Link>
              <div className="flex items-center gap-1 font-normal">
                {item.itemExternalId ? (
                  <a
                    href={`https://myfigurecollection.net/item/${item.itemExternalId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-muted-foreground font-normal hover:text-foreground transition-colors underline-offset-4 hover:underline"
                  >
                    MFC #{item.itemExternalId}
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground">Custom</span>
                )}
              </div>
            </div>
          </div>
        );
      },
      enableSorting: true,
      enableHiding: true,
      enableResizing: true,
      size: 450,
      meta: {
        skeleton: (
          <div className="flex items-center gap-3">
            <Skeleton className="size-8 rounded-md" />
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3.5 w-16" />
            </div>
          </div>
        ),
      },
    },
    {
      accessorKey: "orderDate",
      header: ({ column }) => (
        <DataGridColumnHeader title="Order Date" visibility={true} column={column} />
      ),
      cell: ({ row }) => {
        const item = row.original;
        const isPending = isCollectionItemPending(item.id);
        return (
          <PopoverDatePickerCell
            value={item.orderDate}
            dateFormat={dateFormat}
            disabled={isPending}
            onSubmit={async (newValue) => {
              await onEditItem({ ...item, orderDate: newValue });
            }}
          />
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
      accessorKey: "releaseDate",
      header: ({ column }) => (
        <DataGridColumnHeader title="Release" visibility={true} column={column} />
      ),
      cell: (info) => formatDate(info.getValue() as string, dateFormat),
      enableSorting: true,
      enableHiding: true,
      enableResizing: true,
      size: 100,
      meta: {
        skeleton: <Skeleton className="h-6" />,
      },
    },
    {
      accessorKey: "count",
      header: ({ column }) => (
        <DataGridColumnHeader title="Count" visibility={true} column={column} />
      ),
      cell: ({ row }) => {
        const item = row.original;
        const isPending = isCollectionItemPending(item.id);
        return (
          <InlineCountCell
            value={item.count}
            disabled={isPending}
            onSubmit={async (newValue) => {
              await onEditItem({ ...item, count: newValue });
            }}
          />
        );
      },
      enableSorting: true,
      enableHiding: true,
      enableResizing: true,
      size: 70,
      meta: {
        skeleton: <Skeleton className="h-6 w-10" />,
      },
    },
    {
      accessorKey: "status",
      header: ({ column }) => (
        <DataGridColumnHeader title="Status" visibility={true} column={column} />
      ),
      cell: ({ row }) => {
        const item = row.original;
        const isPending = isCollectionItemPending(item.id);
        return (
          <SelectCell
            value={item.status}
            options={[...ORDER_STATUSES]}
            colorMap={ORDER_STATUS_COLORS}
            disabled={isPending}
            onSubmit={async (value) => {
              await onEditItem({
                ...item,
                status: value as OrderStatus,
              });
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
      accessorKey: "price",
      accessorFn: (row) => Number(row.price),
      header: ({ column }) => (
        <DataGridColumnHeader title="Price" visibility={true} column={column} />
      ),
      cell: ({ row }) => {
        const item = row.original;
        const isPending = isCollectionItemPending(item.id);
        return (
          <InlineCurrencyCell
            value={item.price}
            currency={currency}
            onSubmit={async (newValue) => {
              await onEditItem({ ...item, price: newValue });
            }}
            locale={getCurrencyLocale(currency)}
            disabled={isPending}
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
      id: "actions",
      header: () => null,
      cell: ({ row }) => {
        const item = row.original;
        const isPending = isCollectionItemPending(item.id);
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
                    to="/items/$id"
                    params={{ id: item.itemId }}
                    className="flex items-center gap-1.5"
                  >
                    <HugeiconsIcon icon={ViewIcon} />
                    View details
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    if (item.itemExternalId) {
                      navigator.clipboard.writeText(item.itemExternalId.toString());
                      toast.success("Copied MFC item ID to clipboard");
                    } else {
                      toast.error("No MFC item ID for custom items");
                    }
                  }}
                >
                  <HugeiconsIcon icon={Copy01Icon} />
                  Copy MFC ID
                </DropdownMenuItem>
                <CollectionItemForm
                  renderTrigger={
                    <DropdownMenuItem closeOnClick={false} disabled={isPending}>
                      <HugeiconsIcon icon={Edit01Icon} />
                      {isPending ? "Saving..." : "Edit item"}
                    </DropdownMenuItem>
                  }
                  itemData={item}
                  callbackFn={onEditItem}
                  currency={currency}
                  dateFormat={dateFormat}
                />
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                disabled={isPending}
                onClick={() => onDeleteItem(orderId, item.id)}
              >
                <HugeiconsIcon icon={Delete02Icon} />
                {isPending ? "Deleting..." : "Delete item"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
      size: 60,
      enableSorting: false,
      enableHiding: false,
      enableResizing: false,
      meta: {
        skeleton: <Skeleton className="h-4 w-1/2" />,
      },
    },
  ];
}
