import {
  Delete02Icon,
  Edit03Icon,
  FolderAddIcon,
  Loading03Icon,
  MoreHorizontalIcon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { CascadeOptions, EditedOrder } from "@myakiba/contracts/orders/schema";
import type { OrderListItem } from "@myakiba/contracts/orders/types";
import type { Currency } from "@myakiba/contracts/shared/types";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { AddToListsDialog } from "@/components/lists/add-to-lists-dialog";
import { OrderForm } from "@/components/orders/order-form";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ItemControl, ItemControls, ItemControlsSelection } from "@/components/ui/item-controls";
import { cn } from "@/lib/utils";

export function OrderControls({
  order,
  itemSize,
  isPending,
  isSelected,
  onEditOrder,
  onDeleteOrders,
  onToggleSelection,
  currency,
}: {
  readonly order: OrderListItem;
  readonly itemSize: number;
  readonly isPending: boolean;
  readonly isSelected: boolean;
  readonly onEditOrder: (values: EditedOrder, cascadeOptions: CascadeOptions) => Promise<void>;
  readonly onDeleteOrders: (orderIds: ReadonlySet<string>) => Promise<void>;
  readonly onToggleSelection: () => void;
  readonly currency: Currency;
}): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  const [addToListsOpen, setAddToListsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  let controlsSize: "xs" | "sm" | "md" | "lg" = "lg";
  if (itemSize < 150) controlsSize = "xs";
  else if (itemSize < 180) controlsSize = "sm";
  else if (itemSize < 240) controlsSize = "md";

  return (
    <>
      <ItemControls variant="media" size={controlsSize} active={isSelected || menuOpen}>
        <ItemControlsSelection
          checked={isSelected}
          onCheckedChange={onToggleSelection}
          label={`${isSelected ? "Deselect" : "Select"} ${order.title}`}
        />
        <OrderForm
          renderTrigger={
            <ItemControl disabled={isPending} title="Edit order">
              <HugeiconsIcon icon={Edit03Icon} />
              <span className="sr-only">Edit order</span>
            </ItemControl>
          }
          type="edit-order"
          orderData={order}
          callbackFn={onEditOrder}
          currency={currency}
        />
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger
            render={
              <ItemControl disabled={isPending} title="More actions">
                <HugeiconsIcon
                  icon={isPending ? Loading03Icon : MoreHorizontalIcon}
                  className={cn(isPending && "animate-spin")}
                />
                <span className="sr-only">Open menu</span>
              </ItemControl>
            }
          />
          {menuOpen ? (
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
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
                <DropdownMenuItem
                  onClick={() => {
                    setMenuOpen(false);
                    setAddToListsOpen(true);
                  }}
                >
                  <HugeiconsIcon icon={FolderAddIcon} />
                  Add to List
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
                  Delete order
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          ) : null}
        </DropdownMenu>
      </ItemControls>
      <AddToListsDialog
        open={addToListsOpen}
        onOpenChange={setAddToListsOpen}
        targets={[{ type: "order", id: order.orderId }]}
        targetTitle={order.title}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete order?"
        description='This will permanently delete this order and all its items. Items with "Owned" status will not be deleted. You can delete owned items in the collection tab.'
        onConfirm={() => onDeleteOrders(new Set([order.orderId]))}
      />
    </>
  );
}
