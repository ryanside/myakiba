import type {
  CollectionItem,
  CollectionItemFormValues,
  CollectionQueryResponse,
  CollectionFilters,
} from "./types";

export function filterAndSortCollectionItems(
  items: CollectionItem[],
  filters: {
    search?: string;
    sort?: string;
    order?: string;
  }
): CollectionItem[] {
  let filteredItems = [...items];

  // Apply search filter (case-insensitive title search)
  if (filters.search && filters.search.trim()) {
    const searchTerm = filters.search.toLowerCase();
    filteredItems = filteredItems.filter((item) =>
      item.itemTitle.toLowerCase().includes(searchTerm)
    );
  }

  // Apply sorting
  const sortField = filters.sort || "createdAt";
  const sortOrder = filters.order || "desc";

  filteredItems.sort((a, b) => {
    let aRaw: string | number | Date | null | undefined;
    let bRaw: string | number | Date | null | undefined;
    let aValue: string | number | Date | null | undefined;
    let bValue: string | number | Date | null | undefined;

    switch (sortField) {
      case "itemTitle":
        aRaw = a.itemTitle;
        bRaw = b.itemTitle;
        aValue = aRaw ? aRaw.toLowerCase() : null;
        bValue = bRaw ? bRaw.toLowerCase() : null;
        break;
      case "itemCategory":
        aRaw = a.itemCategory;
        bRaw = b.itemCategory;
        aValue = aRaw ? aRaw.toLowerCase() : null;
        bValue = bRaw ? bRaw.toLowerCase() : null;
        break;
      case "itemScale":
        aRaw = a.itemScale;
        bRaw = b.itemScale;
        aValue = aRaw ? aRaw.toLowerCase() : null;
        bValue = bRaw ? bRaw.toLowerCase() : null;
        break;
      case "status":
        aRaw = a.status;
        bRaw = b.status;
        aValue = aRaw ? aRaw.toLowerCase() : null;
        bValue = bRaw ? bRaw.toLowerCase() : null;
        break;
      case "count":
        aRaw = a.count;
        bRaw = b.count;
        aValue = aRaw ?? null;
        bValue = bRaw ?? null;
        break;
      case "score":
        aRaw = a.score;
        bRaw = b.score;
        aValue = aRaw ? parseFloat(aRaw) : null;
        bValue = bRaw ? parseFloat(bRaw) : null;
        if (aValue !== null && isNaN(aValue)) aValue = null;
        if (bValue !== null && isNaN(bValue)) bValue = null;
        break;
      case "price":
        aRaw = a.price;
        bRaw = b.price;
        aValue = aRaw ? parseFloat(aRaw) : null;
        bValue = bRaw ? parseFloat(bRaw) : null;
        if (aValue !== null && isNaN(aValue)) aValue = null;
        if (bValue !== null && isNaN(bValue)) bValue = null;
        break;
      case "shop":
        aRaw = a.shop;
        bRaw = b.shop;
        aValue = aRaw ? aRaw.toLowerCase() : null;
        bValue = bRaw ? bRaw.toLowerCase() : null;
        break;
      case "orderDate":
        aRaw = a.orderDate;
        bRaw = b.orderDate;
        aValue = aRaw ? new Date(aRaw) : null;
        bValue = bRaw ? new Date(bRaw) : null;
        break;
      case "paymentDate":
        aRaw = a.paymentDate;
        bRaw = b.paymentDate;
        aValue = aRaw ? new Date(aRaw) : null;
        bValue = bRaw ? new Date(bRaw) : null;
        break;
      case "shippingDate":
        aRaw = a.shippingDate;
        bRaw = b.shippingDate;
        aValue = aRaw ? new Date(aRaw) : null;
        bValue = bRaw ? new Date(bRaw) : null;
        break;
      case "releaseDate":
        aRaw = a.releaseDate;
        bRaw = b.releaseDate;
        aValue = aRaw ? new Date(aRaw) : null;
        bValue = bRaw ? new Date(bRaw) : null;
        break;
      case "collectionDate":
        aRaw = a.collectionDate;
        bRaw = b.collectionDate;
        aValue = aRaw ? new Date(aRaw) : null;
        bValue = bRaw ? new Date(bRaw) : null;
        break;
      case "createdAt":
      default:
        aValue = new Date(a.createdAt);
        bValue = new Date(b.createdAt);
        break;
    }

    // Handle NULL comparisons (PostgreSQL behavior: ASC = NULLS LAST, DESC = NULLS FIRST)
    const aIsNull = aValue === null || aValue === undefined;
    const bIsNull = bValue === null || bValue === undefined;

    if (aIsNull && bIsNull) {
      // Both null - equal, use createdAt as tiebreaker
      const aCreatedAt = new Date(a.createdAt).getTime();
      const bCreatedAt = new Date(b.createdAt).getTime();
      const secondaryComparison = aCreatedAt - bCreatedAt;
      return sortOrder === "asc" ? secondaryComparison : -secondaryComparison;
    }

    if (aIsNull) {
      // a is null, b is not
      // ASC: nulls last (a after b) = return 1
      // DESC: nulls first (a before b) = return -1
      return sortOrder === "asc" ? 1 : -1;
    }

    if (bIsNull) {
      // b is null, a is not
      // ASC: nulls last (b after a) = return -1
      // DESC: nulls first (b before a) = return 1
      return sortOrder === "asc" ? -1 : 1;
    }

    // Both non-null - normal comparison
    let comparison = 0;
    if (aValue instanceof Date && bValue instanceof Date) {
      comparison = aValue.getTime() - bValue.getTime();
    } else if (typeof aValue === "number" && typeof bValue === "number") {
      comparison = aValue - bValue;
    } else {
      // String comparison
      const aStr = String(aValue);
      const bStr = String(bValue);
      comparison = aStr.localeCompare(bStr);
    }

    // Apply primary sort direction
    const primaryResult = sortOrder === "asc" ? comparison : -comparison;

    // If primary sort values are equal, use createdAt as stable tiebreaker
    if (comparison === 0) {
      const aCreatedAt = new Date(a.createdAt).getTime();
      const bCreatedAt = new Date(b.createdAt).getTime();
      const secondaryComparison = aCreatedAt - bCreatedAt;
      return sortOrder === "asc" ? secondaryComparison : -secondaryComparison;
    }

    return primaryResult;
  });

  return filteredItems;
}

