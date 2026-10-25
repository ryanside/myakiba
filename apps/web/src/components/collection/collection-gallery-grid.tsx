import { HugeiconsIcon } from "@hugeicons/react";
import { PackageIcon } from "@hugeicons/core-free-icons";
import { CollectionItemControls } from "@/components/collection/collection-item-controls";
import { MediaGalleryLink, MediaGallerySkeleton, MediaGalleryTile } from "@/components/media-tile";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { CollectionItem, CollectionItemFormValues } from "@myakiba/contracts/collection/types";
import type { CascadeOptions, NewOrder } from "@myakiba/contracts/orders/schema";
import type { Currency, DateFormat } from "@myakiba/contracts/shared/types";
import type { RowSelectionState } from "@tanstack/react-table";
import type { GalleryLayout } from "@/components/ui/gallery-layout-toggle";
import { itemDestination } from "@/lib/item-destination";

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
          <MediaGallerySkeleton key={i} />
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

  const tiles = items.map((item) => {
    const isSelected = !!rowSelection[item.id];
    const isPending = isCollectionPending(item.id) || isCollectionOrderPending(item.id);

    return (
      <MediaGalleryTile
        key={item.id}
        selected={isSelected}
        className={cn("animate-data-in", galleryLayout === "masonry" && "mb-2 break-inside-avoid")}
      >
        <CollectionItemControls
          item={item}
          itemSize={tileSize}
          variant="media"
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

        <MediaGalleryLink
          destination={itemDestination(item.itemId, item.itemExternalId)}
          title={item.itemTitle}
          imageClassName={cn(galleryLayout === "masonry" && "aspect-auto")}
        >
          {item.itemImage ? (
            <img
              src={item.itemImage}
              alt=""
              className="size-full object-cover object-top"
              loading="lazy"
            />
          ) : (
            <div
              className={cn(
                "flex size-full items-center justify-center",
                galleryLayout === "masonry" && "aspect-3/4",
              )}
            >
              <HugeiconsIcon icon={PackageIcon} className="size-8 text-muted-foreground/40" />
            </div>
          )}
        </MediaGalleryLink>
      </MediaGalleryTile>
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
