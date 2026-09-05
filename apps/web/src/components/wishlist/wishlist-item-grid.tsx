import { DndContext, DragOverlay, closestCenter } from "@dnd-kit/core";
import { snapCenterToCursor } from "@dnd-kit/modifiers";
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { DragDropVerticalIcon, PackageIcon, StarIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ITEM_CATEGORY_GROUPS } from "@myakiba/contracts/shared/constants";
import type { Category, Currency, DateFormat } from "@myakiba/contracts/shared/types";
import type { PositionOrderInput } from "@myakiba/contracts/shared/position-order";
import { Link } from "@tanstack/react-router";
import type { CSSProperties } from "react";
import { ImageThumbnail } from "@/components/ui/image-thumbnail";
import { ItemControl, ItemControls } from "@/components/ui/item-controls";
import { Spinner } from "@/components/ui/spinner";
import type { GridListViewMode } from "@/components/ui/view-toggle";
import { useSortableItems } from "@/hooks/use-sortable-items";
import { getCategoryColor } from "@/lib/category-colors";
import { formatDateOnlyForDisplay } from "@/lib/date-display";
import { formatReleaseDate } from "@/lib/locale";
import { cn } from "@/lib/utils";
import type { getWishlistItems } from "@/queries/wishlist";

type WishlistPage = NonNullable<Awaited<ReturnType<typeof getWishlistItems>>>;
type WishlistItem = WishlistPage["items"][number];

const MAX_STAGGER_INDEX = 20;
const STAGGER_DELAY_MS = 30;
const EMPTY_SELECTED_IDS: ReadonlySet<string> = new Set();
const clearEmptySelection = (): void => undefined;
const CATEGORY_GROUP_BY_CATEGORY = Object.fromEntries(
  Object.entries(ITEM_CATEGORY_GROUPS).flatMap(([group, categories]) =>
    categories.map((category) => [category, group]),
  ),
) as Readonly<Record<Category, keyof typeof ITEM_CATEGORY_GROUPS>>;

