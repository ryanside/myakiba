import { app, getErrorMessage } from "@/lib/treaty-client";
import type {
  CascadeOptions,
  EditedOrder,
  NewOrder,
  OrderFilters,
  OrdersQueryResponse,
} from "@/lib/orders/types";
import type { OrderStatus } from "@myakiba/types";

export async function getOrders(filters: OrderFilters): Promise<OrdersQueryResponse> {
  const queryParams = {
    limit: filters.limit ?? 10,
    offset: filters.offset ?? 0,
    sort: filters.sort ?? "createdAt",
    order: filters.order ?? "desc",
    search: filters.search,
    shop: filters.shop,
    releaseMonthYearStart: filters.releaseMonthYearStart,
    releaseMonthYearEnd: filters.releaseMonthYearEnd,
    shipMethod: filters.shipMethod,
    orderDateStart: filters.orderDateStart,
    orderDateEnd: filters.orderDateEnd,
    payDateStart: filters.payDateStart,
    payDateEnd: filters.payDateEnd,
    shipDateStart: filters.shipDateStart,
    shipDateEnd: filters.shipDateEnd,
    colDateStart: filters.colDateStart,
    colDateEnd: filters.colDateEnd,
    status: filters.status,
    totalMin: filters.totalMin,
    totalMax: filters.totalMax,
    shippingFeeMin: filters.shippingFeeMin,
    shippingFeeMax: filters.shippingFeeMax,
    taxesMin: filters.taxesMin,
    taxesMax: filters.taxesMax,
    dutiesMin: filters.dutiesMin,
    dutiesMax: filters.dutiesMax,
    tariffsMin: filters.tariffsMin,
    tariffsMax: filters.tariffsMax,
    miscFeesMin: filters.miscFeesMin,
    miscFeesMax: filters.miscFeesMax,
  };

  const { data, error } = await app.api.orders.get({ query: queryParams });
  if (error) {
    throw new Error(getErrorMessage(error, "Failed to get orders"));
  }
  if (!data) {
    throw new Error("Failed to get orders");
  }

  return data;
}

export async function mergeOrders(
  values: NewOrder,
  orderIds: Set<string>,
  cascadeOptions: CascadeOptions,
) {
  const { data, error } = await app.api.orders.merge.post({
    orderIds: Array.from(orderIds),
    newOrder: values,
    cascadeOptions,
  });

  if (error) {
    throw new Error(getErrorMessage(error, "Failed to merge orders"));
  }

  return data;
}

export async function splitOrders(
  values: NewOrder,
  collectionIds: Set<string>,
  cascadeOptions: CascadeOptions,
) {
  const { data, error } = await app.api.orders.split.post({
    collectionIds: Array.from(collectionIds),
    newOrder: values,
    cascadeOptions,
  });

  if (error) {
    throw new Error(getErrorMessage(error, "Failed to split orders"));
  }

  return data;
}

export async function editOrder(values: EditedOrder, cascadeOptions: CascadeOptions) {
  const { error } = await app.api.orders({ orderId: values.orderId }).put({
    order: values,
    cascadeOptions,
  });

  if (error) {
    throw new Error(getErrorMessage(error, "Failed to edit order"));
  }
}

export async function deleteOrders(orderIds: Set<string>) {
  const { error } = await app.api.orders.delete({
    orderIds: Array.from(orderIds),
  });

  if (error) {
    throw new Error(getErrorMessage(error, "Failed to delete orders"));
  }
}

export async function deleteOrderItem(orderId: string, collectionId: string) {
  const { error } = await app.api.orders({ orderId }).items({ collectionId }).delete();

  if (error) {
    throw new Error(getErrorMessage(error, "Failed to delete order item"));
  }
}

export async function deleteOrderItems(collectionIds: Set<string>) {
  const { error } = await app.api.orders.items.delete({
    collectionIds: Array.from(collectionIds),
  });

  if (error) {
    throw new Error(getErrorMessage(error, "Failed to delete order items"));
  }
}

export async function getItemReleases(itemId: string) {
  const { data, error } = await app.api.items({ itemId }).releases.get();

  if (error) {
    throw new Error(getErrorMessage(error, "Failed to get item releases"));
  }

  return data;
}

export async function getOrderIdsAndTitles(filters: { title?: string }) {
  const { data, error } = await app.api.orders["ids-and-titles"].get({
    query: {
      title: filters.title?.toString(),
    },
  });

  if (error) {
    throw new Error(getErrorMessage(error, "Failed to get order IDs and titles"));
  }

  return data;
}

export async function moveItem(
  targetOrderId: string,
  collectionIds: Set<string>,
  orderIds: Set<string>,
) {
  const { error } = await app.api.orders["move-items"].put({
    targetOrderId,
    collectionIds: Array.from(collectionIds),
    orderIds: Array.from(orderIds),
  });

  if (error) {
    throw new Error(getErrorMessage(error, "Failed to move items"));
  }
}

export async function getOrder(orderId: string) {
  const { data, error } = await app.api.orders({ orderId }).get();

  if (error) {
    throw new Error(getErrorMessage(error, "Failed to get order"));
  }

  if (!data) {
    throw new Error("Failed to get order");
  }

  return data;
}

export async function updateOrderStatus(orderId: string, status: OrderStatus): Promise<void> {
  const { error } = await app.api.orders({ orderId }).put({
    order: {
      status,
    },
    cascadeOptions: ["status"],
  });

  if (error) {
    throw new Error(getErrorMessage(error, "Failed to update order status"));
  }
}
