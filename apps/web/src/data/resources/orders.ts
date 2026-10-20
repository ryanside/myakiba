import { keepPreviousData } from "@tanstack/react-query";
import type { CollectionItemFormValues } from "@myakiba/contracts/collection/types";
import type {
  CascadeOptions,
  EditedOrder,
  NewOrder,
  OrderFilters,
  OrderItemsQuery,
} from "@myakiba/contracts/orders/schema";
import type { Order, OrderItem, OrdersPage } from "@myakiba/contracts/orders/types";
import type { Page } from "@myakiba/contracts/shared/pagination";
import { hasActiveFiltersOrSorting } from "@/lib/filters";
import { updateCollectionItem } from "@/queries/collection";
import {
  deleteOrderItem,
  deleteOrderItems,
  deleteOrders,
  editOrder,
  getOrder,
  getOrderItemReleases,
  getOrderItems,
  getOrders,
  mergeOrders,
  moveItem,
  splitOrders,
} from "@/queries/orders";
import { MoveNotFoundError } from "@/queries/move-not-found-error";
import { collectionWriteFamilies } from "../catalog";
import { defineCommand, rootedRead } from "../client";

const orderItemsOf = (orderId: string) => ["orderItems", orderId] as const;

export const orders = {
  list: rootedRead("orders", {
    key: (filters: OrderFilters) => ["orders", filters] as const,
    load: getOrders,
    placeholderData: keepPreviousData,
  }),
  detail: rootedRead("orders", {
    key: (orderId: string) => ["order", orderId] as const,
    load: getOrder,
    staleTime: 1000 * 60 * 5,
    retry: false,
  }),
  items: rootedRead("orders", {
    key: ({ orderId, query }: { readonly orderId: string; readonly query: OrderItemsQuery }) =>
      [...orderItemsOf(orderId), query] as const,
    load: ({ orderId, query }) => getOrderItems(orderId, query),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  }),
  itemReleases: rootedRead("orders", {
    key: (orderId: string) => ["orderItemReleases", orderId] as const,
    load: getOrderItemReleases,
    staleTime: 30_000,
  }),
};

/** The orders list the page shows. Optimistic patches touch it only when no filter or sort is on. */
type OnList = { readonly list: OrderFilters };

export const editOrderCommand = defineCommand({
  invalidates: collectionWriteFamilies,
  refetchAfterFailure: true,
  persist: ({
    values,
    cascadeOptions,
  }: { readonly values: EditedOrder; readonly cascadeOptions: CascadeOptions } & OnList) =>
    editOrder(values, cascadeOptions),
  optimistic: async (queryClient, { values, list }) => {
    // Always patch the order detail cache; it is keyed by id, so it is safe to update
    // regardless of any list-page filter state.
    const orderDetailKey = orders.detail.key(values.orderId);
    await queryClient.cancelQueries({ queryKey: orderDetailKey });
    const previousOrderDetail = queryClient.getQueryData<Order>(orderDetailKey);
    const detailNewTotal = previousOrderDetail
      ? Number(previousOrderDetail.total) +
        (values.shippingFee - Number(previousOrderDetail.shippingFee)) +
        (values.taxes - Number(previousOrderDetail.taxes)) +
        (values.duties - Number(previousOrderDetail.duties)) +
        (values.tariffs - Number(previousOrderDetail.tariffs)) +
        (values.miscFees - Number(previousOrderDetail.miscFees))
      : undefined;
    queryClient.setQueryData<Order>(orderDetailKey, (old) =>
      old
        ? { ...old, ...values, ...(detailNewTotal !== undefined && { total: detailNewTotal }) }
        : old,
    );

    const listKey = orders.list.key(list);
    let previousList: OrdersPage | undefined;
    if (!hasActiveFiltersOrSorting(list)) {
      await queryClient.cancelQueries({ queryKey: listKey });
      previousList = queryClient.getQueryData<OrdersPage>(listKey);
      const oldOrder = previousList?.items.find((o) => o.orderId === values.orderId);

      const newTotal = oldOrder
        ? Number(oldOrder.total) +
          (values.shippingFee - Number(oldOrder.shippingFee)) +
          (values.taxes - Number(oldOrder.taxes)) +
          (values.duties - Number(oldOrder.duties)) +
          (values.tariffs - Number(oldOrder.tariffs)) +
          (values.miscFees - Number(oldOrder.miscFees))
        : undefined;

      queryClient.setQueryData<OrdersPage>(listKey, (old) =>
        old
          ? {
              ...old,
              items: old.items.map((order) =>
                order.orderId === values.orderId
                  ? { ...order, ...values, ...(newTotal !== undefined && { total: newTotal }) }
                  : order,
              ),
            }
          : old,
      );
    }

    return () => {
      if (previousList) {
        queryClient.setQueryData<OrdersPage>(listKey, previousList);
      }
      if (previousOrderDetail) {
        queryClient.setQueryData<Order>(
          orders.detail.key(previousOrderDetail.orderId),
          previousOrderDetail,
        );
      }
    };
  },
  successTitle: () => "Order updated",
  failureTitle: () => "Failed to update order. Please try again.",
});

