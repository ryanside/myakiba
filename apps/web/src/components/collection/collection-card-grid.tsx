import { HugeiconsIcon } from "@hugeicons/react";
import {
  Copy01Icon,
  Delete02Icon,
  Edit01Icon,
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
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import CollectionItemForm from "./collection-item-form";
import UnifiedItemMoveForm from "@/components/orders/unified-item-move-form";
import { getCategoryColor } from "@/lib/category-colors";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { cn } from "@/lib/utils";
import type { CollectionItem, CollectionItemFormValues } from "@myakiba/contracts/collection/types";
import type { CascadeOptions, NewOrder } from "@myakiba/contracts/orders/schema";
import type { Currency, DateFormat } from "@myakiba/contracts/shared/types";
import type { RowSelectionState } from "@tanstack/react-table";
import { ThemedBadge } from "../reui/badge";

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

  const gridStyle = {
    gridTemplateColumns: `repeat(auto-fill, minmax(${cardWidth}px, 1fr))`,
  } as const;

  if (isLoading) {
    return (
      <div className="grid gap-3" style={gridStyle}>
        {Array.from({ length: 12 }).map((_, i) => (
          <Card key={i} size="sm" className="p-0!">
            <Skeleton className="aspect-3/4 w-full" />
            <CardHeader>
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </CardHeader>
            <CardFooter>
              <Skeleton className="h-3 w-1/3" />
            </CardFooter>
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
      {items.map((item) => {
        const isSelected = !!rowSelection[item.id];
        const isPending = isCollectionPending(item.id) || isCollectionOrderPending(item.id);
        const selectedItems = {
          collectionIds: new Set([item.id]),
          orderIds: item.orderId ? new Set([item.orderId]) : new Set<string>(),
        };

        return (
          <Card
            key={item.id}
            size="sm"
            className={cn("relative p-0!", isSelected && "ring-primary")}
          >
            {/* Selection + Actions overlay */}
            <div className="absolute inset-x-0 top-0 z-10 flex items-start justify-between p-2">
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => toggleSelection(item.id)}
                aria-label={`Select ${item.itemTitle}`}
                className={cn(
                  "border-white/60 bg-black/20 backdrop-blur-sm data-checked:border-primary data-checked:bg-primary",
                  !isSelected && "opacity-0 group-hover/card:opacity-100 transition-opacity",
                )}
              />
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className={cn(
                        "bg-black/20 text-white backdrop-blur-sm hover:bg-black/40 hover:text-white",
                        !isSelected &&
                          "opacity-0 group-hover/card:opacity-100 data-popup-open:opacity-100 transition-opacity",
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
                          <HugeiconsIcon icon={Edit01Icon} />
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

            {/* Image */}
            <Link to="/items/$id" params={{ id: item.itemId }} className="block">
              <div className="relative aspect-3/4 w-full overflow-hidden bg-muted">
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

            <CardHeader>
              <CardTitle>
                <Link
                  to="/items/$id"
                  params={{ id: item.itemId }}
                  className="line-clamp-2 hover:underline underline-offset-2"
                >
                  {item.itemTitle}
                </Link>
              </CardTitle>
              <CardDescription className="flex items-center gap-1.5 text-xs">
                {item.itemCategory ? (
                  <span style={{ color: getCategoryColor(item.itemCategory) }}>
                    {item.itemCategory}
                  </span>
                ) : null}
                {item.itemScale ? (
                  <>
                    <span className="text-border">·</span>
                    <span>{item.itemScale}</span>
                  </>
                ) : null}
              </CardDescription>
            </CardHeader>

            <CardFooter className="mt-auto justify-between py-2.5!">
              <span className="text-sm font-medium tabular-nums">
                {formatCurrencyFromMinorUnits(item.price, currency, locale)}
              </span>
              {item.shop ? (
                <ThemedBadge variant="secondary" size="sm">
                  {item.shop}
                </ThemedBadge>
              ) : null}
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );
}
