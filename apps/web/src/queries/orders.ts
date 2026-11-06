import { readResponse, sendRequest } from "@/lib/read-response";
import { app } from "@/lib/treaty-client";
import { MoveNotFoundError } from "./move-not-found-error";
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

export async function getOrders(filters: OrderFilters): Promise<OrdersPage> {
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

  return readResponse(app.api.orders.get({ query: queryParams }), "Failed to get orders");
}

type OrdersClient = ReturnType<typeof app.api.orders>;
export type OrderItemRelease = NonNullable<
  Awaited<ReturnType<OrdersClient["item-releases"]["get"]>>["data"]
>[number];

export async function getOrderItemReleases(orderId: string): Promise<readonly OrderItemRelease[]> {
  return readResponse(
    app.api.orders({ orderId })["item-releases"].get(),
    "Failed to get order item releases",
  );
}

export async function getOrderItems(
  orderId: string,
  query: OrderItemsQuery,
): Promise<Page<OrderItem>> {
  return readResponse(
    app.api.orders({ orderId }).items.get({ query }),
    "Failed to get order items",
  );
}

export async function mergeOrders(
  values: NewOrder,
  orderIds: Set<string>,
  cascadeOptions: CascadeOptions,
) {
  return sendRequest(
    app.api.orders.merge.post({ orderIds: [...orderIds], newOrder: values, cascadeOptions }),
    "Failed to merge orders",
  );
}

export async function splitOrders(
  values: NewOrder,
  collectionIds: ReadonlySet<string>,
  cascadeOptions: CascadeOptions,
) {
  return sendRequest(
    app.api.orders.split.post({
      collectionIds: [...collectionIds],
      newOrder: values,
      cascadeOptions,
    }),
    "Failed to split orders",
  );
}

export async function editOrder(values: EditedOrder, cascadeOptions: CascadeOptions) {
  await sendRequest(
    app.api.orders({ orderId: values.orderId }).put({ order: values, cascadeOptions }),
    "Failed to edit order",
  );
}

export async function deleteOrders(orderIds: Set<string>) {
  await sendRequest(app.api.orders.delete({ orderIds: [...orderIds] }), "Failed to delete orders");
}

export async function deleteOrderItem(orderId: string, collectionId: string) {
  await sendRequest(
    app.api.orders({ orderId }).items({ collectionId }).delete(),
    "Failed to delete order item",
  );
}

export async function deleteOrderItems(collectionIds: Set<string>) {
  await sendRequest(
    app.api.orders.items.delete({ collectionIds: [...collectionIds] }),
    "Failed to delete order items",
  );
}

export async function moveItem(
  targetOrderId: string,
  collectionIds: ReadonlySet<string>,
  orderIds?: ReadonlySet<string>,
): Promise<void> {
  const moveItemPayload = {
    targetOrderId,
    collectionIds: [...collectionIds],
    orderIds: [...(orderIds ?? [])],
  };

  const response = await app.api.orders["move-items"].put(moveItemPayload);
  if (response.error?.status === 404) throw new MoveNotFoundError(response.error.value);
  await sendRequest(response, "Failed to move items");
}

export const ORDER_LOAD_FAILED = "Couldn't load this order. Check your connection and try again.";

export async function getOrder(orderId: string): Promise<Order> {
  return readResponse(app.api.orders({ orderId }).get(), ORDER_LOAD_FAILED);
}

export async function updateOrderStatus(orderId: string, status: OrderStatus): Promise<void> {
  await sendRequest(
    app.api.orders({ orderId }).put({ order: { status }, cascadeOptions: ["status"] }),
    "Failed to update order status",
  );
}

export type OrderDateField =
  | "releaseDate"
  | "orderDate"
  | "paymentDate"
  | "shippingDate"
  | "collectionDate";

export async function updateOrderDate(
  orderId: string,
  field: OrderDateField,
  date: string | null,
): Promise<void> {
  await sendRequest(
    app.api.orders({ orderId }).put({ order: { [field]: date }, cascadeOptions: [] }),
    "Failed to update order date",
  );
}
