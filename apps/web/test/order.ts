import type { Order, OrdersPage } from "@myakiba/contracts/orders/types";

export const order: Order = {
  orderId: "od-deleted",
  title: "Deleted order",
  shop: "AmiAmi",
  releaseDate: null,
  shippingMethod: "n/a",
  orderDate: null,
  paymentDate: null,
  shippingDate: null,
  collectionDate: null,
  status: "Ordered",
  shippingFee: 100,
  taxes: 0,
  duties: 0,
  tariffs: 0,
  miscFees: 0,
  notes: "",
  total: 1000,
  itemCount: 1,
  images: [],
  createdAt: "2026-11-05T00:00:00.000Z",
  updatedAt: "2026-11-05T00:00:00.000Z",
};

export const ordersPage: OrdersPage = {
  items: [order],
  totalCount: 1,
  totalSpent: 1000,
  activeOrders: 1,
  unpaidCosts: 0,
};
