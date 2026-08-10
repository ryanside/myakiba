import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Delete02Icon,
  Edit03Icon,
  Loading03Icon,
  MoreHorizontalIcon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import { Link } from "@tanstack/react-router";
import type { CascadeOptions, EditedOrder } from "@myakiba/contracts/orders/schema";
import type { OrderListItem } from "@myakiba/contracts/orders/types";
import type { Currency } from "@myakiba/contracts/shared/types";
import { OrderForm } from "@/components/orders/order-form";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MediaItemAction, MediaItemToolbar } from "@/components/ui/media-item-toolbar";
import { cn } from "@/lib/utils";

interface OrderItemActionsProps {
  readonly order: OrderListItem;
  readonly itemSize: number;
  readonly isPending: boolean;
  readonly isSelected: boolean;
  readonly onEditOrder: (values: EditedOrder, cascadeOptions: CascadeOptions) => Promise<void>;
  readonly onDeleteOrders: (orderIds: ReadonlySet<string>) => Promise<void>;
  readonly onToggleSelection: () => void;
  readonly currency: Currency;
}

export function OrderItemActions({
  order,
  itemSize,
  isPending,
  isSelected,
  onEditOrder,
  onDeleteOrders,
  onToggleSelection,
  currency,
}: OrderItemActionsProps): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <MediaItemToolbar
        checked={isSelected}
        itemLabel={order.title}
        itemSize={itemSize}
        onCheckedChange={onToggleSelection}
        active={menuOpen}
      >
        <OrderForm
          renderTrigger={
            <MediaItemAction disabled={isPending} title="Edit order">
              <HugeiconsIcon icon={Edit03Icon} className="size-4" />
              <span className="sr-only">Edit order</span>
            </MediaItemAction>
          }
          type="edit-order"
          orderData={order}
          callbackFn={onEditOrder}
          currency={currency}
        />
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger
            render={
              <MediaItemAction disabled={isPending} title="More actions">
                <HugeiconsIcon
                  icon={isPending ? Loading03Icon : MoreHorizontalIcon}
                  className={cn("size-4", isPending && "animate-spin")}
                />
                <span className="sr-only">Open menu</span>
              </MediaItemAction>
            }
          />
          {menuOpen ? (
            <DropdownMenuContent align="end">
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
              <DropdownMenuSeparator />
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
            </DropdownMenuContent>
          ) : null}
        </DropdownMenu>
      </MediaItemToolbar>
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
