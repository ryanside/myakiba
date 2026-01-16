import type {
  OrderFilters,
  NewOrder,
  Order,
  OrderItem,
  OrdersQueryResponse,
  CascadeOptions,
  EditedOrder,
} from "./types";
import type { VariantProps } from "class-variance-authority";
import { badgeVariants } from "@/components/ui/badge";
import type { CollectionItemFormValues } from "@/lib/collection/types";
import { COLLECTION_STATUSES, ORDER_STATUSES } from "@myakiba/constants";

const STATUS_VARIANT_MAP: Record<string, VariantProps<typeof badgeVariants>["variant"]> = {
  ...Object.fromEntries(COLLECTION_STATUSES.map((status) => [status.toLowerCase(), status === "Owned" ? "success" : status === "Shipped" ? "primary" : status === "Paid" ? "warning" : "info"])),
  ...Object.fromEntries(ORDER_STATUSES.map((status) => [status.toLowerCase(), status === "Owned" ? "success" : status === "Shipped" ? "primary" : status === "Paid" ? "warning" : "info"])),
};

export function getStatusVariant(
  status: string
): VariantProps<typeof badgeVariants>["variant"] {
  return STATUS_VARIANT_MAP[status.toLowerCase()] || "outline";
}

export function filterAndSortOrders(
  orders: Order[],
  filters: {
    search?: string;
    sort?: string;
    order?: string;
  }
): Order[] {
  let filteredOrders = [...orders];

  // Apply search filter (case-insensitive title search)
  if (filters.search && filters.search.trim()) {
    const searchTerm = filters.search.toLowerCase();
    filteredOrders = filteredOrders.filter((order) =>
      order.title.toLowerCase().includes(searchTerm)
    );
  }

  // Apply sorting
  const sortField = filters.sort || "createdAt";
  const sortOrder = filters.order || "desc";

  filteredOrders.sort((a, b) => {
    let aRaw: string | number | Date | null | undefined;
    let bRaw: string | number | Date | null | undefined;
    let aValue: string | number | Date | null | undefined;
    let bValue: string | number | Date | null | undefined;

    switch (sortField) {
      case "title":
        aRaw = a.title;
        bRaw = b.title;
        aValue = aRaw ? aRaw.toLowerCase() : null;
        bValue = bRaw ? bRaw.toLowerCase() : null;
        break;
      case "shop":
        aRaw = a.shop;
        bRaw = b.shop;
        aValue = aRaw ? aRaw.toLowerCase() : null;
        bValue = bRaw ? bRaw.toLowerCase() : null;
        break;
      case "status":
        aRaw = a.status;
        bRaw = b.status;
        aValue = aRaw ? aRaw.toLowerCase() : null;
        bValue = bRaw ? bRaw.toLowerCase() : null;
        break;
      case "orderDate":
      case "paymentDate":
      case "shippingDate":
      case "collectionDate":
      case "releaseMonthYear":
        aRaw = a[sortField as keyof typeof a] as string | null;
        bRaw = b[sortField as keyof typeof b] as string | null;
        aValue = aRaw || null;
        bValue = bRaw || null;
        break;
      case "shippingMethod":
        aRaw = a.shippingMethod;
        bRaw = b.shippingMethod;
        aValue = aRaw || null;
        bValue = bRaw || null;
        break;
      case "total":
        aRaw = a.total;
        bRaw = b.total;
        aValue = aRaw ? parseFloat(aRaw) : null;
        bValue = bRaw ? parseFloat(bRaw) : null;
        if (aValue !== null && isNaN(aValue)) aValue = null;
        if (bValue !== null && isNaN(bValue)) bValue = null;
        break;
      case "shippingFee":
        aRaw = a.shippingFee;
        bRaw = b.shippingFee;
        aValue = aRaw ? parseFloat(aRaw) : null;
        bValue = bRaw ? parseFloat(bRaw) : null;
        if (aValue !== null && isNaN(aValue)) aValue = null;
        if (bValue !== null && isNaN(bValue)) bValue = null;
        break;
      case "taxes":
        aRaw = a.taxes;
        bRaw = b.taxes;
        aValue = aRaw ? parseFloat(aRaw) : null;
        bValue = bRaw ? parseFloat(bRaw) : null;
        if (aValue !== null && isNaN(aValue)) aValue = null;
        if (bValue !== null && isNaN(bValue)) bValue = null;
        break;
      case "duties":
        aRaw = a.duties;
        bRaw = b.duties;
        aValue = aRaw ? parseFloat(aRaw) : null;
        bValue = bRaw ? parseFloat(bRaw) : null;
        if (aValue !== null && isNaN(aValue)) aValue = null;
        if (bValue !== null && isNaN(bValue)) bValue = null;
        break;
      case "tariffs":
        aRaw = a.tariffs;
        bRaw = b.tariffs;
        aValue = aRaw ? parseFloat(aRaw) : null;
        bValue = bRaw ? parseFloat(bRaw) : null;
        if (aValue !== null && isNaN(aValue)) aValue = null;
        if (bValue !== null && isNaN(bValue)) bValue = null;
        break;
      case "miscFees":
        aRaw = a.miscFees;
        bRaw = b.miscFees;
        aValue = aRaw ? parseFloat(aRaw) : null;
        bValue = bRaw ? parseFloat(bRaw) : null;
        if (aValue !== null && isNaN(aValue)) aValue = null;
        if (bValue !== null && isNaN(bValue)) bValue = null;
        break;
      case "itemCount":
        aRaw = a.itemCount;
        bRaw = b.itemCount;
        aValue = aRaw ?? null;
        bValue = bRaw ?? null;
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
    if (typeof aValue === "number" && typeof bValue === "number") {
      comparison = aValue - bValue;
    } else {
      // String comparison (works correctly for YYYY-MM-DD dates)
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
      // Secondary sort follows same direction as primary sort for consistency
      const secondaryComparison = aCreatedAt - bCreatedAt;
      return sortOrder === "asc" ? secondaryComparison : -secondaryComparison;
    }

    return primaryResult;
  });

  return filteredOrders;
}

export function createOptimisticMergeUpdate(
  old: OrdersQueryResponse,
  values: NewOrder,
  orderIds: Set<string>,
  filters: OrderFilters,
  cascadeOptions: CascadeOptions = []
): OrdersQueryResponse {
  if (!old) return old;

  const ordersToMerge = old.orders.filter((order: Order) =>
    orderIds.has(order.orderId)
  );

  if (!ordersToMerge) return old;

  const remainingOrders = old.orders.filter(
    (order: Order) => !orderIds.has(order.orderId)
  );

  const cascadeProperties = Object.fromEntries(
    cascadeOptions.map((option) => [
      option,
      values[option as keyof typeof values],
    ])
  );

  const combinedItems = ordersToMerge.flatMap((order: Order) =>
    (order.items || []).map((item: OrderItem) => ({
      ...item,
      ...cascadeProperties,
    }))
  );

  const ordersTotal = ordersToMerge.reduce((sum: number, order: Order) => {
    const total = parseFloat(order.total) || 0;
    return sum + total;
  }, 0);
  const additionalFees =
    parseFloat(values.shippingFee) +
    parseFloat(values.taxes) +
    parseFloat(values.duties) +
    parseFloat(values.tariffs) +
    parseFloat(values.miscFees);
  const combinedTotal = (ordersTotal + additionalFees).toFixed(2);

  const mergedOrder = {
    orderId: `temp-${Date.now()}`, // Temporary ID for optimistic update
    title: values.title,
    shop: values.shop,
    releaseMonthYear: values.releaseMonthYear,
    shippingMethod: values.shippingMethod,
    orderDate: values.orderDate,
    paymentDate: values.paymentDate,
    shippingDate: values.shippingDate,
    collectionDate: values.collectionDate,
    status: values.status,
    total: combinedTotal,
    shippingFee: values.shippingFee,
    taxes: values.taxes,
    duties: values.duties,
    tariffs: values.tariffs,
    miscFees: values.miscFees,
    notes: values.notes,
    itemCount: combinedItems.length,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    items: combinedItems,
    totalCount: old.totalCount,
  };

  const allOrders = [mergedOrder, ...remainingOrders];
  const filteredAndSortedOrders = filterAndSortOrders(allOrders, {
    search: filters.search,
    sort: filters.sort,
    order: filters.order,
  });

  return {
    ...old,
    orders: filteredAndSortedOrders,
    orderStats: old.orderStats,
    totalCount: old.totalCount - orderIds.size + 1,
  };
}

export function createOptimisticSplitUpdate(
  old: OrdersQueryResponse,
  values: NewOrder,
  orderIds: Set<string>,
  collectionIds: Set<string>,
  filters: OrderFilters,
  cascadeOptions: CascadeOptions = []
): OrdersQueryResponse {
  if (!old) return old;

  const ordersToSplit = old.orders.filter((order: Order) =>
    orderIds.has(order.orderId)
  );

  if (!ordersToSplit) return old;

  const remainingOrders = old.orders.filter(
    (order: Order) => !orderIds.has(order.orderId)
  );

  const cascadeProperties = Object.fromEntries(
    cascadeOptions.map((option) => [
      option,
      values[option as keyof typeof values],
    ])
  );

  const splitItems = ordersToSplit.flatMap((order: Order) =>
    order.items
      .filter((item: OrderItem) => collectionIds.has(item.id))
      .map((item: OrderItem) => ({
        ...item,
        ...cascadeProperties,
      }))
  );

  const splitItemsTotal = splitItems.reduce((sum: number, item: OrderItem) => {
    return sum + parseFloat(item.price);
  }, 0);
  const additionalFees =
    parseFloat(values.shippingFee) +
    parseFloat(values.taxes) +
    parseFloat(values.duties) +
    parseFloat(values.tariffs) +
    parseFloat(values.miscFees);
  const combinedTotal = (splitItemsTotal + additionalFees).toFixed(2);

  const newOrder = {
    ...values,
    orderId: `temp-${Date.now()}`, // Temporary ID for optimistic update
    updatedAt: new Date().toISOString(),
    items: splitItems,
    total: combinedTotal,
    itemCount: splitItems.length,
    createdAt: new Date().toISOString(),
    totalCount: old.totalCount + 1,
  };

  // edit the effected orders by removing the split items
  const updatedOrders = ordersToSplit.map((order: Order) => {
    const remainingItems = order.items.filter(
      (item: OrderItem) => !collectionIds.has(item.id)
    );

    // get the items that were split from this specific order
    const orderSplitItems = order.items.filter((item: OrderItem) =>
      collectionIds.has(item.id)
    );

    const orderSplitItemsTotal = orderSplitItems.reduce(
      (sum: number, item: OrderItem) => {
        return sum + parseFloat(item.price);
      },
      0
    );

    return {
      ...order,
      total: (parseFloat(order.total) - orderSplitItemsTotal).toFixed(2),
      items: remainingItems,
      itemCount: remainingItems.length,
    };
  });

  const allOrders = [newOrder, ...updatedOrders, ...remainingOrders];
  const filteredAndSortedOrders = filterAndSortOrders(allOrders, {
    search: filters.search,
    sort: filters.sort,
    order: filters.order,
  });

  return {
    ...old,
    orders: filteredAndSortedOrders,
    orderStats: old.orderStats,
    totalCount: old.totalCount + 1,
  };
}

export function createOptimisticEditUpdate(
  old: OrdersQueryResponse,
  values: EditedOrder,
  filters: OrderFilters,
  cascadeOptions: CascadeOptions = []
): OrdersQueryResponse {
  if (!old) return old;

  const editedOrder = old.orders.find(
    (order: Order) => order.orderId === values.orderId
  );

  if (!editedOrder) {
    return old;
  }

  const cascadedProperties = Object.fromEntries(
    cascadeOptions.map((option) => [option, values[option]])
  );
  const items = editedOrder.items.map((item: OrderItem) => {
    return {
      ...item,
      ...cascadedProperties,
    };
  });

  const itemsTotal = items.reduce((sum: number, item: OrderItem) => {
    return sum + parseFloat(item.price);
  }, 0);

  const total = (
    itemsTotal +
    parseFloat(values.shippingFee) +
    parseFloat(values.taxes) +
    parseFloat(values.duties) +
    parseFloat(values.tariffs) +
    parseFloat(values.miscFees)
  ).toFixed(2);

  const updatedOrders = old.orders.map((order: Order) =>
    order.orderId === values.orderId
      ? { ...order, ...values, items, total }
      : order
  );

  const sortedOrders = filterAndSortOrders(updatedOrders, {
    search: filters.search,
    sort: filters.sort,
    order: filters.order,
  });

  return {
    ...old,
    orders: sortedOrders,
    orderStats: old.orderStats,
  };
}

export function createOptimisticDeleteUpdate(
  old: OrdersQueryResponse,
  orderIds: Set<string>,
  filters: OrderFilters
) {
  if (!old) return old;

  const deletedOrders = old.orders.filter((order: Order) =>
    orderIds.has(order.orderId)
  );

  if (!deletedOrders) return old;

  const deletedOrdersIds = deletedOrders.map((order: Order) => order.orderId);

  const remainingOrders = old.orders.filter(
    (order: Order) => !deletedOrdersIds.includes(order.orderId)
  );

  const totalCount = old.totalCount - deletedOrders.length;

  const filteredAndSortedOrders = filterAndSortOrders(remainingOrders, {
    search: filters.search,
    sort: filters.sort,
    order: filters.order,
  });

  return {
    ...old,
    orders: filteredAndSortedOrders,
    orderStats: old.orderStats,
    totalCount,
  };
}

export function createOptimisticEditItemUpdate(
  old: OrdersQueryResponse,
  values: CollectionItemFormValues,
  filters: OrderFilters
) {
  const order = old.orders.find(
    (order: Order) => order.orderId === values.orderId
  );
  if (!order) return old;
  const item = order.items.find((item: OrderItem) => item.id === values.id);
  if (!item) return old;

  const updatedItem = {
    ...item,
    ...values,
  };

  const remainingItems = order.items.filter(
    (item: OrderItem) => item.id !== values.id
  );

  const remainingItemsPriceTotal = remainingItems.reduce(
    (sum: number, item: OrderItem) => {
      return sum + parseFloat(item.price);
    },
    0
  );

  const additionalFees =
    parseFloat(order.shippingFee) +
    parseFloat(order.taxes) +
    parseFloat(order.duties) +
    parseFloat(order.tariffs) +
    parseFloat(order.miscFees);
  const newOrderTotal =
    parseFloat(updatedItem.price) + remainingItemsPriceTotal + additionalFees;
  const itemsUpdated = order.items.map((item: OrderItem) =>
    item.id === values.id ? updatedItem : item
  );

  const updatedOrders = old.orders.map((order: Order) =>
    order.orderId === values.orderId
      ? { ...order, items: itemsUpdated, total: newOrderTotal.toFixed(2) }
      : order
  );

  const sortedOrders = filterAndSortOrders(updatedOrders, {
    search: filters.search,
    sort: filters.sort,
    order: filters.order,
  });

  return {
    ...old,
    orders: sortedOrders,
    orderStats: old.orderStats,
  };
}

export function createOptimisticDeleteItemUpdate(
  old: OrdersQueryResponse,
  orderId: string,
  collectionId: string,
  filters: OrderFilters
) {
  const order = old.orders.find((order: Order) => order.orderId === orderId);
  if (!order) return old;
  const item = order.items.find((item: OrderItem) => item.id === collectionId);
  if (!item) return old;

  const remainingItems = order.items.filter(
    (item: OrderItem) => item.id !== collectionId
  );
  const remainingItemsPriceTotal = remainingItems.reduce(
    (sum: number, item: OrderItem) => {
      return sum + parseFloat(item.price);
    },
    0
  );

  const additionalFees =
    parseFloat(order.shippingFee) +
    parseFloat(order.taxes) +
    parseFloat(order.duties) +
    parseFloat(order.tariffs) +
    parseFloat(order.miscFees);
  const newOrderTotal = remainingItemsPriceTotal + additionalFees;

  const updatedOrders = old.orders.map((order: Order) =>
    order.orderId === orderId
      ? {
          ...order,
          items: remainingItems,
          total: newOrderTotal.toFixed(2),
          itemCount: remainingItems.length,
        }
      : order
  );

  const sortedOrders = filterAndSortOrders(updatedOrders, {
    search: filters.search,
    sort: filters.sort,
    order: filters.order,
  });

  return {
    ...old,
    orders: sortedOrders,
    orderStats: old.orderStats,
  };
}

export function createOptimisticDeleteItemsUpdate(
  old: OrdersQueryResponse,
  collectionIds: Set<string>,
  filters: OrderFilters
) {
  if (!old) return old;

  // Update all orders by removing items that match any of the collectionIds
  const updatedOrders = old.orders.map((order: Order) => {
    const remainingItems = order.items.filter(
      (item: OrderItem) => !collectionIds.has(item.id)
    );

    if (remainingItems.length === order.items.length) {
      return order;
    }

    const remainingItemsPriceTotal = remainingItems.reduce(
      (sum: number, item: OrderItem) => {
        return sum + parseFloat(item.price);
      },
      0
    );

    const additionalFees =
      (parseFloat(order.shippingFee) || 0) +
      (parseFloat(order.taxes) || 0) +
      (parseFloat(order.duties) || 0) +
      (parseFloat(order.tariffs) || 0) +
      (parseFloat(order.miscFees) || 0);
    const newOrderTotal = remainingItemsPriceTotal + additionalFees;

    return {
      ...order,
      items: remainingItems,
      total: newOrderTotal.toFixed(2),
      itemCount: remainingItems.length,
    };
  });

  const sortedOrders = filterAndSortOrders(updatedOrders, {
    search: filters.search,
    sort: filters.sort,
    order: filters.order,
  });

  return {
    ...old,
    orders: sortedOrders,
    orderStats: old.orderStats,
  };
}

export function createOptimisticMoveItemUpdate(
  old: OrdersQueryResponse,
  targetOrderId: string,
  collectionIds: Set<string>,
  orderIds: Set<string>,
  filters: OrderFilters
): OrdersQueryResponse {
  if (!old) return old;

  // Find the target order
  const targetOrder = old.orders.find(
    (order: Order) => order.orderId === targetOrderId
  );
  if (!targetOrder) return old;

  // Find source orders that contain items to move
  const sourceOrders = old.orders.filter((order: Order) =>
    orderIds.has(order.orderId)
  );

  if (!sourceOrders.length) return old;

  // Extract items to move from source orders
  const itemsToMove = sourceOrders.flatMap((order: Order) =>
    order.items.filter((item: OrderItem) => collectionIds.has(item.id))
  );

  if (!itemsToMove.length) return old;

  // Calculate total value of items being moved
  const movedItemsTotal = itemsToMove.reduce((sum: number, item: OrderItem) => {
    return sum + parseFloat(item.price);
  }, 0);

  // Calculate target order's additional fees
  const targetAdditionalFees =
    parseFloat(targetOrder.shippingFee) +
    parseFloat(targetOrder.taxes) +
    parseFloat(targetOrder.duties) +
    parseFloat(targetOrder.tariffs) +
    parseFloat(targetOrder.miscFees);

  // Calculate target order's current items total
  const targetItemsTotal = targetOrder.items.reduce(
    (sum: number, item: OrderItem) => {
      return sum + parseFloat(item.price);
    },
    0
  );

  // Update target order with moved items
  const updatedTargetOrder = {
    ...targetOrder,
    items: [...targetOrder.items, ...itemsToMove],
    itemCount: targetOrder.items.length + itemsToMove.length,
    total: (targetItemsTotal + movedItemsTotal + targetAdditionalFees).toFixed(
      2
    ),
  };

  // Update source orders by removing moved items
  const updatedSourceOrders = sourceOrders.map((order: Order) => {
    const remainingItems = order.items.filter(
      (item: OrderItem) => !collectionIds.has(item.id)
    );

    // Calculate this order's additional fees
    const orderAdditionalFees =
      parseFloat(order.shippingFee) +
      parseFloat(order.taxes) +
      parseFloat(order.duties) +
      parseFloat(order.tariffs) +
      parseFloat(order.miscFees);

    const remainingItemsTotal = remainingItems.reduce(
      (sum: number, item: OrderItem) => {
        return sum + parseFloat(item.price);
      },
      0
    );

    return {
      ...order,
      items: remainingItems,
      itemCount: remainingItems.length,
      total: (remainingItemsTotal + orderAdditionalFees).toFixed(2),
    };
  });

  // Get orders that weren't affected
  const unaffectedOrders = old.orders.filter(
    (order: Order) =>
      !orderIds.has(order.orderId) && order.orderId !== targetOrderId
  );

  // Combine all orders
  const allOrders = [
    updatedTargetOrder,
    ...updatedSourceOrders,
    ...unaffectedOrders,
  ];

  const filteredAndSortedOrders = filterAndSortOrders(allOrders, {
    search: filters.search,
    sort: filters.sort,
    order: filters.order,
  });

  return {
    ...old,
    orders: filteredAndSortedOrders,
    orderStats: old.orderStats,
  };
}
