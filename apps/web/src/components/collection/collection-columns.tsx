import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Edit03Icon,
  Loading03Icon,
  MoreHorizontalIcon,
  PackageIcon,
} from "@hugeicons/core-free-icons";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { InlineTextCell } from "@/components/cells/inline-text-cell";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header";
import { ImageThumbnail } from "@/components/ui/image-thumbnail";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import CollectionItemForm from "./collection-item-form";
import UnifiedItemMoveForm from "@/components/orders/unified-item-move-form";
import { InlineCurrencyCell } from "../cells/inline-currency-cell";
import { PopoverRatingCell } from "../cells/popover-rating-cell";
import { PopoverDatePickerCell } from "../cells/popover-date-picker-cell";
import { InlineCountCell } from "../cells/inline-count-cell";
import { InlineReleaseCell } from "../cells/inline-release-cell";
import type { CollectionItem, CollectionItemFormValues } from "@myakiba/contracts/collection/types";
import type { CascadeOptions, NewOrder } from "@myakiba/contracts/orders/schema";
import type { Currency, DateFormat } from "@myakiba/contracts/shared/types";
import { getCategoryColor } from "@/lib/category-colors";
import { Skeleton } from "../ui/skeleton";

interface CollectionColumnsParams {
  onEditCollectionItem: (values: CollectionItemFormValues) => Promise<void>;
  onDeleteCollectionItems: (collectionIds: ReadonlySet<string>) => Promise<void>;
  onAddCollectionItemsToOrder: (
    targetOrderId: string,
    collectionIds: ReadonlySet<string>,
    orderIds?: ReadonlySet<string>,
  ) => Promise<void>;
  onAddCollectionItemsToNewOrder: (
    values: NewOrder,
    cascadeOptions: CascadeOptions,
    collectionIds: ReadonlySet<string>,
  ) => Promise<void>;
  currency: Currency;
  locale: string;
  dateFormat: DateFormat;
  isCollectionPending: (collectionId: string) => boolean;
  isCollectionOrderPending: (collectionId: string) => boolean;
}