function WishlistItemLink({
  wishlistItem,
  rank,
  viewMode,
  currency,
  dateFormat,
}: {
  readonly wishlistItem: WishlistItem;
  readonly rank: number;
  readonly viewMode: GridListViewMode;
  readonly currency: Currency;
  readonly dateFormat: DateFormat;
}): React.JSX.Element {
  const category = wishlistItem.category ?? "Uncategorized";
  const categoryGroup = wishlistItem.category
    ? CATEGORY_GROUP_BY_CATEGORY[wishlistItem.category]
    : "—";
  const categoryColor = getCategoryColor(wishlistItem.category);
  const releaseDate = wishlistItem.latestRelease
    ? formatDateOnlyForDisplay(wishlistItem.latestRelease.date, dateFormat)
    : "No release";
  const releasePrice =
    formatReleaseDate(
      wishlistItem.latestRelease?.price,
      wishlistItem.latestRelease?.priceCurrency,
      currency,
    ) ?? "No price";
  const content = (
    <>
      <span
        aria-label={`Ranking #${rank}`}
        className={cn(
          "shrink-0 text-center font-normal tabular-nums",
          viewMode === "grid"
            ? "absolute top-2 left-2 z-10 min-w-7 rounded-md bg-black/55 px-2 py-1 text-xs text-white shadow-sm backdrop-blur-sm"
            : "w-9 text-sm text-muted-foreground",
        )}
      >
        #{rank}
      </span>
      <div
        className={cn(
          "shrink-0",
          viewMode === "grid" ? "aspect-square w-full" : "size-16 overflow-hidden rounded-md",
        )}
      >
        <ImageThumbnail
          images={wishlistItem.image ? [wishlistItem.image] : []}
          title={wishlistItem.title}
          fallbackIcon={
            <HugeiconsIcon icon={PackageIcon} className="size-8 text-muted-foreground/40" />
          }
          className="aspect-square w-full [&_img]:-outline-offset-1 [&_img]:outline [&_img]:outline-black/10 dark:[&_img]:outline-white/10"
          decorative
          loading="lazy"
        />
      </div>
      {viewMode === "grid" ? (
        <div
          key="grid-metadata"
          className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-1 bg-black/50 p-2.5 text-white opacity-0 backdrop-blur-sm transition-[translate,opacity] duration-150 ease-out group-hover/media:translate-y-0 group-hover/media:opacity-100 group-focus-visible/media:translate-y-0 group-focus-visible/media:opacity-100 any-pointer-coarse:translate-y-0 any-pointer-coarse:opacity-100"
        >
          <p className="line-clamp-2 text-sm font-medium leading-tight">{wishlistItem.title}</p>
          <div className="mt-2 flex min-w-0 items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[11px] leading-4 text-white/60">{categoryGroup}</p>
              <p className="truncate text-xs leading-4" style={{ color: categoryColor }}>
                {category}
              </p>
            </div>
            <div className="shrink-0 text-right tabular-nums">
              <p className="text-[11px] leading-4 text-white/60">{releaseDate}</p>
              <p className="text-xs leading-4 font-medium text-white">{releasePrice}</p>
            </div>
          </div>
        </div>
      ) : (
        <div
          key="list-metadata"
          className="flex min-w-0 flex-1 items-center justify-between gap-4 self-stretch py-0.5"
        >
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
            <p className="truncate text-sm font-medium leading-tight" title={wishlistItem.title}>
              {wishlistItem.title}
            </p>
            <div className="min-w-0">
              <p className="truncate text-[11px] leading-4 text-muted-foreground">
                {categoryGroup}
              </p>
              <p className="truncate text-xs leading-4" style={{ color: categoryColor }}>
                {category}
              </p>
            </div>
          </div>
          <div className="shrink-0 text-right tabular-nums">
            <p className="text-[11px] leading-4 text-muted-foreground">{releaseDate}</p>
            <p className="text-xs leading-4 font-medium text-foreground">{releasePrice}</p>
          </div>
        </div>
      )}
    </>
  );
  const className = cn(
    "group/media focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    viewMode === "grid" ? "block" : "flex min-w-0 flex-1 items-center gap-3 p-2",
  );

  if (wishlistItem.itemExternalId !== null) {
    return (
      <Link
        to="/item/$externalId"
        params={{ externalId: wishlistItem.itemExternalId }}
        className={className}
      >
        {content}
      </Link>
    );
  }

  return (
    <Link to="/item/custom/$id" params={{ id: wishlistItem.itemId }} className={className}>
      {content}
    </Link>
  );
}

function SortableWishlistItem({
  wishlistItem,
  index,
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
  readonly index: number;
  readonly viewMode: GridListViewMode;
  readonly currency: Currency;
  readonly dateFormat: DateFormat;
  readonly entranceAnimationActive: boolean;
  readonly isSaving: boolean;
  readonly sortingDisabled: boolean;
  readonly removingItemId: string | undefined;
  readonly dropIndicator?: "before" | "after";
  readonly onRemove: (itemId: string, itemExternalId: number | null) => Promise<void>;
  readonly onEntranceAnimationEnd?: () => void;
}): React.JSX.Element {
  const removing = removingItemId === wishlistItem.itemId;
  const mutationPending = isSaving || removingItemId !== undefined;
  const { attributes, isDragging, listeners, setActivatorNodeRef, setNodeRef } = useSortable({
    id: wishlistItem.id,
    disabled: sortingDisabled || mutationPending,
  });
  const entranceStyle = entranceAnimationActive
    ? ({
        "--data-in-delay": `${Math.min(index, MAX_STAGGER_INDEX) * STAGGER_DELAY_MS}ms`,
      } as CSSProperties)
    : undefined;

  return (
    <div ref={setNodeRef} className="relative">
      {dropIndicator ? (
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute z-30 rounded-full bg-primary",
            viewMode === "grid" ? "inset-y-2 w-0.5" : "inset-x-2 h-0.5",
            viewMode === "grid" && dropIndicator === "before" && "-left-1",
            viewMode === "grid" && dropIndicator === "after" && "-right-1",
            viewMode === "list" && dropIndicator === "before" && "top-0 -translate-y-1/2",
            viewMode === "list" && dropIndicator === "after" && "bottom-0 translate-y-1/2",
          )}
        />
      ) : null}
      <div
        className={cn(
          "group/item relative overflow-hidden",
          viewMode === "grid"
            ? "group/tile rounded-lg"
            : "group/row flex min-w-0 items-center rounded-md transition-colors duration-50 hover:bg-accent",
          entranceAnimationActive && "animate-data-in",
        )}
        style={entranceStyle}
        onAnimationEnd={(event) => {
          if (event.target === event.currentTarget && event.animationName === "data-in") {
            onEntranceAnimationEnd?.();
          }
        }}
      >
        <WishlistItemLink
          wishlistItem={wishlistItem}
          rank={index + 1}
          viewMode={viewMode}
          currency={currency}
          dateFormat={dateFormat}
        />
        <ItemControls
          key={viewMode}
          variant={viewMode === "grid" ? "media" : "surface"}
          active={viewMode === "list" || isDragging || removing}
          className={viewMode === "list" ? "mr-1" : undefined}
        >
          <ItemControl
            ref={setActivatorNodeRef}
            type="button"
            className="touch-none cursor-grab active:cursor-grabbing"
            {...attributes}
            {...listeners}
            aria-label={`Reorder ${wishlistItem.title}`}
            title="Drag to reorder"
            disabled={sortingDisabled || mutationPending}
          >
            <HugeiconsIcon icon={DragDropVerticalIcon} aria-hidden="true" />
          </ItemControl>
          <ItemControl
            type="button"
            aria-label={`Remove ${wishlistItem.title} from Wishlist`}
            title="Remove from Wishlist"
            disabled={mutationPending}
            onClick={async () => {
              try {
                await onRemove(wishlistItem.itemId, wishlistItem.itemExternalId);
              } catch {
                // The mutation reports the failure through its error toast.
              }
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
        </ItemControls>
      </div>
    </div>
  );
}

