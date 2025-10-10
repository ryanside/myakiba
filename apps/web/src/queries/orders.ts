import type { CollectionItemFormValues } from "@/lib/collection/types";
import { client } from "@/lib/hono-client";
import type {
  CascadeOptions,
  EditedOrder,
  NewOrder,
  OrderFilters,
} from "@/lib/orders/types";

export async function getOrders(filters: OrderFilters) {
  const queryParams = {
    limit: filters.limit?.toString(),
    offset: filters.offset?.toString(),
    sort: filters.sort,
    order: filters.order,
    search: filters.search,
    shop: filters.shop?.join(",") || [],
    releaseMonthYearStart: filters.releaseMonthYearStart,
    releaseMonthYearEnd: filters.releaseMonthYearEnd,
    shipMethod: filters.shipMethod?.join(",") || [],
    orderDateStart: filters.orderDateStart,
    orderDateEnd: filters.orderDateEnd,
    payDateStart: filters.payDateStart,
    payDateEnd: filters.payDateEnd,
    shipDateStart: filters.shipDateStart,
    shipDateEnd: filters.shipDateEnd,
    colDateStart: filters.colDateStart,
    colDateEnd: filters.colDateEnd,
    status: filters.status?.join(",") || [],
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

  const response = await client.api.orders.$get({ query: queryParams });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `HTTP ${response.status}`);
  }
  const data = await response.json();
  return data;
}

export async function mergeOrders(
  values: NewOrder,
  orderIds: Set<string>,
  cascadeOptions: CascadeOptions
) {
  const response = await client.api.orders.merge.$post({
    json: {
      orderIds: Array.from(orderIds),
      newOrder: values,
      cascadeOptions,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `HTTP ${response.status}`);
  }

  return response;
}

export async function splitOrders(
  values: NewOrder,
  collectionIds: Set<string>,
  cascadeOptions: CascadeOptions
) {
  const response = await client.api.orders.split.$post({
    json: {
      collectionIds: Array.from(collectionIds),
      newOrder: values,
      cascadeOptions,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `HTTP ${response.status}`);
  }

  return response;
}

export async function editOrder(
  values: EditedOrder,
  cascadeOptions: CascadeOptions
) {
  const response = await client.api.orders[":orderId"].$put({
    param: {
      orderId: values.orderId,
    },
    json: {
      order: values,
      cascadeOptions,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `HTTP ${response.status}`);
  }
}

export async function deleteOrders(orderIds: Set<string>) {
  const response = await client.api.orders.$delete({
    json: {
      orderIds: Array.from(orderIds),
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `HTTP ${response.status}`);
  }
}

export async function deleteOrderItem(orderId: string, collectionId: string) {
  const response = await client.api.orders[":orderId"].items[
    ":collectionId"
  ].$delete({
    param: {
      orderId,
      collectionId,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `HTTP ${response.status}`);
  }
}

export async function getItemReleases(itemId: number) {
  const response = await client.api.items[":itemId"].releases.$get({
    param: {
      itemId: itemId.toString(),
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `HTTP ${response.status}`);
  }

  const data = await response.json();
  return data;
}

export async function getOrderIdsAndTitles(filters: { title?: string }) {
  const response = await client.api.orders["ids-and-titles"].$get({
    query: {
      title: filters.title?.toString(),
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `HTTP ${response.status}`);
  }

  const data = await response.json();
  return data;
}

export async function moveItem(
  targetOrderId: string,
  collectionIds: Set<string>,
  orderIds: Set<string>
) {
  const response = await client.api.orders["move-items"].$put({
    json: {
      targetOrderId,
      collectionIds: Array.from(collectionIds),
      orderIds: Array.from(orderIds),
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `HTTP ${response.status}`);
  }
}

export async function getOrder(orderId: string) {
  const response = await client.api.orders[":orderId"].$get({
    param: {
      orderId,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `HTTP ${response.status}`);
  }

  const data = await response.json();
  return data;
}
