import { HugeiconsIcon } from "@hugeicons/react";
import { Edit03Icon, Loading03Icon } from "@hugeicons/core-free-icons";
import type { Row } from "@tanstack/react-table";
import type { CascadeOptions, EditedOrder } from "@myakiba/contracts/orders/schema";
import type { Order } from "@myakiba/contracts/orders/types";
import type { Currency } from "@myakiba/contracts/shared/types";
import { Button } from "@/components/ui/button";
import type { Saving } from "@/data/client";
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
  currency,
}: {
  readonly order: Order;
  readonly isPending: boolean;
  readonly onEditOrder: (values: EditedOrder, cascadeOptions: CascadeOptions) => Saving;
  readonly currency: Currency;
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-end">
      <OrderForm
        renderTrigger={
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={isPending}
            className="text-muted-foreground"
          >
            <HugeiconsIcon
              icon={isPending ? Loading03Icon : Edit03Icon}
              className={cn(isPending && "animate-spin")}
            />
            <span className="sr-only">Edit order</span>
          </Button>
        }
        type="edit-order"
        orderData={order}
        callbackFn={onEditOrder}
        currency={currency}
      />
    </div>
  );
}
