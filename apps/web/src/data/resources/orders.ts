import { keepPreviousData } from "@tanstack/react-query";
import type { CollectionItemFormValues } from "@myakiba/contracts/collection/types";
import type {
  CascadeOptions,
  EditedOrder,
  NewOrder,
  OrderFilters,
  OrderItemsQuery,
} from "@myakiba/contracts/orders/schema";
import type { OrderFill } from "@myakiba/contracts/orders/fill";
import type { Order, OrderItem, OrdersPage } from "@myakiba/contracts/orders/types";
import type { Page } from "@myakiba/contracts/shared/pagination";
import { shownMessageOf } from "../api";
import { hasActiveFiltersOrSorting } from "@/lib/filters";
import { updateCollectionItem } from "@/queries/collection";
import {
  deleteOrderItem,
  deleteOrderItems,
  deleteOrders,
  editOrder,
  fillOrders,
  getOrder,
  getOrderItemReleases,
  getOrderItems,
  getOrders,
  mergeOrders,
  moveItem,
  splitOrders,
  fillOrderPaid,
} from "@/queries/orders";
import { Result } from "better-result";
import { MoveTargetGone } from "@/lib/errors/move-target-gone";
import { FILL_FIELD } from "@/lib/fill-fields";
import { paymentOf } from "@/lib/orders";
import { collectionWriteFamilies } from "../catalog";
import { defineCommand, messageAs, rootedRead } from "../client";

const orderItemsOf = (orderId: string) => ["orderItems", orderId] as const;

export const ORDER_ITEM_PAGE_SIZE = 12;
const FIRST_ORDER_ITEMS_PAGE = { pageIndex: 0, pageSize: ORDER_ITEM_PAGE_SIZE } as const;

export function orderItemsInput(
  orderId: string,
  {
    pageIndex,
    pageSize,
  }: { readonly pageIndex: number; readonly pageSize: number } = FIRST_ORDER_ITEMS_PAGE,
  sort?: { readonly id: string; readonly desc: boolean },
) {
  return {
    orderId,
    query: {
      limit: pageSize,
      offset: pageIndex * pageSize,
      sort: (sort?.id as OrderItemsQuery["sort"] | undefined) ?? "createdAt",
      order: sort?.desc === false ? "asc" : "desc",
    } satisfies OrderItemsQuery,
  };
}

