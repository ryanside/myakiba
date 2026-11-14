import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Copy01Icon,
  Delete02Icon,
  Edit03Icon,
  FolderAddIcon,
  Loading03Icon,
  MoreHorizontalIcon,
  MoveIcon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import { ItemTitleCell } from "@/components/cells/item-title-cell";
import { SelectionCell, SelectionCheckbox } from "@/components/cells/selection-cell";
import { Button } from "@/components/ui/button";
import { InlineShopCell } from "@/components/shop-fields";
import { EmptyValue } from "@/components/cells/empty-value";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLinkItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WriteConfirmDialog } from "@/components/write-confirm-dialog";
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "@/components/ui/toast";
import { writeClipboard } from "@/lib/clipboard";
import CollectionItemForm from "./collection-item-form";
import { withCollectionPending } from "./collection-pending-context";
import { editableCell } from "@/components/data-table/row-pending";
import UnifiedItemMoveForm from "@/components/orders/unified-item-move-form";
import { InlineCurrencyCell } from "../cells/inline-currency-cell";
import { PopoverRatingCell } from "../cells/popover-rating-cell";
import { PopoverDatePickerCell } from "../cells/popover-date-picker-cell";
import { InlineCountCell } from "../cells/inline-count-cell";
import { InlineReleaseCell } from "../cells/inline-release-cell";
import type { CollectionItem, CollectionItemFormValues } from "@myakiba/contracts/collection/types";
import type { CascadeOptions, NewOrder } from "@myakiba/contracts/orders/schema";
import type { Currency, DateFormat } from "@myakiba/contracts/shared/types";
import { CategoryLabel, ROW_ACTION_CLASS_NAME } from "@/components/media-tile";
import { Skeleton } from "../ui/skeleton";
import { AddToListsDialog } from "@/components/lists/add-to-lists-dialog";
import type { Saving } from "@/data/client";
import { NO_SCALE } from "@myakiba/contracts/shared/scale";
import { NUMERIC_COLUMN_META } from "@/components/reui/data-grid/data-grid";
import { itemDestination } from "@/lib/item-destination";

