import type { ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Package01Icon } from "@hugeicons/core-free-icons";
import { ItemSyncActions } from "@/components/item/item-sync-actions";
import {
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";
import {
  CollectionItemCard,
  CollectionItemCardSkeleton,
} from "@/components/item/collection-item-card";
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

  return (
    <div className="lg:col-span-2 lg:pl-8 pt-8 pb-8">
      <h2 className="text-xs font-medium text-muted-foreground">Your Collection</h2>

      <div className="mt-4">
        {isPending && <CollectionItemCardSkeleton />}

        {isError && (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon icon={Package01Icon} />
              </EmptyMedia>
              <EmptyTitle>Error Loading Collection</EmptyTitle>
              <EmptyDescription>{errorMessage}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        {!isPending && !isError && collectionItems.length === 0 && (
          <Empty className="py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon icon={Package01Icon} />
              </EmptyMedia>
              <EmptyTitle>Not in your collection</EmptyTitle>
              <EmptyDescription>Add this item to your collection or a new order.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <ItemSyncActions onSyncCollection={onSyncCollection} onSyncOrder={onSyncOrder} />
            </EmptyContent>
          </Empty>
        )}

        {!isPending && !isError && item && collectionItems.length > 0 ? (
          <div className="flex flex-col gap-8">
            {collectionItems.map((collectionItem, idx) => (
              <CollectionItemCard
                key={collectionItem.id}
                collectionItem={collectionItem}
                item={item}
                externalId={externalId}
                relatedOrder={
                  collectionItem.orderId
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
                isOrderActionPending={isCollectionOrderPending(collectionItem.id)}
                className={cn(idx > 0 && "border-t border-border/40 pt-8")}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
