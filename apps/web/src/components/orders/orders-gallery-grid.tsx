import { PackageIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import { Skeleton } from "@/components/ui/skeleton";
import { ImageThumbnail } from "@/components/ui/image-thumbnail";
import { OrderControls } from "@/components/orders/order-controls";
import { cn } from "@/lib/utils";
import type { OrderListItem } from "@myakiba/contracts/orders/types";
import type { CascadeOptions, EditedOrder } from "@myakiba/contracts/orders/schema";
import type { Currency } from "@myakiba/contracts/shared/types";
import type { RowSelectionState } from "@tanstack/react-table";
import type { CSSProperties } from "react";
import type { GalleryLayout } from "@/components/ui/gallery-layout-toggle";

const MAX_STAGGER_INDEX = 20;
const STAGGER_DELAY_MS = 30;

interface OrdersGalleryGridProps {
  readonly orders: readonly OrderListItem[];
  readonly tileSize: number;
  readonly galleryLayout: GalleryLayout;
  readonly rowSelection: RowSelectionState;
  readonly onRowSelectionChange: (
    updater: RowSelectionState | ((prev: RowSelectionState) => RowSelectionState),
  ) => void;
  readonly onEditOrder: (values: EditedOrder, cascadeOptions: CascadeOptions) => Promise<void>;
  readonly onDeleteOrders: (orderIds: ReadonlySet<string>) => Promise<void>;
  readonly currency: Currency;
  readonly isOrderPending: (orderId: string) => boolean;
  readonly isLoading: boolean;
}

export function OrdersGalleryGrid({
  orders,
  tileSize,
  galleryLayout,
  rowSelection,
  onRowSelectionChange,
  onEditOrder,
  onDeleteOrders,
  currency,
  isOrderPending,
  isLoading,
}: OrdersGalleryGridProps): React.JSX.Element {
  const toggleSelection = (id: string): void => {
    onRowSelectionChange((prev: RowSelectionState) => {
      if (prev[id]) {
        const { [id]: _removed, ...next } = prev;
        return next;
      }
      return { ...prev, [id]: true };
    });
  };

  if (isLoading) {
    return galleryLayout === "masonry" ? (
      <div
        className="columns-(--col-width) gap-2"
        style={{ "--col-width": `${tileSize}px` } as React.CSSProperties}
      >
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton
            key={i}
            className="mb-2 w-full break-inside-avoid rounded-lg"
            style={{ height: `${140 + (i % 3) * 50}px` }}
          />
        ))}
      </div>
    ) : (
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${tileSize}px, 1fr))` }}
      >
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square w-full rounded-lg" />
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

  const tiles = orders.map((order, index) => {
    const isSelected = !!rowSelection[order.orderId];
    const isPending = isOrderPending(order.orderId);
    const imageCount = order.images.length;
    const staggerDelay = Math.min(index, MAX_STAGGER_INDEX) * STAGGER_DELAY_MS;

    return (
      <div
        key={order.orderId}
        className={cn(
          "animate-data-in group/item group/tile relative overflow-hidden rounded-lg",
          galleryLayout === "masonry" && "mb-2 break-inside-avoid",
          isSelected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
        )}
        style={{ "--data-in-delay": `${staggerDelay}ms` } as CSSProperties}
      >
        <OrderControls
          order={order}
          itemSize={tileSize}
          isPending={isPending}
          isSelected={isSelected}
          onEditOrder={onEditOrder}
          onDeleteOrders={onDeleteOrders}
          onToggleSelection={() => toggleSelection(order.orderId)}
          currency={currency}
        />

        {imageCount > 4 ? (
          <div className="absolute bottom-1.5 right-1.5 z-20 rounded-sm bg-black/50 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
            +{imageCount - 4}
          </div>
        ) : null}

        <Link to="/orders/$id" params={{ id: order.orderId }} className="block">
          <ImageThumbnail
            images={order.images}
            title={order.title}
            fallbackIcon={
              <HugeiconsIcon icon={PackageIcon} className="size-10 text-muted-foreground/40" />
            }
            className={cn("w-full", galleryLayout === "square" && "aspect-square")}
            layout={galleryLayout === "masonry" ? "masonry" : "fixed"}
            loading="lazy"
          />
        </Link>
      </div>
    );
  });

  if (galleryLayout === "masonry") {
    return (
      <div
        className="columns-(--col-width) gap-2"
        style={{ "--col-width": `${tileSize}px` } as React.CSSProperties}
      >
        {tiles}
      </div>
    );
  }

  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${tileSize}px, 1fr))` }}
    >
      {tiles}
    </div>
  );
}
