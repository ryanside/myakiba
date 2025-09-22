import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  DEFAULT_PAGE_INDEX,
  DEFAULT_PAGE_SIZE,
} from "../components/orders/order-table";
import { type SortingState } from "@tanstack/react-table";
import type { Filters, NewOrder, Order, OrderItem, OrdersQueryResponse, CascadeOptions } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(
  value: string | number,
  currency: string = "USD"
) {
  const amount = parseFloat(String(value || 0));

  switch (currency) {
    case "JPY":
      return new Intl.NumberFormat("ja-JP", {
        style: "currency",
        currency: currency,
      }).format(amount);
    case "EUR":
      return new Intl.NumberFormat("de-DE", {
        style: "currency",
        currency: currency,
      }).format(amount);
    case "CNY":
      return new Intl.NumberFormat("zh-CN", {
        style: "currency",
        currency: currency,
      }).format(amount);
    default:
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currency,
      }).format(amount);
  }
}

export const cleanEmptyParams = <T extends Record<string, unknown>>(
  search: T
) => {
  const newSearch = { ...search };
  Object.keys(newSearch).forEach((key) => {
    const value = newSearch[key];
    if (
      value === undefined ||
      value === "" ||
      (typeof value === "number" && isNaN(value))
    )
      delete newSearch[key];
  });

  // Remove pagination defaults
  if (search.pageIndex === DEFAULT_PAGE_INDEX) delete newSearch.pageIndex;
  if (search.pageSize === DEFAULT_PAGE_SIZE) delete newSearch.pageSize;
  if (search.limit === 10) delete newSearch.limit;
  if (search.offset === 0) delete newSearch.offset;
  if (search.sort === "createdAt") delete newSearch.sort;
  if (search.order === "desc") delete newSearch.order;

  return newSearch;
};

export function formatDate(dateString: string | null): string {
  if (!dateString) return "N/A";
  try {
    return new Date(dateString).toLocaleDateString();
  } catch {
    return "Invalid Date";
  }
}

/**
 * Filters and sorts orders to match server-side behavior
 */
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
  orderIds: string[],
  filters: Filters,
  cascadeOptions: CascadeOptions = []
): OrdersQueryResponse {
  if (!old) return old;

  const ordersToMerge = old.orders.filter((order: Order) =>
    orderIds.includes(order.orderId)
  );

  const remainingOrders = old.orders.filter(
    (order: Order) => !orderIds.includes(order.orderId)
  );

  const cascadeProperties = Object.fromEntries(
    cascadeOptions.map((option) => [
      option,
      values[option as keyof typeof values],
    ])
  );

  const combinedItems = ordersToMerge.flatMap(
    (order: Order) => 
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
    orderStatus: values.orderStatus,
    total: combinedTotal,
    shippingFee: values.shippingFee,
    taxes: values.taxes,
    duties: values.duties,
    tariffs: values.tariffs,
    miscFees: values.miscFees,
    notes: values.notes,
    itemCount: combinedItems.length,
    createdAt: new Date().toISOString(),
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
    totalCount: old.totalCount - orderIds.length + 1,
  };
}

export function createOptimisticSplitUpdate(
  old: OrdersQueryResponse,
  values: NewOrder,
  orderIds: Set<string>,
  collectionIds: Set<string>,
  filters: Filters,
  cascadeOptions: CascadeOptions = []
): OrdersQueryResponse {
  if (!old) return old;

  const ordersToSplit = old.orders.filter((order: Order) =>
    orderIds.has(order.orderId)
  );
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
    order.items.filter((item: OrderItem) =>
      collectionIds.has(item.collectionId)
    ).map((item: OrderItem) => ({
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
    items: splitItems,
    total: combinedTotal,
    itemCount: splitItems.length,
    createdAt: new Date().toISOString(),
    totalCount: old.totalCount + 1,
  };

  // edit the effected orders by removing the split items
  const updatedOrders = ordersToSplit.map((order: Order) => {
    const remainingItems = order.items.filter(
      (item: OrderItem) => !collectionIds.has(item.collectionId)
    );

    // get the items that were split from this specific order
    const orderSplitItems = order.items.filter((item: OrderItem) =>
      collectionIds.has(item.collectionId)
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
    totalCount: old.totalCount + 1,
  };
}
