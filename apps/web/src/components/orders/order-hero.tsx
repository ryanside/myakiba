import type { ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Delete02Icon, Edit03Icon, PackageIcon } from "@hugeicons/core-free-icons";
import type { Order } from "@myakiba/contracts/orders/types";
import type { DateFormat, Currency } from "@myakiba/contracts/shared/types";
import { ThemedBadge } from "@/components/reui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { OrderForm } from "@/components/orders/order-form";
import { formatDateOnlyForDisplay } from "@/lib/date-display";
import { getStatusVariant } from "@/lib/orders";
import type { EditedOrder, CascadeOptions } from "@myakiba/contracts/orders/schema";
import { ImageThumbnail } from "@/components/ui/image-thumbnail";
import { Skeleton } from "@/components/ui/skeleton";

export function OrderHero({
  order,
  isLoading,
  currency,
  dateFormat,
  onEditOrder,
  onDeleteOrder,
}: {
  readonly order: Order | undefined;
  readonly isLoading: boolean;
  readonly currency: Currency;
  readonly dateFormat: DateFormat;
  readonly onEditOrder: (values: EditedOrder, cascadeOptions: CascadeOptions) => Promise<void>;
  readonly onDeleteOrder: (orderId: string) => Promise<void>;
}): ReactNode {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row">
          <div className="flex min-w-0 items-start gap-4">
            <Skeleton className="size-20 shrink-0 rounded-xl" />
            <div className="flex min-w-0 flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-3">
                <Skeleton className="h-8 w-52 max-w-[45vw]" />
                <Skeleton className="h-7 w-18 rounded-full" />
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-20" />
              </div>
            </div>
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            <Button variant="outline" size="sm" disabled>
              <HugeiconsIcon icon={Edit03Icon} className="size-4" />
              Edit
            </Button>
            <Button variant="destructive" size="sm" disabled>
              <HugeiconsIcon icon={Delete02Icon} className="size-4" />
              Delete
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!order) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row">
        <div className="flex min-w-0 items-start gap-4">
          <ImageThumbnail
            images={order.images}
            title={order.title}
            fallbackIcon={<HugeiconsIcon icon={PackageIcon} className="size-7" />}
            className="animate-data-in size-20 rounded-xl ring-1 ring-foreground/10"
          />
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="animate-data-in text-2xl font-medium tracking-tight">{order.title}</h1>
              <ThemedBadge
                variant={getStatusVariant(order.status)}
                size="lg"
                className="animate-data-in"
              >
                {order.status}
              </ThemedBadge>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {order.shop ? (
                <span className="animate-data-in inline-block">{order.shop}</span>
              ) : null}
              <span className="animate-data-in inline-block">{order.shippingMethod}</span>
              <span className="animate-data-in inline-block">
                {order.itemCount} {order.itemCount === 1 ? "item" : "items"}
              </span>
              {order.releaseDate ? (
                <span className="animate-data-in inline-block">
                  Release {formatDateOnlyForDisplay(order.releaseDate, dateFormat)}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <OrderForm
            renderTrigger={
              <Button variant="outline" size="sm">
                <HugeiconsIcon icon={Edit03Icon} className="size-4" /> Edit
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
                <HugeiconsIcon icon={Delete02Icon} className="size-4" /> Delete
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
