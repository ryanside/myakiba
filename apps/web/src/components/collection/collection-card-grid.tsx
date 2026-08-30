import { HugeiconsIcon } from "@hugeicons/react";
import { PackageIcon } from "@hugeicons/core-free-icons";
import { Link } from "@tanstack/react-router";
import { CollectionItemControls } from "@/components/collection/collection-item-controls";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
      <p className="flex h-64 items-center justify-center text-lg text-muted-foreground">
        No items found.
      </p>
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
              "group/item relative gap-0 rounded-2xl bg-white p-1.5! ring-0 ring-offset-2 ring-offset-background shadow-[0_0_0_1px_oklch(0_0_0/0.06),0_1px_2px_-1px_oklch(0_0_0/0.06),0_2px_4px_oklch(0_0_0/0.04)] transition-[box-shadow] duration-200 ease-out hover:shadow-[0_0_0_1px_oklch(0_0_0/0.08),0_2px_4px_-1px_oklch(0_0_0/0.08),0_10px_24px_-8px_oklch(0_0_0/0.14)] motion-reduce:transition-none dark:bg-card dark:shadow-[0_0_0_1px_oklch(1_0_0/0.08)] dark:hover:shadow-[0_0_0_1px_oklch(1_0_0/0.13)]",
              isSelected
                ? "ring-2 ring-primary"
                : "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
            )}
          >
            <CollectionItemControls
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
              {...(item.itemExternalId === null
                ? ({ to: "/item/custom/$id", params: { id: item.itemId } } as const)
                : ({
                    to: "/item/$externalId",
                    params: { externalId: item.itemExternalId },
                  } as const))}
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
                  {...(item.itemExternalId === null
                    ? ({ to: "/item/custom/$id", params: { id: item.itemId } } as const)
                    : ({
                        to: "/item/$externalId",
                        params: { externalId: item.itemExternalId },
                      } as const))}
                  className="line-clamp-2 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
