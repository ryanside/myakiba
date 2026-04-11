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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { OrderForm } from "./order-form";
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
  readonly onDeleteOrders: (orderIds: Set<string>) => Promise<void>;
  readonly currency: Currency;
  readonly isOrderPending: (orderId: string) => boolean;
  readonly isLoading: boolean;
}

function OrderImageMosaic({
  images,
  title,
  layout,
}: {
  readonly images: readonly string[];
  readonly title: string;
  readonly layout: GalleryLayout;
}): React.JSX.Element {
  const displayImages = images.slice(0, 4);

  if (displayImages.length === 0) {
    return (
      <div
        className={cn(
          "flex w-full items-center justify-center bg-muted",
          layout === "square" ? "aspect-square" : "aspect-video",
        )}
      >
        <HugeiconsIcon icon={PackageIcon} className="size-10 text-muted-foreground/40" />
      </div>
    );
  }

  if (displayImages.length === 1) {
    return (
      <img
        src={displayImages[0]}
        alt={title}
        className={cn("w-full object-cover", layout === "square" && "aspect-square object-top")}
        loading="lazy"
      />
    );
  }

  return (
    <div
      className={cn(
        "grid w-full gap-px overflow-hidden",
        layout === "square" && "aspect-square",
        displayImages.length === 2 && "grid-cols-2",
        displayImages.length === 3 && "grid-cols-2",
        displayImages.length >= 4 && "grid-cols-2 grid-rows-2",
      )}
    >
      {displayImages.map((src, idx) => (
        <img
          key={`${src}-${idx}`}
          src={src}
          alt={`${title} item ${idx + 1}`}
          className={cn(
            "h-full w-full object-cover object-top",
            displayImages.length === 3 && idx === 0 && "row-span-2",
          )}
          loading="lazy"
        />
      ))}
    </div>
  );
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
      const next = { ...prev };
      if (next[id]) {
        delete next[id];
      } else {
        next[id] = true;
      }
      return next;
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
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <HugeiconsIcon icon={PackageIcon} className="mb-3 size-10 opacity-40" />
        <p className="text-sm font-medium">No orders found</p>
        <p className="text-xs">Try adjusting your filters</p>
      </div>
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
          "animate-data-in group/tile relative overflow-hidden rounded-lg",
          galleryLayout === "masonry" && "mb-2 break-inside-avoid",
          isSelected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
        )}
        style={{ "--data-in-delay": `${staggerDelay}ms` } as CSSProperties}
      >
        <div
          className={cn(
            "pointer-events-none absolute inset-0 z-10 transition-colors group-hover/tile:bg-black/20",
            isSelected && "bg-black/10",
          )}
        />

        <div className="absolute inset-x-0 top-0 z-20 flex items-start justify-between p-1.5">
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => toggleSelection(order.orderId)}
            aria-label={`Select ${order.title}`}
            className={cn(
              "border-white/60 bg-black/30 backdrop-blur-sm data-checked:border-primary data-checked:bg-primary",
              !isSelected && "opacity-0 group-hover/tile:opacity-100 transition-opacity",
            )}
          />
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className={cn(
                    "bg-black/30 text-white backdrop-blur-sm hover:bg-black/50 hover:text-white",
                    !isSelected &&
                      "opacity-0 group-hover/tile:opacity-100 data-popup-open:opacity-100 transition-opacity",
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

        {imageCount > 4 ? (
          <div className="absolute bottom-1.5 right-1.5 z-20 rounded-sm bg-black/50 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
            +{imageCount - 4}
          </div>
        ) : null}

        <Link to="/orders/$id" params={{ id: order.orderId }} className="block">
          <OrderImageMosaic images={order.images} title={order.title} layout={galleryLayout} />
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
