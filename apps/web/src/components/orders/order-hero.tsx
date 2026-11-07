import { useState } from "react";
import type { ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Delete02Icon,
  Edit03Icon,
  FolderAddIcon,
  MoreHorizontalIcon,
  PackageIcon,
} from "@hugeicons/core-free-icons";
import type { Order } from "@myakiba/contracts/orders/types";
import type { DateFormat, Currency } from "@myakiba/contracts/shared/types";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { OrderForm } from "@/components/orders/order-form";
import { formatDateOnlyForDisplay } from "@/lib/date-display";
import { ORDER_STATUS_COLORS } from "@/lib/orders";
import { cn } from "@/lib/utils";
import type { EditedOrder, CascadeOptions } from "@myakiba/contracts/orders/schema";
import { ImageThumbnail } from "@/components/ui/image-thumbnail";
import { Skeleton } from "@/components/ui/skeleton";
import { AddToListsDialog } from "@/components/lists/add-to-lists-dialog";

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
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div className="flex min-w-0 items-start gap-4">
            <Skeleton className="size-20 shrink-0 rounded-xl" />
            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex flex-wrap items-center gap-3">
                <Skeleton className="h-8 w-52 max-w-[45vw]" />
                <Skeleton className="h-5 w-16" />
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-20" />
              </div>
            </div>
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            <Button variant="outline" disabled>
              <HugeiconsIcon icon={Edit03Icon} data-icon="inline-start" />
              Edit
            </Button>
            <Button variant="outline" size="icon" disabled aria-label="More order actions">
              <HugeiconsIcon icon={MoreHorizontalIcon} />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!order) return null;

  return (
    <LoadedOrderHero
      order={order}
      currency={currency}
      dateFormat={dateFormat}
      onEditOrder={onEditOrder}
      onDeleteOrder={onDeleteOrder}
    />
  );
}

function LoadedOrderHero({
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
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="flex min-w-0 items-start gap-4">
          <ImageThumbnail
            images={order.images}
            title={order.title}
            fallbackIcon={<HugeiconsIcon icon={PackageIcon} className="size-7" />}
            className="animate-data-in size-20 shrink-0 rounded-xl ring-1 ring-foreground/10"
            showRemainingCount
            decorative
          />
          <div className="flex min-w-0 flex-col gap-2">
            <div className="animate-data-in display text-2xl leading-tight font-medium break-words text-pretty">
              <h1 className="inline">{order.title}</h1>
              <span className="ml-3 inline-flex items-center gap-1.5 align-middle text-sm font-medium tracking-normal whitespace-nowrap text-foreground">
                <span
                  aria-hidden
                  className={cn("size-1.5 rounded-full", ORDER_STATUS_COLORS[order.status])}
                />
                {order.status}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {order.shop ? (
                <span className="animate-data-in inline-block">{order.shop}</span>
              ) : null}
              {order.shippingMethod === "n/a" ? null : (
                <span className="animate-data-in inline-block">{order.shippingMethod}</span>
              )}
              <span className="animate-data-in inline-block">
                {order.itemCount} {Number(order.itemCount) === 1 ? "item" : "items"}
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
          <AddToListsDialog
            targets={[{ type: "order", id: order.orderId }]}
            targetTitle={order.title}
            renderTrigger={
              <Button variant="outline">
                <HugeiconsIcon icon={FolderAddIcon} data-icon="inline-start" />
                Add to List
              </Button>
            }
          />
          <OrderForm
            renderTrigger={
              <Button variant="outline">
                <HugeiconsIcon icon={Edit03Icon} data-icon="inline-start" /> Edit
              </Button>
            }
            type="edit-order"
            orderData={order}
            callbackFn={onEditOrder}
            currency={currency}
          />
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" size="icon" aria-label="More order actions">
                  <HugeiconsIcon icon={MoreHorizontalIcon} />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
                <HugeiconsIcon icon={Delete02Icon} />
                Delete order
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <ConfirmDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            title="Delete order?"
            description='This will permanently delete this order and all its items. Items with "Owned" status will not be deleted. You can delete owned items in the collection tab.'
            onConfirm={() => onDeleteOrder(order.orderId)}
          />
        </div>
      </div>
    </div>
  );
}
