import { HugeiconsIcon } from "@hugeicons/react";
import { PackageIcon } from "@hugeicons/core-free-icons";
import { Link } from "@tanstack/react-router";
import { Skeleton } from "@/components/ui/skeleton";
import { OrderControls } from "@/components/orders/order-controls";
import { Card } from "@/components/ui/card";
import { getStatusVariant } from "@/lib/orders";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { cn } from "@/lib/utils";
import type { Order } from "@myakiba/contracts/orders/types";
import type { CascadeOptions, EditedOrder } from "@myakiba/contracts/orders/schema";
import type { Currency } from "@myakiba/contracts/shared/types";
import type { RowSelectionState } from "@tanstack/react-table";
import { ThemedBadge } from "../reui/badge";

interface OrdersCardGridProps {
  readonly orders: readonly Order[];
  readonly cardWidth: number;
  readonly rowSelection: RowSelectionState;
  readonly onRowSelectionChange: (
    updater: RowSelectionState | ((prev: RowSelectionState) => RowSelectionState),
  ) => void;
  readonly onEditOrder: (values: EditedOrder, cascadeOptions: CascadeOptions) => Promise<void>;
  readonly onDeleteOrders: (orderIds: ReadonlySet<string>) => Promise<void>;
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
  const isCompact = cardWidth < 180;

  const toggleSelection = (id: string): void => {
    onRowSelectionChange((prev: RowSelectionState) => {
      if (prev[id]) {
        const { [id]: _removed, ...next } = prev;
        return next;
      }
      return { ...prev, [id]: true };
    });
  };

  const gridStyle = {
    gridTemplateColumns: `repeat(auto-fill, minmax(${cardWidth}px, 1fr))`,
  } as const;

  if (isLoading) {
    return (
      <div className="grid gap-3" style={gridStyle}>
        {Array.from({ length: 8 }).map((_, i) => (
          <Card
            key={i}
            size="sm"
            className="gap-0 rounded-[17px] border border-transparent bg-white p-1.5! ring-0 shadow-[0_0_0_1px_oklch(0_0_0/0.06),0_1px_2px_-1px_oklch(0_0_0/0.06),0_2px_4px_oklch(0_0_0/0.04)] dark:bg-card dark:shadow-[0_0_0_1px_oklch(1_0_0/0.08)]"
          >
            <Skeleton className="aspect-8/5 w-full rounded-[10px]" />
            <div
              className={cn(
                "flex flex-col gap-2 px-3 pt-3 pb-2.5",
                isCompact && "px-2 pt-2.5 pb-2",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <Skeleton className="h-5 w-14" />
                <Skeleton className="h-3 w-10" />
              </div>
              <div className="space-y-1.5">
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-2/3" />
              </div>
              <Skeleton className="h-3 w-1/2" />
              <div className="mt-2 flex items-center justify-between gap-3">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-3 w-12" />
              </div>
            </div>
          </Card>
        ))}
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <p className="flex h-64 items-center justify-center text-lg text-muted-foreground">
        No orders found.
      </p>
    );
  }

  return (
    <div className="grid gap-3" style={gridStyle}>
      {orders.map((order) => {
        const isSelected = !!rowSelection[order.orderId];
        const isPending = isOrderPending(order.orderId);
        const displayImages = order.images.slice(0, 4);

        return (
          <Card
            key={order.orderId}
            size="sm"
            className={cn(
              "group/item relative gap-0 rounded-[17px] border border-transparent bg-white p-1.5! ring-0 ring-offset-2 ring-offset-background shadow-[0_0_0_1px_oklch(0_0_0/0.06),0_1px_2px_-1px_oklch(0_0_0/0.06),0_2px_4px_oklch(0_0_0/0.04)] dark:bg-card dark:shadow-[0_0_0_1px_oklch(1_0_0/0.08)]",
              isSelected
                ? "ring-2 ring-primary"
                : "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
            )}
          >
            <OrderControls
              order={order}
              itemSize={cardWidth}
              isPending={isPending}
              isSelected={isSelected}
              onEditOrder={onEditOrder}
              onDeleteOrders={onDeleteOrders}
              onToggleSelection={() => toggleSelection(order.orderId)}
              currency={currency}
            />

            <Link
              to="/orders/$id"
              params={{ id: order.orderId }}
              className="block overflow-hidden rounded-[10px] bg-muted"
              tabIndex={-1}
              aria-hidden="true"
              title={order.title}
            >
              <div className="animate-data-in relative aspect-8/5 w-full overflow-hidden rounded-[inherit] bg-muted after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:outline after:-outline-offset-1 after:outline-black/10 dark:after:outline-white/10">
                {(() => {
                  if (displayImages.length === 0) {
                    return (
                      <div className="flex h-full w-full items-center justify-center">
                        <HugeiconsIcon
                          icon={PackageIcon}
                          className="size-10 text-muted-foreground/40"
                        />
                      </div>
                    );
                  }
                  if (displayImages.length === 1) {
                    return (
                      <img
                        src={displayImages[0]}
                        alt=""
                        className="h-full w-full object-cover object-top"
                        loading="lazy"
                      />
                    );
                  }
                  return (
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
                          alt=""
                          className="h-full w-full object-cover object-top"
                          loading="lazy"
                        />
                      ))}
                    </div>
                  );
                })()}
              </div>
            </Link>

            <div
              className={cn(
                "animate-data-in flex min-h-0 flex-1 flex-col px-3 pt-3 pb-2.5",
                isCompact && "px-2 pt-2.5 pb-2",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <ThemedBadge variant={getStatusVariant(order.status)}>{order.status}</ThemedBadge>
                <span className="shrink-0 text-xs leading-none text-muted-foreground tabular-nums">
                  {order.itemCount} {order.itemCount === 1 ? "item" : "items"}
                </span>
              </div>

              <h3
                className={cn(
                  "mt-2.5 text-sm leading-snug font-medium text-balance",
                  isCompact && "mt-2 text-xs",
                )}
              >
                <Link
                  to="/orders/$id"
                  params={{ id: order.orderId }}
                  className="line-clamp-2 hover:underline underline-offset-2 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  title={order.title}
                >
                  {order.title}
                </Link>
              </h3>
              {order.shop ? (
                <p
                  className="mt-1 truncate text-xs leading-normal text-muted-foreground"
                  title={order.shop}
                >
                  {order.shop}
                </p>
              ) : null}

              <div className="mt-auto flex min-w-0 items-end justify-between gap-2 pt-4">
                <span
                  className={cn(
                    "shrink-0 text-base leading-none font-medium tracking-tight tabular-nums",
                    isCompact && "text-sm",
                  )}
                >
                  {formatCurrencyFromMinorUnits(order.total, currency, locale)}
                </span>
                {order.shippingMethod !== "n/a" && !isCompact ? (
                  <span className="min-w-0 truncate text-xs leading-none text-muted-foreground">
                    {order.shippingMethod}
                  </span>
                ) : null}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