export const orders = {
  list: rootedRead("orders", {
    key: (filters: OrderFilters) => ["orders", filters] as const,
    load: getOrders,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
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
  refetchBy: "settled",
  persist: ({
    values,
    cascadeOptions,
  }: { readonly values: EditedOrder; readonly cascadeOptions: CascadeOptions } & OnList) =>
    editOrder(values, cascadeOptions),
  optimistic: async (queryClient, { values, cascadeOptions, list }) => {
    const cascadedPayment = cascadeOptions.includes("paid")
      ? { payment: paymentOf(values.paid) }
      : {};
    // Always patch the order detail cache; it is keyed by id, so it is safe to update
    // regardless of any list-page filter state.
    const orderDetailKey = orders.detail.key(values.orderId);
    await queryClient.cancelQueries({ queryKey: orderDetailKey });
    const previousOrderDetail = queryClient.getQueryData<Order>(orderDetailKey);
    const detailNewTotal = previousOrderDetail
      ? previousOrderDetail.total +
        (values.shippingFee - previousOrderDetail.shippingFee) +
        (values.taxes - previousOrderDetail.taxes) +
        (values.duties - previousOrderDetail.duties) +
        (values.tariffs - previousOrderDetail.tariffs) +
        (values.miscFees - previousOrderDetail.miscFees)
      : undefined;
    queryClient.setQueryData<Order>(orderDetailKey, (old) =>
      old
        ? {
            ...old,
            ...values,
            ...cascadedPayment,
            ...(detailNewTotal !== undefined && { total: detailNewTotal }),
          }
        : old,
    );

    const listKey = orders.list.key(list);
    let previousList: OrdersPage | undefined;
    if (!hasActiveFiltersOrSorting(list)) {
      await queryClient.cancelQueries({ queryKey: listKey });
      previousList = queryClient.getQueryData<OrdersPage>(listKey);
      const oldOrder = previousList?.items.find((o) => o.orderId === values.orderId);

      const newTotal = oldOrder
        ? oldOrder.total +
          (values.shippingFee - oldOrder.shippingFee) +
          (values.taxes - oldOrder.taxes) +
          (values.duties - oldOrder.duties) +
          (values.tariffs - oldOrder.tariffs) +
          (values.miscFees - oldOrder.miscFees)
        : undefined;

      queryClient.setQueryData<OrdersPage>(listKey, (old) =>
        old
          ? {
              ...old,
              items: old.items.map((order) =>
                order.orderId === values.orderId
                  ? {
                      ...order,
                      ...values,
                      ...cascadedPayment,
                      ...(newTotal !== undefined && { total: newTotal }),
                    }
                  : order,
              ),
            }
          : old,
      );
    }

    return Result.ok(() => {
      if (previousList) {
        queryClient.setQueryData<OrdersPage>(listKey, previousList);
      }
      if (previousOrderDetail) {
        queryClient.setQueryData<Order>(
          orders.detail.key(previousOrderDetail.orderId),
          previousOrderDetail,
        );
      }
    });
  },
  successTitle: () => "Order updated",
  failureToast: (_input, failure) => ({
    title: shownMessageOf(failure, "Failed to update order. Please try again."),
  }),
});

export const setOrderPaidCommand = defineCommand({
  invalidates: collectionWriteFamilies,
  refetchBy: "settled",
  persist: ({ orderId, paid }: { readonly orderId: string; readonly paid: boolean } & OnList) =>
    fillOrderPaid(orderId, paid),
  optimistic: async (queryClient, { orderId, paid, list }) => {
    if (hasActiveFiltersOrSorting(list)) return Result.ok(null);

    const listKey = orders.list.key(list);
    await queryClient.cancelQueries({ queryKey: listKey });
    const previous = queryClient.getQueryData<OrdersPage>(listKey);
    queryClient.setQueryData<OrdersPage>(listKey, (old) =>
      old
        ? {
            ...old,
            items: old.items.map((order) =>
              order.orderId === orderId ? { ...order, paid, payment: paymentOf(paid) } : order,
            ),
          }
        : old,
    );

    return Result.ok(() => {
      if (previous) queryClient.setQueryData<OrdersPage>(listKey, previous);
    });
  },
  successTitle: () => "Order updated",
  failureToast: (_input, failure) => ({
    title: shownMessageOf(failure, "Failed to update Paid. Please try again."),
  }),
});

export const deleteOrdersCommand = defineCommand({
  invalidates: collectionWriteFamilies,
  refetchBy: "settled",
  persist: ({ orderIds }: { readonly orderIds: Set<string> } & OnList) => deleteOrders(orderIds),
  optimistic: async (queryClient, { orderIds, list }) => {
    if (hasActiveFiltersOrSorting(list)) return Result.ok(null);

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

    return Result.ok(() => {
      if (previous) queryClient.setQueryData<OrdersPage>(listKey, previous);
    });
  },
  successTitle: ({ orderIds }) =>
    orderIds.size === 1 ? "Order deleted" : `Successfully deleted ${orderIds.size} orders`,
  failureToast: () => ({ title: "Failed to delete order(s). Please try again." }),
});

export const fillOrdersCommand = defineCommand({
  invalidates: collectionWriteFamilies,
  refetchBy: "settled",
  persist: ({
    orderIds,
    fill,
  }: {
    readonly orderIds: readonly string[];
    readonly fill: OrderFill;
  }) => fillOrders(orderIds, fill),
  successTitle: ({ orderIds, fill }) =>
    `Filled ${FILL_FIELD[fill.field].label} on ${orderIds.length === 1 ? "1 order and its items" : `${orderIds.length} orders and their items`}`,
  failureToast: messageAs("title", () => "Failed to fill orders"),
});

export const mergeOrdersCommand = defineCommand({
  invalidates: collectionWriteFamilies,
  refetchBy: "settled",
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
    if (hasActiveFiltersOrSorting(list)) return Result.ok(null);

    const listKey = orders.list.key(list);
    await queryClient.cancelQueries({ queryKey: listKey });
    const previous = queryClient.getQueryData<OrdersPage>(listKey);

    queryClient.setQueryData<OrdersPage>(listKey, (old) => {
      if (!old) return old;
      return { ...old, items: old.items.filter((order) => !orderIds.has(order.orderId)) };
    });

    return Result.ok(() => {
      if (previous) queryClient.setQueryData<OrdersPage>(listKey, previous);
    });
  },
  successTitle: ({ orderIds }) => `Successfully merged ${orderIds.size} orders into one!`,
  failureToast: () => ({ title: "Failed to merge orders. Please try again." }),
});

