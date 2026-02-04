import type { ShippingMethod, OrderStatus } from "./enums";
import type { CollectionItem } from "./collection";

export type OrderStats = {
  totalOrders: number;
  totalSpent: number;
  activeOrders: number;
  unpaidCosts: number;
};

export type OrderQueryResponse = Order;

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
  items: OrderItem[];
};

export type OrderItem = Omit<
  CollectionItem,
  "itemCategory" | "itemScale" | "createdAt" | "updatedAt" | "totalCount" | "totalValue"
>;

export type NewOrder = {
  title: string;
  shop: string;
  releaseDate: string | null;
  shippingMethod: ShippingMethod;
  orderDate: string | null;
  paymentDate: string | null;
  shippingDate: string | null;
  collectionDate: string | null;
  status: OrderStatus;
  shippingFee: number;
  taxes: number;
  duties: number;
  tariffs: number;
  miscFees: number;
  notes: string;
};

export type EditedOrder = NewOrder & {
  orderId: string;
};

export type OrderFilters = {
  limit?: number | undefined;
  offset?: number | undefined;
  sort?:
    | "title"
    | "shop"
    | "orderDate"
    | "paymentDate"
    | "shippingDate"
    | "collectionDate"
    | "releaseDate"
    | "shippingMethod"
    | "total"
    | "shippingFee"
    | "taxes"
    | "duties"
    | "tariffs"
    | "miscFees"
    | "itemCount"
    | "status"
    | "createdAt"
    | undefined;
  order?: "asc" | "desc" | undefined;
  search?: string | undefined;
  shop?: string[] | undefined;
  releaseDateStart?: string | undefined;
  releaseDateEnd?: string | undefined;
  shipMethod?: ShippingMethod[] | undefined;
  orderDateStart?: string | undefined;
  orderDateEnd?: string | undefined;
  payDateStart?: string | undefined;
  payDateEnd?: string | undefined;
  shipDateStart?: string | undefined;
  shipDateEnd?: string | undefined;
  colDateStart?: string | undefined;
  colDateEnd?: string | undefined;
  status?: OrderStatus[] | undefined;
  totalMin?: number | undefined;
  totalMax?: number | undefined;
  shippingFeeMin?: number | undefined;
  shippingFeeMax?: number | undefined;
  taxesMin?: number | undefined;
  taxesMax?: number | undefined;
  dutiesMin?: number | undefined;
  dutiesMax?: number | undefined;
  tariffsMin?: number | undefined;
  tariffsMax?: number | undefined;
  miscFeesMin?: number | undefined;
  miscFeesMax?: number | undefined;
};

export type CascadeOptions = Array<
  | "status"
  | "shop"
  | "orderDate"
  | "paymentDate"
  | "shippingDate"
  | "collectionDate"
  | "shippingMethod"
>;

export type ItemRelease = {
  id: string;
  itemId: string;
  date: string;
  type: string | null;
  price: number | null;
  priceCurrency: string | null;
  barcode: string | null;
};

export type ItemReleasesResponse = {
  releases: ItemRelease[];
};
