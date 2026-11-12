import { Result } from "better-result";
import { call } from "@/data/api";
import type { ApiFailure } from "@/data/api";
import { app } from "@/lib/treaty-client";
import { ApiNotFound } from "@/lib/errors/api-not-found";
import { MoveTargetGone } from "@/lib/errors/move-target-gone";
import type {
  CascadeOptions,
  EditedOrder,
  NewOrder,
  OrderFilters,
  OrderItemsQuery,
} from "@myakiba/contracts/orders/schema";
import type { Order, OrderItem, OrdersPage } from "@myakiba/contracts/orders/types";
import type { Page } from "@myakiba/contracts/shared/pagination";
import type { OrderStatus } from "@myakiba/contracts/shared/types";
import { DEFAULT_LIMIT } from "@myakiba/contracts/shared/constants";

export function getOrders(filters: OrderFilters): Promise<Result<OrdersPage, ApiFailure>> {
  const queryParams = {
    limit: filters.limit ?? DEFAULT_LIMIT,
    offset: filters.offset ?? 0,
    sort: filters.sort ?? "createdAt",
    order: filters.order ?? "desc",
    search: filters.search,
    shop: filters.shop,
    releaseDateStart: filters.releaseDateStart,
    releaseDateEnd: filters.releaseDateEnd,
    shipMethod: filters.shipMethod,
    orderDateStart: filters.orderDateStart,
    orderDateEnd: filters.orderDateEnd,
    payDateStart: filters.payDateStart,
    payDateEnd: filters.payDateEnd,
    expenseDateStart: filters.expenseDateStart,
    expenseDateEnd: filters.expenseDateEnd,
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

  return call(app.api.orders.get({ query: queryParams }), {
    fallback: "Failed to get orders",
    empty: "Failed to get orders",
  });
}

type OrdersClient = ReturnType<typeof app.api.orders>;
export type OrderItemRelease = NonNullable<
  Awaited<ReturnType<OrdersClient["item-releases"]["get"]>>["data"]
>[number];

export function getOrderItemReleases(
  orderId: string,
): Promise<Result<readonly OrderItemRelease[], ApiFailure>> {
  return call(app.api.orders({ orderId })["item-releases"].get(), {
    fallback: "Failed to get order item releases",
    empty: "Failed to get order item releases",
  });
}

export function getOrderItems(
  orderId: string,
  query: OrderItemsQuery,
): Promise<Result<Page<OrderItem>, ApiFailure>> {
  return call(app.api.orders({ orderId }).items.get({ query }), {
    fallback: "Failed to get order items",
    empty: "Failed to get order items",
  });
}

export function mergeOrders(
  values: NewOrder,
  orderIds: Set<string>,
  cascadeOptions: CascadeOptions,
) {
  return call(
    app.api.orders.merge.post({
      orderIds: [...orderIds],
      newOrder: values,
      cascadeOptions,
    }),
    { fallback: "Failed to merge orders" },
  );
}

export function splitOrders(
  values: NewOrder,
  collectionIds: ReadonlySet<string>,
  cascadeOptions: CascadeOptions,
) {
  return call(
    app.api.orders.split.post({
      collectionIds: [...collectionIds],
      newOrder: values,
      cascadeOptions,
    }),
    { fallback: "Failed to split orders" },
  );
}

export function editOrder(values: EditedOrder, cascadeOptions: CascadeOptions) {
  return call(
    app.api.orders({ orderId: values.orderId }).put({
      order: values,
      cascadeOptions,
    }),
    { fallback: "Failed to edit order" },
  );
}

export function deleteOrders(orderIds: Set<string>) {
  return call(
    app.api.orders.delete({
      orderIds: [...orderIds],
    }),
    { fallback: "Failed to delete orders" },
  );
}

export function deleteOrderItem(orderId: string, collectionId: string) {
  return call(app.api.orders({ orderId }).items({ collectionId }).delete(), {
    fallback: "Failed to delete order item",
  });
}

export function deleteOrderItems(collectionIds: Set<string>) {
  return call(
    app.api.orders.items.delete({
      collectionIds: [...collectionIds],
    }),
    { fallback: "Failed to delete order items" },
  );
}

export function moveItem(
  targetOrderId: string,
  collectionIds: ReadonlySet<string>,
  orderIds?: ReadonlySet<string>,
) {
  const moveItemPayload = {
    targetOrderId,
    collectionIds: [...collectionIds],
    orderIds: [...(orderIds ?? [])],
  };

  return call(app.api.orders["move-items"].put(moveItemPayload), {
    fallback: "Failed to move items",
  }).then(
    Result.mapError((failure) =>
      ApiNotFound.is(failure)
        ? new MoveTargetGone({ message: failure.body === undefined ? "" : String(failure.body) })
        : failure,
    ),
  );
}

export const ORDER_LOAD_FAILED = "Couldn't load this order. Check your connection and try again.";

export function getOrder(orderId: string): Promise<Result<Order, ApiFailure>> {
  return call(app.api.orders({ orderId }).get(), {
    fallback: ORDER_LOAD_FAILED,
    empty: "Failed to get order",
  });
}

export function updateOrderStatus(orderId: string, status: OrderStatus) {
  return call(
    app.api.orders({ orderId }).put({
      order: {
        status,
      },
      cascadeOptions: ["status"],
    }),
    { fallback: "Failed to update order status. Please try again." },
  );
}

export type OrderDateField =
  | "releaseDate"
  | "orderDate"
  | "paymentDate"
  | "shippingDate"
  | "collectionDate";

export function updateOrderDate(orderId: string, field: OrderDateField, date: string | null) {
  return call(
    app.api.orders({ orderId }).put({
      order: { [field]: date },
      cascadeOptions: [],
    }),
    { fallback: "Failed to update order date" },
  );
}
