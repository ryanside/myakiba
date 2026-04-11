import { HugeiconsIcon } from "@hugeicons/react";
import {
  Delete02Icon,
  Edit03Icon,
  Loading03Icon,
  MoreHorizontalIcon,
  PackageIcon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import { Link } from "@tanstack/react-router";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { OrderForm } from "./order-form";
import { getStatusVariant } from "@/lib/orders";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { cn } from "@/lib/utils";
import type { OrderListItem } from "@myakiba/contracts/orders/types";
import type { CascadeOptions, EditedOrder } from "@myakiba/contracts/orders/schema";
import type { Currency } from "@myakiba/contracts/shared/types";
import type { RowSelectionState } from "@tanstack/react-table";
import type { CSSProperties } from "react";
import { ThemedBadge } from "../reui/badge";

const MAX_STAGGER_INDEX = 20;
const STAGGER_DELAY_MS = 30;

interface OrdersCardGridProps {
  readonly orders: readonly OrderListItem[];
  readonly cardWidth: number;
  readonly rowSelection: RowSelectionState;
  readonly onRowSelectionChange: (
    updater: RowSelectionState | ((prev: RowSelectionState) => RowSelectionState),
  ) => void;
  readonly onEditOrder: (values: EditedOrder, cascadeOptions: CascadeOptions) => Promise<void>;
  readonly onDeleteOrders: (orderIds: Set<string>) => Promise<void>;
  readonly currency: Currency;
  readonly locale: string;
  readonly isOrderPending: (orderId: string) => boolean;
  readonly isLoading: boolean;
}

export function OrdersCardGrid({
  orders,
  cardWidth,
  rowSelection,
  onRowSelectionChange,
  onEditOrder,
  onDeleteOrders,
  currency,
  locale,
  isOrderPending,
  isLoading,
}: OrdersCardGridProps): React.JSX.Element {
  const toggleSelection = (id: string): void => {
    onRowSelectionChange((prev: RowSelectionState) => {
      const next = { ...prev };
      if (next[id]) {
        delete next[id];
      } else {
        next[id] = true;
      }
      return next;
    });
  };

  const gridStyle = {
    gridTemplateColumns: `repeat(auto-fill, minmax(${cardWidth}px, 1fr))`,
  } as const;

  if (isLoading) {
    return (
      <div className="grid gap-3" style={gridStyle}>
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i} size="sm" className="p-0!">
            <Skeleton className="aspect-video w-full" />
            <CardHeader>
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </CardHeader>
            <CardFooter className="justify-between">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-12" />
            </CardFooter>
          </Card>
        ))}
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <HugeiconsIcon icon={PackageIcon} className="mb-3 size-10 opacity-40" />
        <p className="text-sm font-medium">No orders found</p>
        <p className="text-xs">Try adjusting your filters</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3" style={gridStyle}>
      {orders.map((order, index) => {
        const isSelected = !!rowSelection[order.orderId];
        const isPending = isOrderPending(order.orderId);
        const displayImages = order.images.slice(0, 4);
        const staggerDelay = Math.min(index, MAX_STAGGER_INDEX) * STAGGER_DELAY_MS;

        return (
          <Card
            key={order.orderId}
            size="sm"
            className={cn("animate-data-in relative p-0!", isSelected && "ring-primary")}
            style={{ "--data-in-delay": `${staggerDelay}ms` } as CSSProperties}
          >
            {/* Selection + Actions overlay */}
            <div className="absolute inset-x-0 top-0 z-10 flex items-start justify-between p-2">
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => toggleSelection(order.orderId)}
                aria-label={`Select ${order.title}`}
                className={cn(
                  "border-white/60 bg-black/20 backdrop-blur-sm data-checked:border-primary data-checked:bg-primary",
                  !isSelected && "opacity-0 group-hover/card:opacity-100 transition-opacity",
                )}
              />
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className={cn(
                        "bg-black/20 text-white backdrop-blur-sm hover:bg-black/40 hover:text-white",
                        !isSelected &&
                          "opacity-0 group-hover/card:opacity-100 data-popup-open:opacity-100 transition-opacity",
                      )}
                      disabled={isPending}
                    >
                      <HugeiconsIcon
                        icon={isPending ? Loading03Icon : MoreHorizontalIcon}
                        className={cn("size-3.5", isPending && "animate-spin")}
                      />
                    </Button>
                  }
                />
                <DropdownMenuContent align="end">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
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
                    <OrderForm
                      renderTrigger={
                        <DropdownMenuItem closeOnClick={false} disabled={isPending}>
                          <HugeiconsIcon icon={Edit03Icon} />
                          {isPending ? "Saving..." : "Edit order"}
                        </DropdownMenuItem>
                      }
                      type="edit-order"
                      orderData={order}
                      callbackFn={onEditOrder}
                      currency={currency}
                    />
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={isPending}
                    onClick={() => onDeleteOrders(new Set([order.orderId]))}
                  >
                    <HugeiconsIcon icon={Delete02Icon} />
                    {isPending ? "Deleting..." : "Delete order"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Image mosaic */}
            <Link to="/orders/$id" params={{ id: order.orderId }} className="block">
              <div className="relative aspect-video w-full overflow-hidden bg-muted">
                {displayImages.length === 0 ? (
                  <div className="flex h-full w-full items-center justify-center">
                    <HugeiconsIcon
                      icon={PackageIcon}
                      className="size-10 text-muted-foreground/40"
                    />
                  </div>
                ) : displayImages.length === 1 ? (
                  <img
                    src={displayImages[0]}
                    alt={order.title}
                    className="h-full w-full object-cover object-top"
                    loading="lazy"
                  />
                ) : (
                  <div
                    className={cn(
                      "grid h-full w-full gap-px",
                      displayImages.length === 2 && "grid-cols-2",
                      displayImages.length === 3 && "grid-cols-3",
                      displayImages.length >= 4 && "grid-cols-2 grid-rows-2",
                    )}
                  >
                    {displayImages.map((src, idx) => (
                      <img
                        key={`${src}-${idx}`}
                        src={src}
                        alt={`${order.title} item ${idx + 1}`}
                        className="h-full w-full object-cover object-top"
                        loading="lazy"
                      />
                    ))}
                  </div>
                )}
              </div>
            </Link>

            <CardHeader>
              <CardTitle className="truncate">
                <Link
                  to="/orders/$id"
                  params={{ id: order.orderId }}
                  className="line-clamp-1 hover:underline underline-offset-2"
                >
                  {order.title}
                </Link>
              </CardTitle>
              <CardDescription className="truncate text-xs">{order.shop || "-"}</CardDescription>
            </CardHeader>

            <CardContent>
              <div className="flex flex-wrap items-center gap-1.5">
                <ThemedBadge variant={getStatusVariant(order.status)} size="sm">
                  {order.status}
                </ThemedBadge>
                <span className="text-xs text-muted-foreground">
                  {order.itemCount} {order.itemCount === 1 ? "item" : "items"}
                </span>
              </div>
            </CardContent>

            <CardFooter className="justify-between py-2.5!">
              <span className="text-sm font-medium tabular-nums">
                {formatCurrencyFromMinorUnits(order.total, currency, locale)}
              </span>
              {order.shippingMethod !== "n/a" ? (
                <span className="text-[10px] text-muted-foreground">{order.shippingMethod}</span>
              ) : null}
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );
}
