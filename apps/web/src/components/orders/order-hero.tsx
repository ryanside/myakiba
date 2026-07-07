import type { ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Delete02Icon, Edit03Icon } from "@hugeicons/core-free-icons";
import type { Order } from "@myakiba/contracts/orders/types";
import type { DateFormat, Currency } from "@myakiba/contracts/shared/types";
import { ThemedBadge } from "@/components/reui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { OrderForm } from "@/components/orders/order-form";
import { formatDateOnlyForDisplay } from "@/lib/date-display";
import { getStatusVariant } from "@/lib/orders";
import type { EditedOrder, CascadeOptions } from "@myakiba/contracts/orders/schema";

export function OrderHero({
  order,
  currency,
  dateFormat,
  onEditOrder,
  onDeleteOrder,
}: {
  readonly order: Order;
  readonly currency: Currency;
  readonly dateFormat: DateFormat;
  readonly onEditOrder: (values: EditedOrder, cascadeOptions: CascadeOptions) => Promise<void>;
  readonly onDeleteOrder: (orderId: string) => Promise<void>;
}): ReactNode {
  return (
    <div className="flex flex-col gap-3 animate-appear">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-medium tracking-tight">{order.title}</h1>
            <ThemedBadge variant={getStatusVariant(order.status)} size="lg">
              {order.status}
            </ThemedBadge>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            {order.shop && (
              <>
                <span>{order.shop}</span>
                <span className="text-border select-none" aria-hidden="true">
                  &middot;
                </span>
              </>
            )}
            <span>{order.shippingMethod}</span>
            <span className="text-border select-none" aria-hidden="true">
              &middot;
            </span>
            <span>
              {order.itemCount} {order.itemCount === 1 ? "item" : "items"}
            </span>
            {order.releaseDate && (
              <>
                <span className="text-border select-none" aria-hidden="true">
                  &middot;
                </span>
                <span>Release {formatDateOnlyForDisplay(order.releaseDate, dateFormat)}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <OrderForm
            renderTrigger={
              <Button variant="outline" size="sm">
                <HugeiconsIcon icon={Edit03Icon} className="size-4" />
                Edit
              </Button>
            }
            type="edit-order"
            orderData={order}
            callbackFn={onEditOrder}
            currency={currency}
          />
          <ConfirmDialog
            renderTrigger={
              <Button variant="destructive" size="sm">
                <HugeiconsIcon icon={Delete02Icon} className="size-4" />
                Delete
              </Button>
            }
            title="Delete order?"
            description='This will permanently delete this order and all its items. Items with "Owned" status will not be deleted. You can delete owned items in the collection tab.'
            onConfirm={() => onDeleteOrder(order.orderId)}
          />
        </div>
      </div>
    </div>
  );
}
