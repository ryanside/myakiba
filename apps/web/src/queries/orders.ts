import { client } from "@/lib/hono-client";
import type { CascadeOptions, EditedOrder, NewOrder } from "@/lib/types";

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
    throw new Error("Failed to get orders");
  }
  const data = await response.json();
  return data;
}

export async function mergeOrders(values: NewOrder, orderIds: string[], cascadeOptions: CascadeOptions) {
  const response = await client.api.orders.merge.$post({
    json: {
      orderIds,
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

export async function editOrder(values: EditedOrder, cascadeOptions: CascadeOptions) {
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