export function createOptimisticDeleteUpdate(
  old: CollectionQueryResponse,
  collectionIds: Set<string>,
  filters: CollectionFilters
) {
  if (!old) return old;

  const updatedItems = old.collection.collectionItems.filter(
    (item: CollectionItem) => !collectionIds.has(item.id)
  );

  const sortedItems = filterAndSortCollectionItems(updatedItems, {
    search: filters.search,
    sort: filters.sort,
    order: filters.order,
  });

  return {
    ...old,
    collection: {
      ...old.collection,
      collectionItems: sortedItems,
      collectionStats: old.collection.collectionStats,
    },
  };
}

export function createOptimisticEditUpdate(
  old: CollectionQueryResponse,
  values: CollectionItemFormValues,
  filters: CollectionFilters
) {
  const collectionItem = old.collection.collectionItems.find(
    (item: CollectionItem) => item.id === values.id
  );
  if (!collectionItem) return old;

  const updatedItems = old.collection.collectionItems.map((item: CollectionItem) =>
    item.id === values.id ? { ...item, ...values } : item
  );

  const sortedItems = filterAndSortCollectionItems(updatedItems, {
    search: filters.search,
    sort: filters.sort,
    order: filters.order,
  });

  return {
    ...old,
    collection: {
      ...old.collection,
      collectionItems: sortedItems,
      collectionStats: old.collection.collectionStats,
    },
  };
}