export const deleteOrdersCommand = defineCommand({
  invalidates: collectionWriteFamilies,
  refetchAfterFailure: true,
  persist: ({ orderIds }: { readonly orderIds: Set<string> } & OnList) => deleteOrders(orderIds),
  optimistic: async (queryClient, { orderIds, list }) => {
    if (hasActiveFiltersOrSorting(list)) return;

    const listKey = orders.list.key(list);
    await queryClient.cancelQueries({ queryKey: listKey });
    const previous = queryClient.getQueryData<OrdersPage>(listKey);

    queryClient.setQueryData<OrdersPage>(listKey, (old) => {
      if (!old) return old;
      return {
        ...old,
        items: old.items.filter((order) => !orderIds.has(order.orderId)),
        totalCount: old.totalCount - orderIds.size,
      };
    });

    return () => {
      if (previous) queryClient.setQueryData<OrdersPage>(listKey, previous);
    };
  },
  successTitle: ({ orderIds }) =>
    orderIds.size === 1 ? "Order deleted" : `Successfully deleted ${orderIds.size} orders`,
  failureTitle: () => "Failed to delete order(s). Please try again.",
});

export const mergeOrdersCommand = defineCommand({
  invalidates: collectionWriteFamilies,
  refetchAfterFailure: true,
  persist: ({
    values,
    orderIds,
    cascadeOptions,
  }: {
    readonly values: NewOrder;
    readonly orderIds: Set<string>;
    readonly cascadeOptions: CascadeOptions;
  } & OnList) => mergeOrders(values, orderIds, cascadeOptions),
  optimistic: async (queryClient, { orderIds, list }) => {
    if (hasActiveFiltersOrSorting(list)) return;

    const listKey = orders.list.key(list);
    await queryClient.cancelQueries({ queryKey: listKey });
    const previous = queryClient.getQueryData<OrdersPage>(listKey);

    queryClient.setQueryData<OrdersPage>(listKey, (old) => {
      if (!old) return old;
      return { ...old, items: old.items.filter((order) => !orderIds.has(order.orderId)) };
    });

    return () => {
      if (previous) queryClient.setQueryData<OrdersPage>(listKey, previous);
    };
  },
  successTitle: ({ orderIds }) => `Successfully merged ${orderIds.size} orders into one!`,
  failureTitle: () => "Failed to merge orders. Please try again.",
});

export const splitOrdersCommand = defineCommand({
  invalidates: collectionWriteFamilies,
  refetchAfterFailure: true,
  persist: ({
    values,
    collectionIds,
    cascadeOptions,
  }: {
    readonly values: NewOrder;
    readonly collectionIds: Set<string>;
    readonly cascadeOptions: CascadeOptions;
  }) => splitOrders(values, collectionIds, cascadeOptions),
  successTitle: ({ collectionIds }) =>
    `Successfully moved ${collectionIds.size} items to a new order!`,
  failureTitle: () => "Failed to move items to a new order. Please try again.",
});

export const editOrderItemCommand = defineCommand({
  invalidates: collectionWriteFamilies,
  refetchAfterFailure: true,
  persist: ({ values }: { readonly values: CollectionItemFormValues } & OnList) =>
    updateCollectionItem(values),
  optimistic: async (queryClient, { values, list }) => {
    const itemOrderId = values.orderId;
    if (!itemOrderId) return;

    await queryClient.cancelQueries({ queryKey: orderItemsOf(itemOrderId) });
    const previousOrderItems = queryClient.getQueriesData<Page<OrderItem>>({
      queryKey: orderItemsOf(itemOrderId),
    });

    let oldPrice: number | undefined;
    queryClient.setQueriesData<Page<OrderItem>>({ queryKey: orderItemsOf(itemOrderId) }, (old) => {
      if (!old) return old;
      return {
        ...old,
        items: old.items.map((item) => {
          if (item.id === values.id) {
            oldPrice = item.price;
            return { ...item, ...values };
          }
          return item;
        }),
      };
    });

    const priceChanged = oldPrice !== undefined && oldPrice !== values.price;
    const priceDelta = priceChanged ? values.price - (oldPrice as number) : 0;

    const orderDetailKey = orders.detail.key(itemOrderId);
    await queryClient.cancelQueries({ queryKey: orderDetailKey });
    const previousOrderDetail = queryClient.getQueryData<Order>(orderDetailKey);
    if (priceChanged) {
      queryClient.setQueryData<Order>(orderDetailKey, (old) =>
        old ? { ...old, total: Number(old.total) + priceDelta } : old,
      );
    }

    const listKey = orders.list.key(list);
    let previousOrders: OrdersPage | undefined;

    if (!hasActiveFiltersOrSorting(list) && priceChanged) {
      await queryClient.cancelQueries({ queryKey: listKey });
      previousOrders = queryClient.getQueryData<OrdersPage>(listKey);
      queryClient.setQueryData<OrdersPage>(listKey, (old) =>
        old
          ? {
              ...old,
              items: old.items.map((order) =>
                order.orderId === itemOrderId
                  ? { ...order, total: Number(order.total) + priceDelta }
                  : order,
              ),
            }
          : old,
      );
    }

    return () => {
      for (const [queryKey, data] of previousOrderItems) {
        queryClient.setQueryData(queryKey, data);
      }
      if (previousOrders) {
        queryClient.setQueryData<OrdersPage>(listKey, previousOrders);
      }
      if (previousOrderDetail) {
        queryClient.setQueryData<Order>(orderDetailKey, previousOrderDetail);
      }
    };
  },
  successTitle: () => "Item updated",
  failureTitle: () => "Failed to update item. Please try again.",
});

