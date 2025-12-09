import type {
  CollectionItem,
  CollectionItemFormValues,
  CollectionQueryResponse,
} from "./types";

export function createOptimisticDeleteUpdate(
  old: CollectionQueryResponse,
  collectionIds: Set<string>
) {
  if (!old) return old;

  const updatedItems = old.collection.collectionItems.filter(
    (item: CollectionItem) => !collectionIds.has(item.id)
  );

  return {
    ...old,
    collection: {
      ...old.collection,
      collectionItems: updatedItems,
      collectionStats: old.collection.collectionStats,
    },
  };
}

export function createOptimisticEditUpdate(
  old: CollectionQueryResponse,
  values: CollectionItemFormValues
) {
  const collectionItem = old.collection.collectionItems.find(
    (item: CollectionItem) => item.id === values.id
  );
  if (!collectionItem) return old;

  const updatedItems = old.collection.collectionItems.map((item: CollectionItem) =>
    item.id === values.id ? { ...item, ...values } : item
  );

  return {
    ...old,
    collection: {
      ...old.collection,
      collectionItems: updatedItems,
      collectionStats: old.collection.collectionStats,
    },
  };
}