function CollectionActionsCell({
  item,
  isPending,
  onEditCollectionItem,
  onDeleteCollectionItems,
  onAddCollectionItemsToOrder,
  onAddCollectionItemsToNewOrder,
  currency,
  dateFormat,
}: Pick<
  CollectionColumnsParams,
  | "onEditCollectionItem"
  | "onDeleteCollectionItems"
  | "onAddCollectionItemsToOrder"
  | "onAddCollectionItemsToNewOrder"
  | "currency"
  | "dateFormat"
> & {
  readonly item: CollectionItem;
  readonly isPending: boolean;
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const selectedItems = {
    collectionIds: new Set([item.id]),
    orderIds: item.orderId ? new Set([item.orderId]) : new Set<string>(),
  };

  return (
    <>
      <div className="flex items-center justify-end gap-0.5">
        <CollectionItemForm
          renderTrigger={
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={isPending}
              className="text-muted-foreground"
            >
              <HugeiconsIcon icon={Edit03Icon} className="size-3" />
              <span className="sr-only">Edit item</span>
            </Button>
          }
          itemData={item}
          callbackFn={onEditCollectionItem}
          currency={currency}
          dateFormat={dateFormat}
        />
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon-sm" disabled={isPending}>
                <span className="sr-only">Open menu</span>
                <HugeiconsIcon
                  icon={isPending ? Loading03Icon : MoreHorizontalIcon}
                  className={cn("h-4 w-4", isPending && "animate-spin")}
                />
              </Button>
            }
          />
          {menuOpen ? (
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem>
                  <Link to="/items/$id" params={{ id: item.itemId }}>
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
                  Copy MFC ID
                </DropdownMenuItem>
                <UnifiedItemMoveForm
                  renderTrigger={
                    <DropdownMenuItem closeOnClick={false} disabled={isPending}>
                      {isPending ? "Assigning..." : "Assign Order"}
                    </DropdownMenuItem>
                  }
                  selectedItems={selectedItems}
                  onMoveToExisting={onAddCollectionItemsToOrder}
                  onMoveToNew={onAddCollectionItemsToNewOrder}
                  clearSelections={() => {}}
                  currency={currency}
                  intent="add"
                />
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                disabled={isPending}
                onClick={() => {
                  setMenuOpen(false);
                  setDeleteOpen(true);
                }}
              >
                Delete item
              </DropdownMenuItem>
            </DropdownMenuContent>
          ) : null}
        </DropdownMenu>
      </div>
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        {deleteOpen ? (
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete item?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently remove this item from your collection.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => {
                  setDeleteOpen(false);
                  onDeleteCollectionItems(new Set([item.id]));
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        ) : null}
      </AlertDialog>
    </>
  );
}

export function createCollectionColumns({
  onEditCollectionItem,
  onDeleteCollectionItems,
  onAddCollectionItemsToOrder,
  onAddCollectionItemsToNewOrder,
  currency,
  locale,
  dateFormat,
  isCollectionPending,
  isCollectionOrderPending,
}: CollectionColumnsParams): ColumnDef<CollectionItem>[] {
  return [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          indeterminate={table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected()}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
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
            aria-label="Select row"
            className="align-[inherit] mb-0.5 rounded-xs"
          />
        </>
      ),
      size: 32,
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
            <ImageThumbnail
              images={item.itemImage ? [item.itemImage] : []}
              title={item.itemTitle}
              fallbackIcon={<HugeiconsIcon icon={PackageIcon} className="size-4" />}
              className="size-8 rounded-md"
            />
            <div className="min-w-0 space-y-px">
              <Link
                to="/items/$id"
                params={{ id: item.itemId }}
                className="font-medium text-foreground truncate"
              >
                {item.itemTitle}
              </Link>
              <div className="flex items-center gap-1 font-normal">
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
        skeleton: <Skeleton className="h-6 my-1.5 w-2/3" />,
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
      size: 72,
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
        const isPending = isCollectionPending(item.id) || isCollectionOrderPending(item.id);
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
      size: 65,
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
        const isPending = isCollectionPending(item.id) || isCollectionOrderPending(item.id);
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
      size: 68,
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
        const isPending = isCollectionPending(item.id) || isCollectionOrderPending(item.id);
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
        const isPending = isCollectionPending(item.id) || isCollectionOrderPending(item.id);
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
            locale={locale}
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
      accessorKey: "releaseDate",
      id: "releaseDate",
      header: ({ column }) => (
        <DataGridColumnHeader title="Release" visibility={true} column={column} />
      ),
      cell: ({ row }) => {
        const item = row.original;
        const isPending = isCollectionPending(item.id) || isCollectionOrderPending(item.id);
        return (
          <InlineReleaseCell
            releaseId={item.releaseId}
            itemId={item.itemId}
            fallback={{
              releaseDate: item.releaseDate,
              releaseType: item.releaseType,
              releasePrice: item.releasePrice,
              releaseCurrency: item.releaseCurrency,
              releaseBarcode: item.releaseBarcode,
            }}
            currency={currency}
            dateFormat={dateFormat}
            disabled={isPending}
            onSubmit={async (newReleaseId) => {
              await onEditCollectionItem({
                ...item,
                releaseId: newReleaseId,
              });
            }}
          />
        );
      },
      enableSorting: true,
      enableHiding: true,
      enableResizing: true,
      size: 110,
      meta: {
        headerTitle: "Release",
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
        const isPending =
          isCollectionPending(row.original.id) || isCollectionOrderPending(row.original.id);
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
      cell: ({ row }) => {
        const paymentDate = row.original.paymentDate;
        const isPending =
          isCollectionPending(row.original.id) || isCollectionOrderPending(row.original.id);
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
      cell: ({ row }) => {
        const shippingDate = row.original.shippingDate;
        const isPending =
          isCollectionPending(row.original.id) || isCollectionOrderPending(row.original.id);
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
        <DataGridColumnHeader title="Collected" visibility={true} column={column} />
      ),
      cell: ({ row }) => {
        const collectionDate = row.original.collectionDate;
        const isPending =
          isCollectionPending(row.original.id) || isCollectionOrderPending(row.original.id);
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
      size: 108,
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
        const isPending = isCollectionPending(item.id) || isCollectionOrderPending(item.id);
        return (
          <CollectionActionsCell
            item={item}
            isPending={isPending}
            onEditCollectionItem={onEditCollectionItem}
            onDeleteCollectionItems={onDeleteCollectionItems}
            onAddCollectionItemsToOrder={onAddCollectionItemsToOrder}
            onAddCollectionItemsToNewOrder={onAddCollectionItemsToNewOrder}
            currency={currency}
            dateFormat={dateFormat}
          />
        );
      },
      size: 56,
      enableSorting: false,
      enableHiding: false,
      enableResizing: false,
      meta: {
        skeleton: <Skeleton className="h-4 w-1/2" />,
      },
    },
  ];
}
