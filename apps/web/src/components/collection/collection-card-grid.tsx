import { useState } from "react";
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
import { MediaItemAction, MediaItemToolbar } from "@/components/ui/media-item-toolbar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import CollectionItemForm from "./collection-item-form";
import UnifiedItemMoveForm from "@/components/orders/unified-item-move-form";
import { getCategoryColor } from "@/lib/category-colors";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { cn } from "@/lib/utils";
import type { CollectionItem, CollectionItemFormValues } from "@myakiba/contracts/collection/types";
import type { CascadeOptions, NewOrder } from "@myakiba/contracts/orders/schema";
import type { Currency, DateFormat } from "@myakiba/contracts/shared/types";
import type { CSSProperties } from "react";
import type { RowSelectionState } from "@tanstack/react-table";

const MAX_STAGGER_INDEX = 20;
const STAGGER_DELAY_MS = 30;

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
  readonly isCollectionPending: (collectionId: string) => boolean;
  readonly isCollectionOrderPending: (collectionId: string) => boolean;
  readonly isLoading: boolean;
}

function CollectionCardActions({
  item,
  itemSize,
  isPending,
  isSelected,
  onEditCollectionItem,
  onDeleteCollectionItems,
  onAddCollectionItemsToOrder,
  onAddCollectionItemsToNewOrder,
  onToggleSelection,
  currency,
  dateFormat,
}: {
  readonly item: CollectionItem;
  readonly itemSize: number;
  readonly isPending: boolean;
  readonly isSelected: boolean;
  readonly onEditCollectionItem: CollectionCardGridProps["onEditCollectionItem"];
  readonly onDeleteCollectionItems: CollectionCardGridProps["onDeleteCollectionItems"];
  readonly onAddCollectionItemsToOrder: CollectionCardGridProps["onAddCollectionItemsToOrder"];
  readonly onAddCollectionItemsToNewOrder: CollectionCardGridProps["onAddCollectionItemsToNewOrder"];
  readonly onToggleSelection: () => void;
  readonly currency: Currency;
  readonly dateFormat: DateFormat;
}): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const selectedItems = {
    collectionIds: new Set([item.id]),
    orderIds: item.orderId ? new Set([item.orderId]) : new Set<string>(),
  };

  return (
    <>
      <MediaItemToolbar
        checked={isSelected}
        itemLabel={item.itemTitle}
        itemSize={itemSize}
        onCheckedChange={onToggleSelection}
        active={menuOpen}
      >
        <CollectionItemForm
          renderTrigger={
            <MediaItemAction disabled={isPending} title="Edit item">
              <HugeiconsIcon icon={Edit03Icon} className="size-4" />
              <span className="sr-only">Edit item</span>
            </MediaItemAction>
          }
          itemData={item}
          callbackFn={onEditCollectionItem}
          currency={currency}
          dateFormat={dateFormat}
        />
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger
            render={
              <MediaItemAction disabled={isPending} title="More actions">
                <HugeiconsIcon
                  icon={isPending ? Loading03Icon : MoreHorizontalIcon}
                  className={cn("size-4", isPending && "animate-spin")}
                />
                <span className="sr-only">Open menu</span>
              </MediaItemAction>
            }
          />
          {menuOpen ? (
            <DropdownMenuContent align="end">
              <DropdownMenuItem>
                <Link
                  {...(item.itemExternalId !== null
                    ? ({
                        to: "/item/$externalId",
                        params: { externalId: item.itemExternalId },
                      } as const)
                    : ({ to: "/item/custom/$id", params: { id: item.itemId } } as const))}
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
              <UnifiedItemMoveForm
                renderTrigger={
                  <DropdownMenuItem closeOnClick={false}>
                    <HugeiconsIcon icon={MoveIcon} />
                    Assign order
                  </DropdownMenuItem>
                }
                selectedItems={selectedItems}
                onMoveToExisting={onAddCollectionItemsToOrder}
                onMoveToNew={onAddCollectionItemsToNewOrder}
                currency={currency}
                intent="add"
              />
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => {
                  setMenuOpen(false);
                  setDeleteOpen(true);
                }}
              >
                <HugeiconsIcon icon={Delete02Icon} />
                Delete item
              </DropdownMenuItem>
            </DropdownMenuContent>
          ) : null}
        </DropdownMenu>
      </MediaItemToolbar>
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete item?"
        description="This will permanently remove this item from your collection."
        onConfirm={() => onDeleteCollectionItems(new Set([item.id]))}
      />
    </>
  );
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
  isCollectionPending,
  isCollectionOrderPending,
  isLoading,
}: CollectionCardGridProps): React.JSX.Element {
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
        {Array.from({ length: 12 }).map((_, i) => (
          <Card
            key={i}
            size="sm"
            className="gap-0 rounded-2xl bg-white p-1.5! ring-0 shadow-[0_0_0_1px_oklch(0_0_0/0.06),0_1px_2px_-1px_oklch(0_0_0/0.06),0_2px_4px_oklch(0_0_0/0.04)] dark:bg-card dark:shadow-[0_0_0_1px_oklch(1_0_0/0.08)]"
          >
            <Skeleton className="aspect-4/5 w-full rounded-[10px]" />
            <div
              className={cn(
                "flex flex-col gap-2 px-3 pt-3 pb-2.5",
                isCompact && "px-2 pt-2.5 pb-2",
              )}
            >
              <Skeleton className="h-2.5 w-1/2" />
              <div className="space-y-1.5">
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-3/4" />
              </div>
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

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <HugeiconsIcon icon={PackageIcon} className="mb-3 size-10 opacity-40" />
        <p className="text-sm font-medium">No items found</p>
        <p className="text-xs">Try adjusting your filters</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3" style={gridStyle}>
      {items.map((item, index) => {
        const isSelected = !!rowSelection[item.id];
        const isPending = isCollectionPending(item.id) || isCollectionOrderPending(item.id);
        const staggerDelay = Math.min(index, MAX_STAGGER_INDEX) * STAGGER_DELAY_MS;

        return (
          <Card
            key={item.id}
            size="sm"
            className={cn(
              "group/media relative gap-0 rounded-2xl bg-white p-1.5! ring-0 ring-offset-2 ring-offset-background shadow-[0_0_0_1px_oklch(0_0_0/0.06),0_1px_2px_-1px_oklch(0_0_0/0.06),0_2px_4px_oklch(0_0_0/0.04)] transition-[box-shadow] duration-200 ease-out hover:shadow-[0_0_0_1px_oklch(0_0_0/0.08),0_2px_4px_-1px_oklch(0_0_0/0.08),0_10px_24px_-8px_oklch(0_0_0/0.14)] motion-reduce:transition-none dark:bg-card dark:shadow-[0_0_0_1px_oklch(1_0_0/0.08)] dark:hover:shadow-[0_0_0_1px_oklch(1_0_0/0.13)]",
              isSelected
                ? "ring-2 ring-primary"
                : "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
            )}
          >
            <CollectionCardActions
              item={item}
              itemSize={cardWidth}
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

            {/* Image */}
            <Link
              {...(item.itemExternalId !== null
                ? ({
                    to: "/item/$externalId",
                    params: { externalId: item.itemExternalId },
                  } as const)
                : ({ to: "/item/custom/$id", params: { id: item.itemId } } as const))}
              className="block overflow-hidden rounded-[10px] bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              title={item.itemTitle}
              style={{ "--data-in-delay": `${staggerDelay}ms` } as CSSProperties}
            >
              <div className="animate-data-in relative aspect-4/5 w-full overflow-hidden bg-muted">
                {item.itemImage ? (
                  <img
                    src={item.itemImage}
                    alt={item.itemTitle}
                    className="h-full w-full object-cover object-top"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <HugeiconsIcon icon={PackageIcon} className="size-8 text-muted-foreground/40" />
                  </div>
                )}
              </div>
            </Link>

            <div
              className={cn(
                "animate-data-in flex min-h-0 flex-1 flex-col px-3 pt-3 pb-2.5",
                isCompact && "px-2 pt-2.5 pb-2",
              )}
              style={
                {
                  "--data-in-delay": `${staggerDelay + STAGGER_DELAY_MS * 2}ms`,
                } as CSSProperties
              }
            >
              <div className="flex min-w-0 items-center gap-2 text-[11px] leading-none">
                {item.itemCategory ? (
                  <span className="truncate" style={{ color: getCategoryColor(item.itemCategory) }}>
                    {item.itemCategory}
                  </span>
                ) : null}
                {item.itemScale ? (
                  <span className="ml-auto shrink-0 text-muted-foreground tabular-nums">
                    {item.itemScale}
                  </span>
                ) : null}
              </div>

              <h3
                className={cn(
                  "mt-2 text-sm leading-snug font-medium text-balance",
                  isCompact && "mt-1.5 text-xs",
                )}
              >
                <Link
                  {...(item.itemExternalId !== null
                    ? ({
                        to: "/item/$externalId",
                        params: { externalId: item.itemExternalId },
                      } as const)
                    : ({ to: "/item/custom/$id", params: { id: item.itemId } } as const))}
                  className="line-clamp-2 decoration-foreground/30 underline-offset-3 transition-colors duration-150 hover:text-foreground/70 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  title={item.itemTitle}
                >
                  {item.itemTitle}
                </Link>
              </h3>

              <div className="mt-auto flex min-w-0 items-end justify-between gap-2 pt-4">
                <span
                  className={cn(
                    "shrink-0 text-base leading-none font-medium tracking-tight tabular-nums",
                    isCompact && "text-sm",
                  )}
                >
                  {formatCurrencyFromMinorUnits(item.price, currency, locale)}
                </span>
                {item.shop && !isCompact ? (
                  <span
                    className="min-w-0 truncate text-[11px] leading-none text-muted-foreground"
                    title={item.shop}
                  >
                    {item.shop}
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
