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

  return {
    ...old,
    collection: old.collection.filter(
      (item: CollectionItem) => !collectionIds.has(item.id)
    ),
  };
}

export function createOptimisticEditUpdate(
  old: CollectionQueryResponse,
  values: CollectionItemFormValues
) {
  const collectionItem = old.collection.find(
    (item: CollectionItem) => item.id === values.id
  );
  if (!collectionItem) return old;

  return {
    ...old,
    collection: old.collection.map((item: CollectionItem) =>
      item.id === values.id ? { ...item, ...values } : item
    ),
  };
}
