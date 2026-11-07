import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Delete02Icon,
  Edit03Icon,
  FolderAddIcon,
  Loading03Icon,
  MoreHorizontalIcon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import { Link } from "@tanstack/react-router";
import type { Row } from "@tanstack/react-table";
import type { CascadeOptions, EditedOrder } from "@myakiba/contracts/orders/schema";
import type { Order } from "@myakiba/contracts/orders/types";
import type { Currency } from "@myakiba/contracts/shared/types";
import { AddToListsDialog } from "@/components/lists/add-to-lists-dialog";
import { ROW_ACTION_CLASS_NAME } from "@/components/media-tile";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLinkItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { OrderForm } from "./order-form";

export function OrderItemCountCell({ row }: { readonly row: Row<Order> }): React.JSX.Element {
  const { itemCount } = row.original;
  return (
    <Button
      type="button"
      variant="ghost"
      className="pr-0 tabular-nums"
      aria-expanded={row.getIsExpanded()}
      onClick={() => row.getToggleExpandedHandler()()}
    >
      {itemCount}
      <span className="sr-only"> items</span>
    </Button>
  );
}

export function OrderActionsCell({
  order,
  isPending,
  onEditOrder,
  onDeleteOrders,
  currency,
}: {
  readonly order: Order;
  readonly isPending: boolean;
  readonly onEditOrder: (values: EditedOrder, cascadeOptions: CascadeOptions) => Promise<void>;
  readonly onDeleteOrders: (orderIds: ReadonlySet<string>) => Promise<void>;
  readonly currency: Currency;
}): React.JSX.Element {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [addToListsOpen, setAddToListsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <div className="flex items-center justify-end gap-0.5">
        <OrderForm
          renderTrigger={
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={isPending}
              className={ROW_ACTION_CLASS_NAME}
            >
              <HugeiconsIcon icon={Edit03Icon} />
              <span className="sr-only">Edit order</span>
            </Button>
          }
          type="edit-order"
          orderData={order}
          callbackFn={onEditOrder}
          currency={currency}
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
                  render={<Link to="/orders/$id" params={{ id: order.orderId }} />}
                >
                  <HugeiconsIcon icon={ViewIcon} />
                  View details
                </DropdownMenuLinkItem>
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
      </div>
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
