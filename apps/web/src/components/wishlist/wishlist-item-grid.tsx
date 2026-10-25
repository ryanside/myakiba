import { useSortable } from "@dnd-kit/sortable";
import { StarIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { AnimationEvent } from "react";
import type { Currency, DateFormat } from "@myakiba/contracts/shared/types";
import type { PositionOrderInput } from "@myakiba/contracts/shared/position-order";
import type { WishlistReleaseStatus } from "@myakiba/contracts/wishlist/schema";
import { MediaViewCollection, MediaViewSkeletons } from "@/components/media-tile";
import { ReleaseItemTile } from "@/components/release-item-tile";
import { DragHandle, SortableMediaCollection } from "@/components/sortable-media-collection";
import { ItemControl } from "@/components/ui/item-controls";
import { Spinner } from "@/components/ui/spinner";
import type { MediaViewMode } from "@/components/ui/view-toggle";
import { useSortableItems } from "@/hooks/use-sortable-items";
import { itemDestination } from "@/lib/item-destination";
import { cn } from "@/lib/utils";
import type { WishlistPage } from "@/data/resources/wishlist";

type WishlistItem = WishlistPage["items"][number];

const EMPTY_SELECTED_IDS: ReadonlySet<string> = new Set();
const clearEmptySelection = (): void => undefined;

function SortableWishlistItem({
  wishlistItem,
  releaseStatus,
  viewMode,
  currency,
  dateFormat,
  entranceAnimationActive,
  isSaving,
  sortingDisabled,
  removingItemId,
  dropIndicator,
  onRemove,
  onEntranceAnimationEnd,
}: {
  readonly wishlistItem: WishlistItem;
  readonly releaseStatus: WishlistReleaseStatus;
  readonly viewMode: MediaViewMode;
  readonly currency: Currency;
  readonly dateFormat: DateFormat;
  readonly entranceAnimationActive: boolean;
  readonly isSaving: boolean;
  readonly sortingDisabled: boolean;
  readonly removingItemId: string | undefined;
  readonly dropIndicator?: "before" | "after";
  readonly onRemove: (itemId: string, itemExternalId: number | null) => Promise<void>;
  readonly onEntranceAnimationEnd?: (event: AnimationEvent<HTMLDivElement>) => void;
}): React.JSX.Element {
  const removing = removingItemId === wishlistItem.itemId;
  const mutationPending = isSaving || removingItemId !== undefined;
  const { attributes, isDragging, listeners, setActivatorNodeRef, setNodeRef } = useSortable({
    id: wishlistItem.id,
    disabled: sortingDisabled || mutationPending,
  });

  return (
    <div ref={setNodeRef} className="relative">
      <ReleaseItemTile
        item={wishlistItem}
        destination={itemDestination(wishlistItem.itemId, wishlistItem.itemExternalId)}
        viewMode={viewMode}
        currency={currency}
        dateFormat={dateFormat}
        dropIndicator={dropIndicator}
        className={cn(entranceAnimationActive && "animate-data-in")}
        onAnimationEnd={onEntranceAnimationEnd}
        controlsActive={releaseStatus !== "all" || isDragging || removing}
        controls={
          <>
            <DragHandle
              ref={setActivatorNodeRef}
              {...attributes}
              {...listeners}
              label={`Reorder ${wishlistItem.title}`}
              disabled={sortingDisabled || mutationPending}
            />
            <ItemControl
              type="button"
              aria-label={`Remove ${wishlistItem.title} from Wishlist`}
              title="Remove from Wishlist"
              disabled={mutationPending}
              onClick={async () => {
                await onRemove(wishlistItem.itemId, wishlistItem.itemExternalId);
              }}
            >
              {removing ? (
                <Spinner />
              ) : (
                <HugeiconsIcon
                  icon={StarIcon}
                  fill="currentColor"
                  className="text-yellow-400"
                  aria-hidden="true"
                />
              )}
            </ItemControl>
          </>
        }
      />
    </div>
  );
}

export function WishlistItemGrid({
  items,
  releaseStatus,
  viewMode,
  currency,
  dateFormat,
  totalCount,
  isPending,
  isSaving,
  sortingDisabled,
  removingItemId,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  onRemove,
  onMove,
}: {
  readonly items: readonly WishlistItem[];
  readonly releaseStatus: WishlistReleaseStatus;
  readonly viewMode: MediaViewMode;
  readonly currency: Currency;
  readonly dateFormat: DateFormat;
  readonly totalCount: number;
  readonly isPending: boolean;
  readonly isSaving: boolean;
  readonly sortingDisabled: boolean;
  readonly removingItemId: string | undefined;
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  readonly onLoadMore: () => Promise<{ readonly isFetchNextPageError: boolean }>;
  readonly onRemove: (itemId: string, itemExternalId: number | null) => Promise<void>;
  readonly onMove: (intent: PositionOrderInput) => Promise<void>;
}): React.JSX.Element {
  const sortable = useSortableItems({
    items,
    totalCount,
    selectedIds: EMPTY_SELECTED_IDS,
    selectedLabel: "Wishlist Items",
    fallbackLabel: "Wishlist Item",
    screenReaderInstruction:
      "To reorder a Wishlist Item, press Space. Use the arrow keys to choose a new position, then press Space to drop it. Press Escape to cancel.",
    hasNextPage,
    isFetchingNextPage,
    onLoadMore,
    onMove,
    onClearSelection: clearEmptySelection,
  });

  if (isPending) {
    return <MediaViewSkeletons viewMode={viewMode} count={viewMode === "list" ? 6 : 10} />;
  }

  return (
    <SortableMediaCollection sortable={sortable} vertical={viewMode === "list"}>
      <MediaViewCollection
        viewMode={viewMode}
        className={cn(sortable.activeId && "pointer-events-none")}
        aria-busy={isSaving}
      >
        {items.map((wishlistItem) => (
          <SortableWishlistItem
            key={wishlistItem.id}
            wishlistItem={wishlistItem}
            releaseStatus={releaseStatus}
            viewMode={viewMode}
            currency={currency}
            dateFormat={dateFormat}
            entranceAnimationActive={sortable.entranceAnimationActive}
            isSaving={isSaving}
            sortingDisabled={releaseStatus !== "all" || sortingDisabled || items.length < 2}
            removingItemId={removingItemId}
            dropIndicator={sortable.dropPlacement(wishlistItem.id)}
            onRemove={onRemove}
            onEntranceAnimationEnd={sortable.entranceAnimationEnd(wishlistItem.id)}
          />
        ))}
      </MediaViewCollection>
    </SortableMediaCollection>
  );
}
