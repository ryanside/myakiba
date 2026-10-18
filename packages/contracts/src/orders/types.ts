import type { CollectionItem } from "../collection/types";
import type { Page } from "../shared/pagination";
import type { OrderStatus, ShippingMethod } from "../shared/types";

export type Order = {
  orderId: string;
  title: string;
  shop: string;
  releaseDate: string | null;
  shippingMethod: ShippingMethod;
  orderDate: string | null;
  paymentDate: string | null;
  shippingDate: string | null;
  collectionDate: string | null;
  status: OrderStatus;
  total: number;
  shippingFee: number;
  taxes: number;
  duties: number;
  tariffs: number;
  miscFees: number;
  notes: string;
  itemCount: number;
  readonly images: readonly string[];
  createdAt: string;
  updatedAt: string;
};

/** A page of Orders and the summary of every Order the filters match. */
export type OrdersPage = Page<Order> & {
  readonly totalSpent: number;
  readonly activeOrders: number;
  readonly unpaidCosts: number;
};

export type OrderItem = Omit<CollectionItem, "itemScale" | "createdAt" | "updatedAt">;
