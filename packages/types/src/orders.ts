import type { ShippingMethod, OrderStatus } from "./enums";
import type { CollectionItem } from "./collection";

export type OrderStats = {
  totalOrders: number;
  totalSpent: string;
  activeOrders: number;
  unpaidCosts: string;
};

export type OrdersQueryResponse = {
  orders: Order[];
  orderStats: OrderStats;
  totalCount: number;
  pagination: {
    limit: number;
    offset: number;
    pageCount: number;
  };
};

export type OrderQueryResponse = Omit<Order, "totalCount">;

export type Order = {
  orderId: string;
  title: string;
  shop: string;
  releaseMonthYear: string | null;
  shippingMethod: ShippingMethod;
  orderDate: string | null;
  paymentDate: string | null;
  shippingDate: string | null;
  collectionDate: string | null;
  status: OrderStatus;
  total: string;
  shippingFee: string;
  taxes: string;
  duties: string;
  tariffs: string;
  miscFees: string;
  notes: string;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
  totalCount: number;
};

export type OrderItem = Omit<
  CollectionItem,
  "itemCategory" | "itemScale" | "createdAt" | "updatedAt" | "totalCount" | "totalValue"
>;

export type NewOrder = {
  title: string;
  shop: string;
  releaseMonthYear: string | null;
  shippingMethod: ShippingMethod;
  orderDate: string | null;
  paymentDate: string | null;
  shippingDate: string | null;
  collectionDate: string | null;
  status: OrderStatus;
  shippingFee: string;
  taxes: string;
  duties: string;
  tariffs: string;
  miscFees: string;
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
    | "releaseMonthYear"
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
  releaseMonthYearStart?: string | undefined;
  releaseMonthYearEnd?: string | undefined;
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
  totalMin?: string | undefined;
  totalMax?: string | undefined;
  shippingFeeMin?: string | undefined;
  shippingFeeMax?: string | undefined;
  taxesMin?: string | undefined;
  taxesMax?: string | undefined;
  dutiesMin?: string | undefined;
  dutiesMax?: string | undefined;
  tariffsMin?: string | undefined;
  tariffsMax?: string | undefined;
  miscFeesMin?: string | undefined;
  miscFeesMax?: string | undefined;
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
  price: string | null;
  priceCurrency: string | null;
  barcode: string | null;
};

export type ItemReleasesResponse = {
  releases: ItemRelease[];
};
