import { HugeiconsIcon } from "@hugeicons/react";
import { PackageIcon } from "@hugeicons/core-free-icons";
import { Link } from "@tanstack/react-router";
import { CollectionItemControls } from "@/components/collection/collection-item-controls";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { CollectionItem, CollectionItemFormValues } from "@myakiba/contracts/collection/types";
import type { CascadeOptions, NewOrder } from "@myakiba/contracts/orders/schema";
import type { Currency, DateFormat } from "@myakiba/contracts/shared/types";
import type { RowSelectionState } from "@tanstack/react-table";
import type { CSSProperties } from "react";
import type { GalleryLayout } from "@/components/ui/gallery-layout-toggle";

const MAX_STAGGER_INDEX = 20;
const STAGGER_DELAY_MS = 30;

interface CollectionGalleryGridProps {
  readonly items: readonly CollectionItem[];
  readonly tileSize: number;
  readonly galleryLayout: GalleryLayout;
  readonly rowSelection: RowSelectionState;
  readonly onRowSelectionChange: (
    updater: RowSelectionState | ((prev: RowSelectionState) => RowSelectionState),
  ) => void;
  readonly onEditCollectionItem: (values: CollectionItemFormValues) => Promise<void>;
  readonly onDeleteCollectionItems: (collectionIds: ReadonlySet<string>) => Promise<void>;
  readonly onAddCollectionItemsToOrder: (
    targetOrderId: string,
    collectionIds: ReadonlySet<string>,
    orderIds?: ReadonlySet<string>,
  ) => Promise<void>;
  readonly onAddCollectionItemsToNewOrder: (
    values: NewOrder,
    cascadeOptions: CascadeOptions,
    collectionIds: ReadonlySet<string>,
  ) => Promise<void>;
  readonly currency: Currency;
  readonly dateFormat: DateFormat;
  readonly isCollectionPending: (collectionId: string) => boolean;
  readonly isCollectionOrderPending: (collectionId: string) => boolean;
  readonly isLoading: boolean;
}

export function CollectionGalleryGrid({
  items,
  tileSize,
  galleryLayout,
  rowSelection,
  onRowSelectionChange,
  onEditCollectionItem,
  onDeleteCollectionItems,
  onAddCollectionItemsToOrder,
  onAddCollectionItemsToNewOrder,
  currency,
  dateFormat,
  isCollectionPending,
  isCollectionOrderPending,
  isLoading,
}: CollectionGalleryGridProps): React.JSX.Element {
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
        {Array.from({ length: 16 }).map((_, i) => (
          <Skeleton
            key={i}
            className="mb-2 w-full break-inside-avoid rounded-lg"
            style={{ height: `${120 + (i % 4) * 40}px` }}
          />
        ))}
      </div>
    ) : (
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${tileSize}px, 1fr))` }}
      >
        {Array.from({ length: 16 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <p className="flex h-64 items-center justify-center text-lg text-muted-foreground">
        No items found.
      </p>
    );
  }

  const tiles = items.map((item, index) => {
    const isSelected = !!rowSelection[item.id];
    const isPending = isCollectionPending(item.id) || isCollectionOrderPending(item.id);
    const staggerDelay = Math.min(index, MAX_STAGGER_INDEX) * STAGGER_DELAY_MS;

    return (
      <div
        key={item.id}
        className={cn(
          "animate-data-in group/item group/tile relative overflow-hidden rounded-lg",
          galleryLayout === "masonry" && "mb-2 break-inside-avoid",
          isSelected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
        )}
        style={{ "--data-in-delay": `${staggerDelay}ms` } as CSSProperties}
      >
        <CollectionItemControls
          item={item}
          itemSize={tileSize}
          isPending={isPending}
          isSelected={isSelected}
          onEditCollectionItem={onEditCollectionItem}
          onDeleteCollectionItems={onDeleteCollectionItems}
          onAddCollectionItemsToOrder={onAddCollectionItemsToOrder}
          onAddCollectionItemsToNewOrder={onAddCollectionItemsToNewOrder}
          onToggleSelection={() => toggleSelection(item.id)}
          currency={currency}
          dateFormat={dateFormat}
        />

        <Link
          {...(item.itemExternalId !== null
            ? ({
                to: "/item/$externalId",
                params: { externalId: item.itemExternalId },
              } as const)
            : ({ to: "/item/custom/$id", params: { id: item.itemId } } as const))}
          className="block"
        >
          {item.itemImage ? (
            <img
              src={item.itemImage}
              alt={item.itemTitle}
              className={cn(
                "w-full object-cover",
                galleryLayout === "square" && "aspect-square object-top",
              )}
              loading="lazy"
            />
          ) : (
            <div
              className={cn(
                "flex w-full items-center justify-center bg-muted",
                galleryLayout === "square" ? "aspect-square" : "aspect-3/4",
              )}
            >
              <HugeiconsIcon icon={PackageIcon} className="size-8 text-muted-foreground/40" />
            </div>
          )}
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