export function WishlistItemGrid({
  items,
  viewMode,
  currency,
  dateFormat,
  totalCount,
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
  readonly viewMode: GridListViewMode;
  readonly currency: Currency;
  readonly dateFormat: DateFormat;
  readonly totalCount: number;
  readonly isSaving: boolean;
  readonly sortingDisabled: boolean;
  readonly removingItemId: string | undefined;
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  readonly onLoadMore: () => Promise<{ readonly isFetchNextPageError: boolean }>;
  readonly onRemove: (itemId: string, itemExternalId: number | null) => Promise<void>;
  readonly onMove: (intent: PositionOrderInput) => Promise<void>;
}): React.JSX.Element {
  const {
    itemIds,
    entranceAnimationActive,
    finishEntranceAnimation,
    dndEpoch,
    activeId: activeItemId,
    dropIndicator,
    overlayLabel,
    sensors,
    announcements,
    screenReaderInstructions,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDragCancel,
  } = useSortableItems({
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

  return (
    <DndContext
      key={dndEpoch}
      accessibility={{ announcements, screenReaderInstructions }}
      collisionDetection={closestCenter}
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext
        items={itemIds}
        strategy={viewMode === "grid" ? rectSortingStrategy : verticalListSortingStrategy}
      >
        <div
          className={cn(
            viewMode === "grid"
              ? "grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2"
              : "flex flex-col gap-2",
            activeItemId && "pointer-events-none",
          )}
          aria-busy={isSaving}
        >
          {items.map((wishlistItem, index) => (
            <SortableWishlistItem
              key={wishlistItem.id}
              wishlistItem={wishlistItem}
              index={index}
              viewMode={viewMode}
              currency={currency}
              dateFormat={dateFormat}
              entranceAnimationActive={entranceAnimationActive}
              isSaving={isSaving}
              sortingDisabled={sortingDisabled || items.length < 2}
              removingItemId={removingItemId}
              dropIndicator={
                wishlistItem.id === dropIndicator?.id ? dropIndicator.placement : undefined
              }
              onRemove={onRemove}
              onEntranceAnimationEnd={
                index === items.length - 1 ? finishEntranceAnimation : undefined
              }
            />
          ))}
        </div>
      </SortableContext>
      <DragOverlay
        className="pointer-events-none flex items-center justify-center"
        dropAnimation={null}
        modifiers={[snapCenterToCursor]}
        zIndex={50}
      >
        {activeItemId ? (
          <div
            aria-hidden="true"
            className="rounded-lg bg-popover px-2.5 py-1.5 text-sm font-medium text-popover-foreground shadow-md ring-1 ring-foreground/10"
          >
            {overlayLabel}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
