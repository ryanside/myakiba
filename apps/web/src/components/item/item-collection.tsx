import type { ReactNode } from "react";
import { PackageIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ItemSyncActions } from "@/components/item/item-sync-actions";
import { LoadError, STATE_ICON_CLASS_NAME, STATE_PANEL_CLASS_NAME } from "@/components/page-states";
import {
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { CollectionItemCard } from "@/components/item/collection-item-card";
import { cn } from "@/lib/utils";
import type { ItemCollectionEntry, ItemDetail, ItemRelatedOrder } from "@/components/item/types";
import type { CollectionItemFormValues } from "@myakiba/contracts/collection/types";
import type { CascadeOptions, NewOrder } from "@myakiba/contracts/orders/schema";
import { useUserPreferences } from "@/hooks/use-user-preferences";

export function ItemCollection({
  item,
  externalId,
  collectionItems,
  ordersList,
  isPending,
  isError,
  errorMessage,
  onSyncCollection,
  onSyncOrder,
  onEditCollectionItem,
  onDeleteCollectionItems,
  onMoveToExistingOrder,
  onMoveToNewOrder,
  isCollectionOrderPending,
}: {
  readonly item: ItemDetail | undefined;
  readonly externalId: number;
  readonly collectionItems: readonly ItemCollectionEntry[];
  readonly ordersList: readonly ItemRelatedOrder[];
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly errorMessage: string | undefined;
  readonly onSyncCollection: () => void;
  readonly onSyncOrder: () => void;
  readonly onEditCollectionItem: (values: CollectionItemFormValues) => Promise<void>;
  readonly onDeleteCollectionItems: (collectionIds: ReadonlySet<string>) => Promise<void>;
  readonly onMoveToExistingOrder: (
    targetOrderId: string,
    collectionIds: ReadonlySet<string>,
    orderIds?: ReadonlySet<string>,
  ) => Promise<void>;
  readonly onMoveToNewOrder: (
    values: NewOrder,
    cascadeOptions: CascadeOptions,
    collectionIds: ReadonlySet<string>,
  ) => Promise<void>;
  readonly isCollectionOrderPending: (collectionId: string) => boolean;
}): ReactNode {
  const { currency, locale, dateFormat } = useUserPreferences();

  const collectionRows = isPending ? [null] : collectionItems;

  return (
    <div className="lg:col-span-2 lg:pl-8 pt-8 pb-8" aria-busy={isPending}>
      <h2 className="text-xs font-medium text-muted-foreground">Your Collection</h2>

      <div className="mt-4">
        {isError && (
          <LoadError
            title="Couldn't load your Collection"
            message={errorMessage ?? "Failed to load collection"}
          />
        )}

        {!isPending && !isError && collectionItems.length === 0 && (
          <Empty className={STATE_PANEL_CLASS_NAME}>
            <EmptyHeader>
              <EmptyMedia variant="icon" className={STATE_ICON_CLASS_NAME}>
                <HugeiconsIcon icon={PackageIcon} className="size-5" aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>Not in your collection</EmptyTitle>
              <EmptyDescription>Add this item to your collection or a new order.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <ItemSyncActions onSyncCollection={onSyncCollection} onSyncOrder={onSyncOrder} />
            </EmptyContent>
          </Empty>
        )}

        {!isError && (isPending || (item && collectionItems.length > 0)) ? (
          <div className="flex flex-col gap-8">
            {collectionRows.map((collectionItem, index) => (
              <CollectionItemCard
                key={collectionItem?.id ?? "loading-collection-item"}
                collectionItem={collectionItem}
                item={item}
                externalId={externalId}
                relatedOrder={
                  collectionItem?.orderId
                    ? ordersList.find((order) => order.id === collectionItem.orderId)
                    : undefined
                }
                currency={currency}
                locale={locale}
                dateFormat={dateFormat}
                onEdit={onEditCollectionItem}
                onDelete={onDeleteCollectionItems}
                onMoveToExisting={onMoveToExistingOrder}
                onMoveToNew={onMoveToNewOrder}
                isOrderActionPending={
                  collectionItem ? isCollectionOrderPending(collectionItem.id) : false
                }
                className={cn(index > 0 && "border-t border-border/40 pt-8")}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
