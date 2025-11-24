import type {
  CollectionItem,
  CollectionItemFormValues,
  CollectionQueryResponse,
  CollectionStats,
} from "./types";

function calculateCollectionStats(items: CollectionItem[]): CollectionStats {
  const totalItems = items.reduce((sum, item) => sum + item.count, 0);
  
  const totalSpent = items
    .filter(item => item.paymentDate)
    .reduce((sum, item) => {
      return sum + parseFloat(item.price || "0") * item.count;
    }, 0).toFixed(2);
  
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth();
  const currentYear = currentDate.getFullYear();
  
  const totalItemsThisMonth = items
    .filter(item => {
      if (!item.collectionDate) return false;
      const collectionDate = new Date(item.collectionDate);
      return collectionDate.getMonth() === currentMonth && 
             collectionDate.getFullYear() === currentYear;
    })
    .reduce((sum, item) => sum + item.count, 0);
  
  const totalSpentThisMonth = items
    .filter(item => {
      if (!item.collectionDate) return false;
      const collectionDate = new Date(item.collectionDate);
      return collectionDate.getMonth() === currentMonth && 
             collectionDate.getFullYear() === currentYear;
    })
    .reduce((sum, item) => {
      return sum + parseFloat(item.price || "0") * item.count;
    }, 0).toFixed(2);
  
  return {
    totalItems,
    totalSpent,
    totalItemsThisMonth,
    totalSpentThisMonth,
  };
}

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
      collectionStats: calculateCollectionStats(updatedItems),
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
      collectionStats: calculateCollectionStats(updatedItems),
    },
  };
}
