import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Copy01Icon,
  Delete02Icon,
  Edit03Icon,
  Loading03Icon,
  MoreHorizontalIcon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import { ItemTitleCell } from "@/components/cells/item-title-cell";
import { SelectionCell, SelectionCheckbox } from "@/components/cells/selection-cell";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLinkItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WriteConfirmDialog } from "@/components/write-confirm-dialog";
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header";
import { cn } from "@/lib/utils";
import type { Currency, DateFormat, OrderStatus } from "@myakiba/contracts/shared/types";
import type { OrderItem } from "@myakiba/contracts/orders/types";
import type { CollectionItemFormValues } from "@myakiba/contracts/collection/types";
import { toast } from "@/components/ui/toast";
import { writeClipboard } from "@/lib/clipboard";
import { Link } from "@tanstack/react-router";
import CollectionItemForm from "../collection/collection-item-form";
import { PopoverDatePickerCell } from "../cells/popover-date-picker-cell";
import { InlineCountCell } from "../cells/inline-count-cell";
import { SelectCell } from "../cells/select-cell";
import { InlineCurrencyCell } from "../cells/inline-currency-cell";
import { InlineReleaseCell } from "../cells/inline-release-cell";
import { withOrderItemPending } from "./order-pending-context";
import { editableCell } from "@/components/data-table/row-pending";
import type { ColumnDef } from "@tanstack/react-table";
import { ORDER_STATUSES } from "@myakiba/contracts/shared/constants";
import { ORDER_STATUS_COLORS } from "@/lib/orders";
import { CategoryLabel, ROW_ACTION_CLASS_NAME } from "@/components/media-tile";
import { Skeleton } from "@/components/ui/skeleton";
import { NUMERIC_COLUMN_META } from "@/components/reui/data-grid/data-grid";
import type { Saving } from "@/data/client";
import { itemDestination } from "@/lib/item-destination";

interface OrderItemSubColumnsParams {
  orderId: string;
  onEditItem: (values: CollectionItemFormValues) => Saving;
  onDeleteItem: (orderId: string, itemId: string) => Saving;
  currency: Currency;
  locale: string;
  dateFormat: DateFormat;
}

function OrderItemActionsCell({
  item,
  isPending,
  orderId,
  onEditItem,
  onDeleteItem,
  currency,
  dateFormat,
}: Pick<
  OrderItemSubColumnsParams,
  "orderId" | "onEditItem" | "onDeleteItem" | "currency" | "dateFormat"
> & {
  readonly item: OrderItem;
  readonly isPending: boolean;
}): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

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
          callbackFn={onEditItem}
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
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => {
                  setMenuOpen(false);
                  setDeleteOpen(true);
                }}
              >
                <HugeiconsIcon icon={Delete02Icon} />
                Remove item
              </DropdownMenuItem>
            </DropdownMenuContent>
          ) : null}
        </DropdownMenu>
      </div>
      <WriteConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Remove item?"
        description="This will remove this item from the order."
        confirmLabel="Remove"
        onConfirm={() => onDeleteItem(orderId, item.id)}
      />
    </>
  );
}

export function createOrderItemSubColumns({
  orderId,
  onEditItem,
  onDeleteItem,
  currency,
  locale,
  dateFormat,
}: OrderItemSubColumnsParams): ColumnDef<OrderItem>[] {
  const editItem = editableCell(withOrderItemPending, (item, field, value) =>
    onEditItem({ ...item, [field]: value }),
  );

  return [
    {
      id: "select",
      header: ({ table }) => (
        <SelectionCheckbox
          label="Select all"
          checked={table.getIsAllPageRowsSelected()}
          indeterminate={table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected()}
          stopRowClick
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(value)}
        />
      ),
      cell: ({ row }) => (
        <SelectionCell selected={row.getIsSelected()}>
          <SelectionCheckbox
            label="Select row"
            checked={row.getIsSelected()}
            stopRowClick
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
      accessorKey: "title",
      accessorFn: (row) => row.itemTitle,
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
            {item.itemCategory ? <CategoryLabel category={item.itemCategory} /> : null}
          </ItemTitleCell>
        );
      },
      enableSorting: true,
      enableHiding: true,
      enableResizing: true,
      size: 300,
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
      cell: editItem("orderDate", (item, edit) => (
        <PopoverDatePickerCell value={item.orderDate} dateFormat={dateFormat} {...edit} />
      )),
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
        skeleton: <Skeleton className="h-6" />,
      },
    },
    {
      accessorKey: "count",
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
        skeleton: <Skeleton className="h-6 w-10" />,
      },
    },
    {
      accessorKey: "status",
      header: ({ column }) => (
        <DataGridColumnHeader title="Status" visibility={true} column={column} />
      ),
      cell: editItem("status", (item, { disabled, onSubmit }) => (
        <SelectCell
          label="Status"
          value={item.status}
          options={[...ORDER_STATUSES]}
          colorMap={ORDER_STATUS_COLORS}
          disabled={disabled}
          onSubmit={(value) => onSubmit(value as OrderStatus)}
        />
      )),
      enableSorting: true,
      enableHiding: true,
      enableResizing: true,
      size: 136,
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
      size: 95,
      meta: {
        ...NUMERIC_COLUMN_META,
        skeleton: <Skeleton className="h-6" />,
      },
    },
    {
      id: "actions",
      header: () => null,
      cell: withOrderItemPending(({ row }, isPending) => {
        const item = row.original;
        return (
          <OrderItemActionsCell
            item={item}
            isPending={isPending}
            orderId={orderId}
            onEditItem={onEditItem}
            onDeleteItem={onDeleteItem}
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