export const deleteOrderItemCommand = defineCommand({
  invalidates: collectionWriteFamilies,
  refetchAfterFailure: true,
  persist: ({ orderId, itemId }: { readonly orderId: string; readonly itemId: string } & OnList) =>
    deleteOrderItem(orderId, itemId),
  optimistic: async (queryClient, { orderId, itemId, list }) => {
    await queryClient.cancelQueries({ queryKey: orderItemsOf(orderId) });
    const previousOrderItems = queryClient.getQueriesData<Page<OrderItem>>({
      queryKey: orderItemsOf(orderId),
    });

    let removedPrice = 0;
    queryClient.setQueriesData<Page<OrderItem>>({ queryKey: orderItemsOf(orderId) }, (old) => {
      if (!old) return old;
      const removedItem = old.items.find((item) => item.id === itemId);
      if (removedItem) removedPrice = removedItem.price;
      return {
        items: old.items.filter((item) => item.id !== itemId),
        totalCount: old.totalCount - 1,
      };
    });

    const orderDetailKey = orders.detail.key(orderId);
    await queryClient.cancelQueries({ queryKey: orderDetailKey });
    const previousOrderDetail = queryClient.getQueryData<Order>(orderDetailKey);
    queryClient.setQueryData<Order>(orderDetailKey, (old) =>
      old
        ? {
            ...old,
            total: old.total - removedPrice,
            itemCount: old.itemCount - 1,
          }
        : old,
    );

    const listKey = orders.list.key(list);
    let previousOrders: OrdersPage | undefined;

    if (!hasActiveFiltersOrSorting(list)) {
      await queryClient.cancelQueries({ queryKey: listKey });
      previousOrders = queryClient.getQueryData<OrdersPage>(listKey);
      queryClient.setQueryData<OrdersPage>(listKey, (old) =>
        old
          ? {
              ...old,
              items: old.items.map((order) =>
                order.orderId === orderId
                  ? {
                      ...order,
                      total: order.total - removedPrice,
                      itemCount: order.itemCount - 1,
                    }
                  : order,
              ),
            }
          : old,
      );
    }

    return () => {
      for (const [queryKey, data] of previousOrderItems) {
        queryClient.setQueryData(queryKey, data);
      }
      if (previousOrders) {
        queryClient.setQueryData<OrdersPage>(listKey, previousOrders);
      }
      if (previousOrderDetail) {
        queryClient.setQueryData<Order>(orderDetailKey, previousOrderDetail);
      }
    };
  },
  successTitle: () => "Item deleted",
  failureTitle: () => "Failed to delete item. Please try again.",
});

export const deleteOrderItemsCommand = defineCommand({
  invalidates: collectionWriteFamilies,
  refetchAfterFailure: true,
  persist: ({ collectionIds }: { readonly collectionIds: Set<string> }) =>
    deleteOrderItems(collectionIds),
  successTitle: ({ collectionIds }) =>
    collectionIds.size === 1 ? "Item deleted" : `Successfully deleted ${collectionIds.size} items`,
  failureTitle: () => "Failed to delete items. Please try again.",
});

export const moveOrderItemsCommand = defineCommand({
  invalidates: collectionWriteFamilies,
  refetchAfterFailure: true,
  persist: ({
    targetOrderId,
    collectionIds,
    orderIds,
  }: {
    readonly targetOrderId: string;
    readonly collectionIds: Set<string>;
    readonly orderIds?: Set<string>;
  }) => moveItem(targetOrderId, collectionIds, orderIds),
  successTitle: ({ collectionIds }) =>
    collectionIds.size === 1 ? "Item moved" : `Successfully moved ${collectionIds.size} items`,
  failureTitle: (_input, error) =>
    error instanceof MoveNotFoundError ? error.message : "Failed to move items. Please try again.",
});