export const splitOrdersCommand = defineCommand({
  invalidates: collectionWriteFamilies,
  refetchBy: "settled",
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
  failureToast: () => ({ title: "Failed to move items to a new order. Please try again." }),
});

export const editOrderItemCommand = defineCommand({
  invalidates: collectionWriteFamilies,
  refetchBy: "settled",
  persist: ({ values }: { readonly values: CollectionItemFormValues } & OnList) =>
    updateCollectionItem(values),
  optimistic: async (queryClient, { values, list }) => {
    const itemOrderId = values.orderId;
    if (!itemOrderId) return Result.ok(null);

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
        old ? { ...old, total: old.total + priceDelta } : old,
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
                  ? { ...order, total: order.total + priceDelta }
                  : order,
              ),
            }
          : old,
      );
    }

    return Result.ok(() => {
      for (const [queryKey, data] of previousOrderItems) {
        queryClient.setQueryData(queryKey, data);
      }
      if (previousOrders) {
        queryClient.setQueryData<OrdersPage>(listKey, previousOrders);
      }
      if (previousOrderDetail) {
        queryClient.setQueryData<Order>(orderDetailKey, previousOrderDetail);
      }
    });
  },
  successTitle: () => "Item updated",
  failureToast: () => ({ title: "Failed to update item. Please try again." }),
});

export const deleteOrderItemCommand = defineCommand({
  invalidates: collectionWriteFamilies,
  refetchBy: "settled",
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

    return Result.ok(() => {
      for (const [queryKey, data] of previousOrderItems) {
        queryClient.setQueryData(queryKey, data);
      }
      if (previousOrders) {
        queryClient.setQueryData<OrdersPage>(listKey, previousOrders);
      }
      if (previousOrderDetail) {
        queryClient.setQueryData<Order>(orderDetailKey, previousOrderDetail);
      }
    });
  },
  successTitle: () => "Item deleted",
  failureToast: () => ({ title: "Failed to delete item. Please try again." }),
});

export const deleteOrderItemsCommand = defineCommand({
  invalidates: collectionWriteFamilies,
  refetchBy: "settled",
  persist: ({ collectionIds }: { readonly collectionIds: Set<string> }) =>
    deleteOrderItems(collectionIds),
  successTitle: ({ collectionIds }) =>
    collectionIds.size === 1 ? "Item deleted" : `Successfully deleted ${collectionIds.size} items`,
  failureToast: () => ({ title: "Failed to delete items. Please try again." }),
});

export const moveOrderItemsCommand = defineCommand({
  invalidates: collectionWriteFamilies,
  refetchBy: "settled",
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
  failureToast: (_input, failure) => ({
    title:
      failure && MoveTargetGone.is(failure)
        ? failure.message
        : "Failed to move items. Please try again.",
  }),
});
