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

export function getStatusVariant(
  status: string
): VariantProps<typeof badgeVariants>["variant"] {
  switch (status.toLowerCase()) {
    case "owned":
      return "success";
    case "shipped":
      return "primary";
    case "paid":
      return "warning";
    case "ordered":
      return "info";
    case "sold":
      return "destructive";
    default:
      return "outline";
  }
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
    let aValue: string | number | Date;
    let bValue: string | number | Date;

    switch (sortField) {
      case "title":
        aValue = a.title.toLowerCase();
        bValue = b.title.toLowerCase();
        break;
      case "shop":
        aValue = (a.shop || "").toLowerCase();
        bValue = (b.shop || "").toLowerCase();
        break;
      case "orderDate":
        aValue = a.orderDate ? new Date(a.orderDate) : new Date(0);
        bValue = b.orderDate ? new Date(b.orderDate) : new Date(0);
        break;
      case "paymentDate":
        aValue = a.paymentDate ? new Date(a.paymentDate) : new Date(0);
        bValue = b.paymentDate ? new Date(b.paymentDate) : new Date(0);
        break;
      case "shippingDate":
        aValue = a.shippingDate ? new Date(a.shippingDate) : new Date(0);
        bValue = b.shippingDate ? new Date(b.shippingDate) : new Date(0);
        break;
      case "collectionDate":
        aValue = a.collectionDate ? new Date(a.collectionDate) : new Date(0);
        bValue = b.collectionDate ? new Date(b.collectionDate) : new Date(0);
        break;
      case "releaseMonthYear":
        aValue = a.releaseMonthYear || "";
        bValue = b.releaseMonthYear || "";
        break;
      case "shippingMethod":
        aValue = a.shippingMethod || "";
        bValue = b.shippingMethod || "";
        break;
      case "total":
        aValue = parseFloat(a.total) || 0;
        bValue = parseFloat(b.total) || 0;
        break;
      case "shippingFee":
        aValue = parseFloat(a.shippingFee) || 0;
        bValue = parseFloat(b.shippingFee) || 0;
        break;
      case "taxes":
        aValue = parseFloat(a.taxes) || 0;
        bValue = parseFloat(b.taxes) || 0;
        break;
      case "duties":
        aValue = parseFloat(a.duties) || 0;
        bValue = parseFloat(b.duties) || 0;
        break;
      case "tariffs":
        aValue = parseFloat(a.tariffs) || 0;
        bValue = parseFloat(b.tariffs) || 0;
        break;
      case "miscFees":
        aValue = parseFloat(a.miscFees) || 0;
        bValue = parseFloat(b.miscFees) || 0;
        break;
      case "itemCount":
        aValue = a.itemCount || 0;
        bValue = b.itemCount || 0;
        break;
      case "createdAt":
      default:
        aValue = new Date(a.createdAt);
        bValue = new Date(b.createdAt);
        break;
    }

    // Handle different data types for comparison
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

  return {
    ...old,
    orders: updatedOrders,
    orderStats: old.orderStats,
  };
}

export function createOptimisticDeleteUpdate(
  old: OrdersQueryResponse,
  orderIds: Set<string>
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

  return {
    ...old,
    orders: remainingOrders,
    orderStats: old.orderStats,
    totalCount,
  };
}

export function createOptimisticEditItemUpdate(
  old: OrdersQueryResponse,
  values: CollectionItemFormValues
) {
  const order = old.orders.find((order: Order) => order.orderId === values.orderId);
  if (!order) return old;
  const item = order.items.find(
    (item: OrderItem) => item.id === values.id
  );
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

  return {
    ...old,
    orders: updatedOrders,
    orderStats: old.orderStats,
  };
}

export function createOptimisticDeleteItemUpdate(
  old: OrdersQueryResponse,
  orderId: string,
  collectionId: string
) {
  const order = old.orders.find((order: Order) => order.orderId === orderId);
  if (!order) return old;
  const item = order.items.find(
    (item: OrderItem) => item.id === collectionId
  );
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

  return {
    ...old,
    orders: updatedOrders,
    orderStats: old.orderStats,
  };
}

export function createOptimisticDeleteItemsUpdate(
  old: OrdersQueryResponse,
  collectionIds: Set<string>
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
      parseFloat(order.shippingFee) +
      parseFloat(order.taxes) +
      parseFloat(order.duties) +
      parseFloat(order.tariffs) +
      parseFloat(order.miscFees);
    const newOrderTotal = remainingItemsPriceTotal + additionalFees;

    return {
      ...order,
      items: remainingItems,
      total: newOrderTotal.toFixed(2),
      itemCount: remainingItems.length,
    };
  });

  return {
    ...old,
    orders: updatedOrders,
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
    order.items.filter((item: OrderItem) =>
      collectionIds.has(item.id)
    )
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
