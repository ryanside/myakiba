import { useCollectionPending } from "./collection-pending-context";
import { HugeiconsIcon } from "@hugeicons/react";
import { PackageIcon } from "@hugeicons/core-free-icons";
import { CollectionItemControls } from "@/components/collection/collection-item-controls";
import {
  CategoryLabel,
  MediaCard,
  MediaCardBody,
  MediaCardImage,
  MediaCardSkeleton,
  MediaCardTitle,
  CARD_GRID_GAP_CLASS_NAME,
} from "@/components/media-tile";
import { cn } from "@/lib/utils";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { NO_SCALE } from "@myakiba/contracts/shared/scale";
import type { CollectionItem, CollectionItemFormValues } from "@myakiba/contracts/collection/types";
import type { CascadeOptions, NewOrder } from "@myakiba/contracts/orders/schema";
import type { Currency, DateFormat } from "@myakiba/contracts/shared/types";
import type { RowSelectionState } from "@tanstack/react-table";
import { itemDestination } from "@/lib/item-destination";

interface CollectionCardGridProps {
  readonly items: readonly CollectionItem[];
  readonly cardWidth: number;
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
  readonly locale: string;
  readonly dateFormat: DateFormat;
  readonly isLoading: boolean;
}

export function CollectionCardGrid({
  items,
  cardWidth,
  rowSelection,
  onRowSelectionChange,
  onEditCollectionItem,
  onDeleteCollectionItems,
  onAddCollectionItemsToOrder,
  onAddCollectionItemsToNewOrder,
  currency,
  locale,
  dateFormat,
  isLoading,
}: CollectionCardGridProps): React.JSX.Element {
  const { isCollectionPending, isCollectionOrderPending } = useCollectionPending();
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
      <div className={cn("grid", CARD_GRID_GAP_CLASS_NAME)} style={gridStyle} aria-hidden="true">
        {Array.from({ length: 12 }).map((_, i) => (
          <MediaCardSkeleton key={i} imageClassName="aspect-4/5" />
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

  return (
    <div className={cn("grid", CARD_GRID_GAP_CLASS_NAME)} style={gridStyle}>
      {items.map((item) => {
        const isSelected = !!rowSelection[item.id];
        const isPending = isCollectionPending(item.id) || isCollectionOrderPending(item.id);
        const itemLink = itemDestination(item.itemId, item.itemExternalId);

        return (
          <MediaCard key={item.id} selected={isSelected} className="animate-data-in">
            <CollectionItemControls
              item={item}
              itemSize={cardWidth}
              variant="card"
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

            <MediaCardImage destination={itemLink} title={item.itemTitle} className="aspect-4/5">
              {item.itemImage ? (
                <img
                  src={item.itemImage}
                  alt={item.itemTitle}
                  className="size-full object-cover object-top"
                  loading="lazy"
                />
              ) : (
                <div className="flex size-full items-center justify-center">
                  <HugeiconsIcon icon={PackageIcon} className="size-8 text-muted-foreground/40" />
                </div>
              )}
            </MediaCardImage>

            <MediaCardBody>
              <span className="flex min-w-0 items-center justify-between gap-2">
                <CategoryLabel category={item.itemCategory} />
                {item.itemScale && item.itemScale !== NO_SCALE ? (
                  <span className="shrink-0 text-xs leading-4 text-muted-foreground tabular-nums">
                    {item.itemScale}
                  </span>
                ) : null}
              </span>
              <MediaCardTitle as="h3" title={item.itemTitle} destination={itemLink} />
              <span className="mt-auto flex min-w-0 items-baseline justify-between gap-2 pt-1">
                {/* An unpriced item says so plainly instead of claiming it cost $0.00. */}
                {item.price > 0 ? (
                  <span className="shrink-0 text-sm leading-5 font-medium tabular-nums">
                    {formatCurrencyFromMinorUnits(item.price, currency, locale)}
                  </span>
                ) : (
                  <span className="shrink-0 text-xs leading-5 text-muted-foreground">No price</span>
                )}
                {item.shop && !isCompact ? (
                  <span
                    className="min-w-0 truncate text-xs leading-4 text-muted-foreground"
                    title={item.shop}
                  >
                    {item.shop}
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
