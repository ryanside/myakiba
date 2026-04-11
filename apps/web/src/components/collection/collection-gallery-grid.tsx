import { HugeiconsIcon } from "@hugeicons/react";
import {
  Copy01Icon,
  Delete02Icon,
  Edit03Icon,
  Loading03Icon,
  MoreHorizontalIcon,
  MoveIcon,
  PackageIcon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import CollectionItemForm from "./collection-item-form";
import UnifiedItemMoveForm from "@/components/orders/unified-item-move-form";
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
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <HugeiconsIcon icon={PackageIcon} className="mb-3 size-10 opacity-40" />
        <p className="text-sm font-medium">No items found</p>
        <p className="text-xs">Try adjusting your filters</p>
      </div>
    );
  }

  const tiles = items.map((item, index) => {
    const isSelected = !!rowSelection[item.id];
    const isPending = isCollectionPending(item.id) || isCollectionOrderPending(item.id);
    const selectedItems = {
      collectionIds: new Set([item.id]),
      orderIds: item.orderId ? new Set([item.orderId]) : new Set<string>(),
    };
    const staggerDelay = Math.min(index, MAX_STAGGER_INDEX) * STAGGER_DELAY_MS;

    return (
      <div
        key={item.id}
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
            onCheckedChange={() => toggleSelection(item.id)}
            aria-label={`Select ${item.itemTitle}`}
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
                    to="/items/$id"
                    params={{ id: item.itemId }}
                    className="flex items-center gap-1.5"
                  >
                    <HugeiconsIcon icon={ViewIcon} />
                    View details
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    if (item.itemExternalId) {
                      navigator.clipboard.writeText(item.itemExternalId.toString());
                      toast.success("Copied MFC item ID to clipboard");
                    } else {
                      toast.error("No MFC item ID for custom items");
                    }
                  }}
                >
                  <HugeiconsIcon icon={Copy01Icon} />
                  Copy MFC ID
                </DropdownMenuItem>
                <CollectionItemForm
                  renderTrigger={
                    <DropdownMenuItem closeOnClick={false} disabled={isPending}>
                      <HugeiconsIcon icon={Edit03Icon} />
                      {isPending ? "Saving..." : "Edit item"}
                    </DropdownMenuItem>
                  }
                  itemData={item}
                  callbackFn={onEditCollectionItem}
                  currency={currency}
                  dateFormat={dateFormat}
                />
                <UnifiedItemMoveForm
                  renderTrigger={
                    <DropdownMenuItem closeOnClick={false} disabled={isPending}>
                      <HugeiconsIcon icon={MoveIcon} />
                      {isPending ? "Assigning..." : "Assign Order"}
                    </DropdownMenuItem>
                  }
                  selectedItems={selectedItems}
                  onMoveToExisting={onAddCollectionItemsToOrder}
                  onMoveToNew={onAddCollectionItemsToNewOrder}
                  clearSelections={() => {}}
                  currency={currency}
                  intent="add"
                />
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                disabled={isPending}
                onClick={() => onDeleteCollectionItems(new Set([item.id]))}
              >
                <HugeiconsIcon icon={Delete02Icon} />
                {isPending ? "Deleting..." : "Delete item"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <Link to="/items/$id" params={{ id: item.itemId }} className="block">
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
