import type { CollectionItem, CollectionQueryResponse } from "./types";

export function createOptimisticDeleteUpdate(
  old: CollectionQueryResponse,
  collectionIds: Set<string>
) {
  if (!old) return old;

  return {
    ...old,
    collection: old.collection.filter(
      (item: CollectionItem) => !collectionIds.has(item.collectionId)
    ),
  };
}

export function createOptimisticEditUpdate(
  old: CollectionQueryResponse,
  values: CollectionItem
) {
  const collectionItem = old.collection.find(
    (item: CollectionItem) => item.collectionId === values.collectionId
  );
  if (!collectionItem) return old;

  return {
    ...old,
    collection: old.collection.map((item: CollectionItem) =>
      item.collectionId === values.collectionId ? values : item
    ),
  };
}
