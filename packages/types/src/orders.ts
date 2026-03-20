import type { ShippingMethod, OrderStatus } from "./enums";
import type { CollectionItem } from "./collection";

export type OrderStats = {
  totalOrders: number;
  totalSpent: number;
  activeOrders: number;
  unpaidCosts: number;
};

export type PaginatedResult<T> = {
  readonly items: readonly T[];
  readonly totalCount: number;
};

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
  createdAt: string;
  updatedAt: string;
};

export type OrderListItem = Order & {
  readonly totalCount: number;
  readonly images: readonly string[];
};

export type OrderItem = Omit<
  CollectionItem,
  "itemCategory" | "itemScale" | "createdAt" | "updatedAt" | "totalCount" | "totalValue"
>;

export type { OrderFilters } from "@myakiba/schemas/search";
export type { NewOrder, EditedOrder, CascadeOptions } from "@myakiba/schemas/orders";
export type { ItemRelease, ItemReleasesResponse } from "@myakiba/schemas/items";
