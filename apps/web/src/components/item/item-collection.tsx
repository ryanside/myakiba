import type { ReactNode } from "react";
import { AddLink } from "@/components/add/add-link";
import { LoadError } from "@/components/page-states";
import { CollectionItemCard } from "@/components/item/collection-item-card";
import { cn } from "@/lib/utils";
import type { ItemCollectionEntry, ItemDetail, ItemRelatedOrder } from "@/components/item/types";
import type { CollectionItemFormValues } from "@myakiba/contracts/collection/types";
import type { CascadeOptions, NewOrder } from "@myakiba/contracts/orders/schema";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import type { Saving } from "@/data/client";

export function ItemCollection({
  item,
  externalId,
  collectionItems,
  ordersList,
  isPending,
  isError,
  error,
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
  readonly error: Error | null;
  readonly onEditCollectionItem: (values: CollectionItemFormValues) => Saving;
  readonly onDeleteCollectionItems: (collectionIds: ReadonlySet<string>) => Saving;
  readonly onMoveToExistingOrder: (
    targetOrderId: string,
    collectionIds: ReadonlySet<string>,
    orderIds?: ReadonlySet<string>,
  ) => Saving;
  readonly onMoveToNewOrder: (
    values: NewOrder,
    cascadeOptions: CascadeOptions,
    collectionIds: ReadonlySet<string>,
  ) => Saving;
  readonly isCollectionOrderPending: (collectionId: string) => boolean;
}): ReactNode {
  const { currency, locale, dateFormat } = useUserPreferences();

  const collectionRows = isPending ? [null] : collectionItems;

  return (
    <div className="lg:col-span-2 lg:pl-8 pt-8 pb-8" aria-busy={isPending}>
      <h2 className="text-xs font-medium text-muted-foreground">Your Collection</h2>

      <div className="mt-4">
        {isError && <LoadError title="Couldn't load your Collection" error={error} />}

        {!isPending && !isError && collectionItems.length === 0 && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-pretty text-muted-foreground">
              Not in your collection yet. Add it to your collection, or start a new order with it.
            </p>
            {item ? (
              <div className="flex w-full flex-col justify-start gap-2 sm:flex-row">
                <AddLink search={{ item: item.id, to: "collection" }}>Add to collection</AddLink>
                <AddLink search={{ item: item.id, to: "order-new" }} variant="outline">
                  Add to an order
                </AddLink>
              </div>
            ) : null}
          </div>
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
