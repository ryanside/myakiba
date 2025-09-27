import { client } from "@/lib/hono-client";
import type {
  CascadeOptions,
  EditedOrder,
  NewOrder,
  OrderItem,
} from "@/lib/orders/types";

export async function getOrders(filters: {
  limit?: number;
  offset?: number;
  sort?: string;
  order?: string;
  search?: string;
}) {
  const queryParams = {
    limit: filters.limit?.toString(),
    offset: filters.offset?.toString(),
    sort: filters.sort?.toString(),
    order: filters.order?.toString(),
    search: filters.search?.toString(),
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

export async function editOrderItem(
  orderId: string,
  collectionId: string,
  values: OrderItem
) {
  const response = await client.api.orders[":orderId"].items[
    ":collectionId"
  ].$put({
    param: {
      orderId,
      collectionId,
    },
    json: {
      item: values,
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
