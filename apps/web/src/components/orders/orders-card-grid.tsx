import { HugeiconsIcon } from "@hugeicons/react";
import { PackageIcon } from "@hugeicons/core-free-icons";
import { OrderControls } from "@/components/orders/order-controls";
import {
  MediaCard,
  MediaCardBody,
  MediaCardImage,
  MediaCardSkeleton,
  MediaCardTitle,
} from "@/components/media-tile";
import { ThemedBadge } from "@/components/reui/badge";
import { getStatusVariant } from "@/lib/orders";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { cn } from "@/lib/utils";
import type { Order } from "@myakiba/contracts/orders/types";
import type { CascadeOptions, EditedOrder } from "@myakiba/contracts/orders/schema";
import type { Currency } from "@myakiba/contracts/shared/types";
import type { RowSelectionState } from "@tanstack/react-table";

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
      <div className="grid gap-3" style={gridStyle} aria-hidden="true">
        {Array.from({ length: 8 }).map((_, i) => (
          <MediaCardSkeleton key={i} imageClassName="aspect-8/5" />
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
        const destination = { to: "/orders/$id", params: { id: order.orderId } } as const;

        return (
          <MediaCard key={order.orderId} selected={isSelected} className="animate-data-in">
            <OrderControls
              order={order}
              itemSize={cardWidth}
              variant="card"
              isPending={isPending}
              isSelected={isSelected}
              onEditOrder={onEditOrder}
              onDeleteOrders={onDeleteOrders}
              onToggleSelection={() => toggleSelection(order.orderId)}
              currency={currency}
            />

            <MediaCardImage destination={destination} title={order.title} className="aspect-8/5">
              {(() => {
                if (displayImages.length === 0) {
                  return (
                    <div className="flex size-full items-center justify-center">
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
                      alt={order.title}
                      className="size-full object-cover object-top"
                      loading="lazy"
                    />
                  );
                }
                return (
                  <div
                    className={cn(
                      "grid size-full gap-px",
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
                        className="size-full object-cover object-top"
                        loading="lazy"
                      />
                    ))}
                  </div>
                );
              })()}
            </MediaCardImage>

            <MediaCardBody>
              <span className="flex min-w-0 items-center justify-between gap-2">
                <ThemedBadge
                  variant={getStatusVariant(order.status)}
                  size={isCompact ? "xs" : "sm"}
                >
                  {order.status}
                </ThemedBadge>
                <span className="shrink-0 text-xs leading-4 text-muted-foreground tabular-nums">
                  {order.itemCount} {order.itemCount === 1 ? "item" : "items"}
                </span>
              </span>
              <MediaCardTitle as="h3" title={order.title} destination={destination} />
              <p
                className="truncate text-xs leading-4 text-muted-foreground"
                title={order.shop || undefined}
              >
                {order.shop || "—"}
              </p>
              <span className="mt-auto flex min-w-0 items-baseline justify-between gap-2 pt-1">
                <span className="shrink-0 text-sm leading-5 font-medium tabular-nums">
                  {formatCurrencyFromMinorUnits(order.total, currency, locale)}
                </span>
                {order.shippingMethod !== "n/a" && !isCompact ? (
                  <span className="min-w-0 truncate text-xs leading-4 text-muted-foreground">
                    {order.shippingMethod}
                  </span>
                ) : null}
              </span>
            </MediaCardBody>
          </MediaCard>
        );
      })}
    </div>
  );
}