interface CollectionColumnsParams {
  onEditCollectionItem: (values: CollectionItemFormValues) => Saving;
  onDeleteCollectionItems: (collectionIds: ReadonlySet<string>) => Saving;
  onAddCollectionItemsToOrder: (
    targetOrderId: string,
    collectionIds: ReadonlySet<string>,
    orderIds?: ReadonlySet<string>,
  ) => Saving;
  onAddCollectionItemsToNewOrder: (
    values: NewOrder,
    cascadeOptions: CascadeOptions,
    collectionIds: ReadonlySet<string>,
  ) => Saving;
  currency: Currency;
  locale: string;
  dateFormat: DateFormat;
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
}): React.JSX.Element {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [addToListsOpen, setAddToListsOpen] = useState(false);
  const [assignOrderOpen, setAssignOrderOpen] = useState(false);
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
              className={ROW_ACTION_CLASS_NAME}
            >
              <HugeiconsIcon icon={Edit03Icon} />
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
                  className={cn(isPending && "animate-spin")}
                />
              </Button>
            }
          />
          {menuOpen ? (
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuLinkItem
                  render={<Link {...itemDestination(item.itemId, item.itemExternalId)} />}
                >
                  <HugeiconsIcon icon={ViewIcon} />
                  View details
                </DropdownMenuLinkItem>
                <DropdownMenuItem
                  onClick={async () => {
                    if (item.itemExternalId === null) {
                      toast.add({ type: "error", title: "No MFC item ID for custom items" });
                      return;
                    }

                    const copied = await writeClipboard(String(item.itemExternalId));
                    if (copied.isErr()) {
                      toast.add({
                        type: "error",
                        title: "Could not copy MFC item ID to clipboard",
                      });
                      return;
                    }

                    toast.add({ type: "success", title: "Copied MFC item ID to clipboard" });
                  }}
                >
                  <HugeiconsIcon icon={Copy01Icon} />
                  Copy MFC ID
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setMenuOpen(false);
                    setAddToListsOpen(true);
                  }}
                >
                  <HugeiconsIcon icon={FolderAddIcon} />
                  Add to List
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setMenuOpen(false);
                    setAssignOrderOpen(true);
                  }}
                >
                  <HugeiconsIcon icon={MoveIcon} />
                  Assign order
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => {
                    setMenuOpen(false);
                    setDeleteOpen(true);
                  }}
                >
                  <HugeiconsIcon icon={Delete02Icon} />
                  Delete item
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          ) : null}
        </DropdownMenu>
      </div>
      <UnifiedItemMoveForm
        open={assignOrderOpen}
        onOpenChange={setAssignOrderOpen}
        selectedItems={selectedItems}
        onMoveToExisting={onAddCollectionItemsToOrder}
        onMoveToNew={onAddCollectionItemsToNewOrder}
        currency={currency}
        intent="add"
      />
      <AddToListsDialog
        open={addToListsOpen}
        onOpenChange={setAddToListsOpen}
        targets={[{ type: "collectionItem", id: item.id }]}
        targetTitle={item.itemTitle}
      />
      <WriteConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete item?"
        description="This will permanently remove this item from your collection."
        onConfirm={() => onDeleteCollectionItems(new Set([item.id]))}
      />
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
}: CollectionColumnsParams): ColumnDef<CollectionItem>[] {
  const editItem = editableCell(withCollectionPending, (item, field, value) =>
    onEditCollectionItem({ ...item, [field]: value }),
  );

  return [
    {
      id: "select",
      header: ({ table }) => (
        <SelectionCheckbox
          label="Select all"
          checked={table.getIsAllPageRowsSelected()}
          indeterminate={table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected()}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(value)}
        />
      ),
      cell: ({ row }) => (
        <SelectionCell selected={row.getIsSelected()}>
          <SelectionCheckbox
            label="Select row"
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(value)}
          />
        </SelectionCell>
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
          <ItemTitleCell
            itemId={item.itemId}
            title={item.itemTitle}
            externalId={item.itemExternalId}
            image={item.itemImage}
          >
            <CategoryLabel category={item.itemCategory} />
          </ItemTitleCell>
        );
      },
      enableSorting: true,
      enableHiding: true,
      enableResizing: true,
      size: 420,
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
      cell: (info) => {
        const scale = info.getValue() as string | null;
        return scale && scale !== NO_SCALE ? scale : <EmptyValue />;
      },
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
      cell: editItem("count", (item, edit) => (
        <InlineCountCell label="Count" value={item.count} {...edit} />
      )),
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
      accessorKey: "score",
      id: "score",
      header: ({ column }) => (
        <DataGridColumnHeader title="Score" visibility={true} column={column} />
      ),
      cell: editItem("score", (item, edit) => <PopoverRatingCell value={item.score} {...edit} />),
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
      accessorKey: "shop",
      id: "shop",
      header: ({ column }) => (
        <DataGridColumnHeader title="Shop" visibility={true} column={column} />
      ),
      cell: editItem("shop", (item, edit) => (
        <InlineShopCell value={item.shop} {...edit} previewClassName="text-sm" />
      )),
      enableSorting: true,
      enableHiding: true,
      enableResizing: true,
      size: 168,
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
      cell: editItem("price", (item, edit) => (
        <InlineCurrencyCell
          label="Price"
          value={item.price}
          currency={currency}
          locale={locale}
          {...edit}
          zeroAsEmpty
        />
      )),
      enableSorting: true,
      enableHiding: true,
      enableResizing: true,
      size: 100,
      meta: {
        ...NUMERIC_COLUMN_META,
        skeleton: <Skeleton className="h-6" />,
      },
    },
    {
      accessorKey: "releaseDate",
      id: "releaseDate",
      header: ({ column }) => (
        <DataGridColumnHeader title="Release" visibility={true} column={column} />
      ),
      cell: editItem("releaseId", (item, edit) => (
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
          {...edit}
        />
      )),
      enableSorting: true,
      enableHiding: true,
      enableResizing: true,
      size: 136,
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
      cell: editItem("orderDate", (item, edit) => (
        <PopoverDatePickerCell value={item.orderDate} dateFormat={dateFormat} {...edit} />
      )),
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
      cell: editItem("paymentDate", (item, edit) => (
        <PopoverDatePickerCell value={item.paymentDate} dateFormat={dateFormat} {...edit} />
      )),
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
      cell: editItem("shippingDate", (item, edit) => (
        <PopoverDatePickerCell value={item.shippingDate} dateFormat={dateFormat} {...edit} />
      )),
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
      cell: editItem("collectionDate", (item, edit) => (
        <PopoverDatePickerCell value={item.collectionDate} dateFormat={dateFormat} {...edit} />
      )),
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
      cell: withCollectionPending(({ row }, isPending) => {
        const item = row.original;
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
