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
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { InlineTextCell } from "@/components/cells/inline-text-cell";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DataGridColumnHeader } from "@/components/ui/data-grid-column-header";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { getCurrencyLocale } from "@myakiba/utils";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import CollectionItemForm from "./collection-item-form";
import { InlineCurrencyCell } from "../cells/inline-currency-cell";
import { PopoverRatingCell } from "../cells/popover-rating-cell";
import { PopoverDatePickerCell } from "../cells/popover-date-picker-cell";
import { InlineCountCell } from "../cells/inline-count-cell";
import type { CollectionItem, CollectionItemFormValues } from "@myakiba/types";
import type { DateFormat } from "@myakiba/types";
import { getCategoryColor } from "@/lib/category-colors";
import { Skeleton } from "../ui/skeleton";

interface CollectionColumnsParams {
  onEditCollectionItem: (values: CollectionItemFormValues) => Promise<void>;
  onDeleteCollectionItems: (collectionIds: Set<string>) => Promise<void>;
  currency: string;
  dateFormat: DateFormat;
  pendingCollectionIds: ReadonlySet<string>;
}

export function createCollectionColumns({
  onEditCollectionItem,
  onDeleteCollectionItems,
  currency,
  dateFormat,
  pendingCollectionIds,
}: CollectionColumnsParams): ColumnDef<CollectionItem>[] {
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
            aria-label="Select row"
            size="sm"
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
      accessorKey: "itemTitle",
      id: "itemTitle",
      header: ({ column }) => (
        <DataGridColumnHeader title="Item" visibility={true} column={column} />
      ),
      cell: ({ row }) => {
        const item = row.original;
        return (
          <div className="flex items-center gap-3">
            {item.itemImage && (
              <Avatar className="size-8 ">
                <AvatarImage
                  src={item.itemImage}
                  alt={item.itemTitle}
                  className="rounded-sm"
                  style={{ objectFit: "cover", objectPosition: "top" }}
                />
                <AvatarFallback className="rounded-sm">
                  <HugeiconsIcon icon={PackageIcon} className="size-4" />
                </AvatarFallback>
              </Avatar>
            )}
            <div className="space-y-px">
              <Link
                to="/items/$id"
                params={{ id: item.itemId }}
                className="font-medium text-foreground truncate"
              >
                {item.itemTitle}
              </Link>
              <div className="flex items-center gap-1 font-light">
                {item.itemExternalId ? (
                  <a
                    href={`https://myfigurecollection.net/item/${item.itemExternalId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline"
                  >
                    MFC #{item.itemExternalId}
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground">Custom</span>
                )}
                <p className="text-xs" style={{ color: getCategoryColor(item.itemCategory) }}>
                  <span className="text-muted-foreground">•</span> {item.itemCategory}
                </p>
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
        skeleton: <Skeleton className="h-9 w-2/3" />,
      },
    },
    {
      accessorKey: "itemScale",
      id: "itemScale",
      header: ({ column }) => (
        <DataGridColumnHeader title="Scale" visibility={true} column={column} />
      ),
      cell: (info) => (info.getValue() as string | null) || "n/a",
      enableSorting: true,
      enableHiding: true,
      enableResizing: true,
      size: 100,
      meta: {
        skeleton: <Skeleton className="h-6 w-1/2" />,
      },
    },
    {
      accessorKey: "count",
      id: "count",
      header: ({ column }) => (
        <DataGridColumnHeader title="Count" visibility={true} column={column} />
      ),
      cell: ({ row }) => {
        const item = row.original;
        const isPending = pendingCollectionIds.has(item.id);
        return (
          <InlineCountCell
            value={item.count}
            disabled={isPending}
            onSubmit={async (newValue) => {
              await onEditCollectionItem({
                ...item,
                count: newValue,
              });
            }}
          />
        );
      },
      enableSorting: true,
      enableHiding: true,
      enableResizing: true,
      size: 80,
      meta: {
        skeleton: <Skeleton className="h-6" />,
      },
    },
    {
      accessorKey: "score",
      id: "score",
      header: ({ column }) => (
        <DataGridColumnHeader title="Score" visibility={true} column={column} />
      ),
      cell: ({ row }) => {
        const item = row.original;
        const isPending = pendingCollectionIds.has(item.id);
        return (
          <PopoverRatingCell
            value={item.score}
            disabled={isPending}
            onSubmit={async (newValue) => {
              await onEditCollectionItem({
                ...item,
                score: newValue,
              });
            }}
          />
        );
      },
      enableSorting: true,
      enableHiding: true,
      enableResizing: true,
      size: 80,
      meta: {
        skeleton: <Skeleton className="h-6" />,
      },
    },
    {
      accessorKey: "shop",
      id: "shop",
      header: ({ column }) => (
        <DataGridColumnHeader title="Shop" visibility={true} column={column} />
      ),
      cell: ({ row }) => {
        const item = row.original;
        const isPending = pendingCollectionIds.has(item.id);
        return (
          <InlineTextCell
            value={item.shop}
            disabled={isPending}
            onSubmit={async (newValue) => {
              await onEditCollectionItem({
                ...item,
                shop: newValue,
              });
            }}
            validate={(value) => {
              if (!value || value.trim().length === 0) {
                return "Shop cannot be empty";
              }
              return true;
            }}
            previewClassName="text-sm"
          />
        );
      },
      enableSorting: true,
      enableHiding: true,
      enableResizing: true,
      size: 120,
      meta: {
        skeleton: <Skeleton className="h-6" />,
      },
    },
    {
      accessorKey: "price",
      accessorFn: (row) => Number(row.price),
      id: "price",
      header: ({ column }) => (
        <DataGridColumnHeader title="Price" visibility={true} column={column} />
      ),
      cell: ({ row }) => {
        const item = row.original;
        const isPending = pendingCollectionIds.has(item.id);
        return (
          <InlineCurrencyCell
            value={item.price}
            currency={currency}
            onSubmit={async (newValue) => {
              await onEditCollectionItem({
                ...item,
                price: newValue,
              });
            }}
            locale={getCurrencyLocale(currency)}
            disabled={isPending}
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
      accessorKey: "orderDate",
      id: "orderDate",
      header: ({ column }) => (
        <DataGridColumnHeader title="Order Date" visibility={true} column={column} />
      ),
      cell: ({ row }) => {
        const orderDate = row.original.orderDate;
        const isPending = pendingCollectionIds.has(row.original.id);
        return (
          <PopoverDatePickerCell
            value={orderDate}
            dateFormat={dateFormat}
            disabled={isPending}
            onSubmit={async (newValue) => {
              await onEditCollectionItem({
                ...row.original,
                orderDate: newValue,
              });
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
        const paymentDate = row.original.paymentDate;
        const isPending = pendingCollectionIds.has(row.original.id);
        return (
          <PopoverDatePickerCell
            value={paymentDate}
            dateFormat={dateFormat}
            disabled={isPending}
            onSubmit={async (newValue) => {
              await onEditCollectionItem({
                ...row.original,
                paymentDate: newValue,
              });
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
        const shippingDate = row.original.shippingDate;
        const isPending = pendingCollectionIds.has(row.original.id);
        return (
          <PopoverDatePickerCell
            value={shippingDate}
            dateFormat={dateFormat}
            disabled={isPending}
            onSubmit={async (newValue) => {
              await onEditCollectionItem({
                ...row.original,
                shippingDate: newValue,
              });
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
        <DataGridColumnHeader title="Collected" visibility={true} column={column} />
      ),
      cell: ({ row }) => {
        const collectionDate = row.original.collectionDate;
        const isPending = pendingCollectionIds.has(row.original.id);
        return (
          <PopoverDatePickerCell
            value={collectionDate}
            dateFormat={dateFormat}
            disabled={isPending}
            onSubmit={async (newValue) => {
              await onEditCollectionItem({
                ...row.original,
                collectionDate: newValue,
              });
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
      id: "actions",
      header: () => null,
      cell: ({ row }) => {
        const item = row.original;
        const isPending = pendingCollectionIds.has(item.id);

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0" disabled={isPending}>
                <span className="sr-only">Open menu</span>
                <HugeiconsIcon
                  icon={isPending ? Loading03Icon : MoreHorizontalIcon}
                  className={cn("h-4 w-4", isPending && "animate-spin")}
                />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem asChild>
                <Link to="/items/$id" params={{ id: item.itemId }}>
                  <HugeiconsIcon icon={ViewIcon} className="mr-2 h-4 w-4" />
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
                <HugeiconsIcon icon={Copy01Icon} className="mr-2 h-4 w-4" />
                Copy MFC item ID
              </DropdownMenuItem>
              <CollectionItemForm
                renderTrigger={
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()} disabled={isPending}>
                    <HugeiconsIcon icon={Edit01Icon} className="mr-2 h-4 w-4" />
                    {isPending ? "Saving..." : "Edit item"}
                  </DropdownMenuItem>
                }
                itemData={item}
                callbackFn={onEditCollectionItem}
                currency={currency}
                dateFormat={dateFormat}
              />
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                disabled={isPending}
                onClick={() => onDeleteCollectionItems(new Set([item.id]))}
              >
                <HugeiconsIcon icon={Delete02Icon} className="mr-2 h-4 w-4" />
                {isPending ? "Deleting..." : "Delete item"}
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
