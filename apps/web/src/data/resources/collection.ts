import { keepPreviousData } from "@tanstack/react-query";
import type { Query } from "@tanstack/react-query";
import type { CollectionFilters } from "@myakiba/contracts/collection/schema";
import type {
  CollectionItem,
  CollectionItemFormValues,
  CollectionPage,
} from "@myakiba/contracts/collection/types";
import type { CascadeOptions, NewOrder } from "@myakiba/contracts/orders/schema";
import { hasActiveFiltersOrSorting } from "@/lib/filters";
import { deleteCollectionItems, getCollection, updateCollectionItem } from "@/queries/collection";
import { moveItem, splitOrders } from "@/queries/orders";
import { collectionWriteFamilies } from "../catalog";
import { defineCommand, rootedRead } from "../client";

// Shape of the cache backing the item detail route at `["item", externalId, "itemRelatedCollection"]`.
// The route returns a subset of CollectionItem fields under `collection`.
type ItemRelatedCollectionRow = Pick<
  CollectionItem,
  | "id"
  | "orderId"
  | "status"
  | "count"
  | "releaseId"
  | "score"
  | "price"
  | "shop"
  | "orderDate"
  | "paymentDate"
  | "shippingDate"
  | "collectionDate"
  | "shippingMethod"
  | "tags"
  | "condition"
  | "notes"
>;
type ItemRelatedCollectionData = { readonly collection: readonly ItemRelatedCollectionRow[] };

const isItemRelatedCollection = (query: Query) =>
  query.queryKey[0] === "item" && query.queryKey[2] === "itemRelatedCollection";

export const collection = {
  list: rootedRead("collection", {
    key: (filters: CollectionFilters) => ["collection", filters] as const,
    load: getCollection,
    placeholderData: keepPreviousData,
  }),
};

/** The collection list the page shows. Optimistic patches touch it only when no filter or sort is on. */
type OnList = { readonly list: CollectionFilters };

export const updateCollectionItemCommand = defineCommand({
  invalidates: collectionWriteFamilies,
  refetchAfterFailure: true,
  persist: ({ values }: { readonly values: CollectionItemFormValues } & OnList) =>
    updateCollectionItem(values),
  optimistic: async (queryClient, { values, list }) => {
    // Always patch the item detail cache. It is keyed by item externalId, so this update
    // is safe regardless of any list-page filter state.
    await queryClient.cancelQueries({ predicate: isItemRelatedCollection });
    const previousItemRelated = queryClient.getQueriesData<ItemRelatedCollectionData>({
      predicate: isItemRelatedCollection,
    });
    queryClient.setQueriesData<ItemRelatedCollectionData>(
      { predicate: isItemRelatedCollection },
      (old) =>
        old
          ? {
              ...old,
              collection: old.collection.map((item) =>
                item.id === values.id ? { ...item, ...values } : item,
              ),
            }
          : old,
    );

    const listKey = collection.list.key(list);
    let previousList: CollectionPage | undefined;
    if (!hasActiveFiltersOrSorting(list)) {
      await queryClient.cancelQueries({ queryKey: listKey });
      previousList = queryClient.getQueryData<CollectionPage>(listKey);
      queryClient.setQueryData<CollectionPage>(listKey, (old) =>
        old
          ? {
              ...old,
              items: old.items.map((item) =>
                item.id === values.id ? { ...item, ...values } : item,
              ),
            }
          : old,
      );
    }

    return () => {
      if (previousList) {
        queryClient.setQueryData<CollectionPage>(listKey, previousList);
      }
      for (const [queryKey, data] of previousItemRelated) {
        queryClient.setQueryData(queryKey, data);
      }
    };
  },
  successTitle: () => "Collection updated",
  failureTitle: () => "Failed to update collection item. Please try again.",
});

export const deleteCollectionItemsCommand = defineCommand({
  invalidates: collectionWriteFamilies,
  refetchAfterFailure: true,
  persist: ({ ids }: { readonly ids: readonly string[] } & OnList) =>
    deleteCollectionItems([...ids]),
  optimistic: async (queryClient, { ids, list }) => {
    const idSet = new Set(ids);

    await queryClient.cancelQueries({ predicate: isItemRelatedCollection });
    const previousItemRelated = queryClient.getQueriesData<ItemRelatedCollectionData>({
      predicate: isItemRelatedCollection,
    });
    queryClient.setQueriesData<ItemRelatedCollectionData>(
      { predicate: isItemRelatedCollection },
      (old) =>
        old ? { ...old, collection: old.collection.filter((item) => !idSet.has(item.id)) } : old,
    );

    const listKey = collection.list.key(list);
    let previousList: CollectionPage | undefined;
    if (!hasActiveFiltersOrSorting(list)) {
      await queryClient.cancelQueries({ queryKey: listKey });
      previousList = queryClient.getQueryData<CollectionPage>(listKey);

      queryClient.setQueryData<CollectionPage>(listKey, (old) => {
        if (!old) return old;
        let deletedValue = 0;
        const retainedItems: CollectionItem[] = [];
        for (const item of old.items) {
          if (idSet.has(item.id)) {
            deletedValue += item.price;
          } else {
            retainedItems.push(item);
          }
        }

        return {
          ...old,
          items: retainedItems,
          totalCount: old.totalCount - ids.length,
          totalValue: old.totalValue - deletedValue,
        };
      });
    }

    return () => {
      if (previousList) {
        queryClient.setQueryData<CollectionPage>(listKey, previousList);
      }
      for (const [queryKey, data] of previousItemRelated) {
        queryClient.setQueryData(queryKey, data);
      }
    };
  },
  successTitle: () => "Collection item(s) deleted",
  failureTitle: () => "Failed to delete collection item(s). Please try again.",
});

export const assignToOrderCommand = defineCommand({
  invalidates: collectionWriteFamilies,
  refetchAfterFailure: true,
  persist: ({
    targetOrderId,
    collectionIds,
    orderIds,
  }: {
    readonly targetOrderId: string;
    readonly collectionIds: ReadonlySet<string>;
    readonly orderIds?: ReadonlySet<string>;
  }) => moveItem(targetOrderId, collectionIds, orderIds),
  successTitle: ({ collectionIds }) =>
    collectionIds.size === 1
      ? "Order assigned"
      : `Successfully assigned ${collectionIds.size} items to an order`,
  failureTitle: () => "Failed to assign items to an order. Please try again.",
});

export const assignToNewOrderCommand = defineCommand({
  invalidates: collectionWriteFamilies,
  refetchAfterFailure: true,
  persist: ({
    values,
    collectionIds,
    cascadeOptions,
  }: {
    readonly values: NewOrder;
    readonly collectionIds: ReadonlySet<string>;
    readonly cascadeOptions: CascadeOptions;
  }) => splitOrders(values, collectionIds, cascadeOptions),
  successTitle: ({ collectionIds }) =>
    collectionIds.size === 1
      ? "Order assigned"
      : `Successfully assigned ${collectionIds.size} items to a new order`,
  failureTitle: () => "Failed to assign items to a new order. Please try again.",
});
