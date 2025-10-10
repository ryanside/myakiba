import type { CollectionItem } from "@/lib/collection/types";

export type OrdersQueryResponse = {
  orders: Order[];
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
  shippingMethod:
    | "n/a"
    | "EMS"
    | "SAL"
    | "AIRMAIL"
    | "SURFACE"
    | "FEDEX"
    | "DHL"
    | "Colissimo"
    | "UPS"
    | "Domestic";
  orderDate: string | null;
  paymentDate: string | null;
  shippingDate: string | null;
  collectionDate: string | null;
  status: "Ordered" | "Paid" | "Shipped" | "Owned";
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
  | "itemCategory"
  | "itemScale"
  | "createdAt"
  | "updatedAt"
  | "totalCount"
  | "totalValue"
>;

export type NewOrder = {
  title: string;
  shop: string;
  releaseMonthYear: string | null;
  shippingMethod:
    | "n/a"
    | "EMS"
    | "SAL"
    | "AIRMAIL"
    | "SURFACE"
    | "FEDEX"
    | "DHL"
    | "Colissimo"
    | "UPS"
    | "Domestic";
  orderDate: string | null;
  paymentDate: string | null;
  shippingDate: string | null;
  collectionDate: string | null;
  status: "Ordered" | "Paid" | "Shipped" | "Owned";
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
    | "releaseMonthYear"
    | "shippingMethod"
    | "total"
    | "itemCount"
    | "createdAt"
    | undefined;
  order?: "asc" | "desc" | undefined;
  search?: string | undefined;
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
  itemId: number;
  date: string;
  type: string | null;
  price: string | null;
  priceCurrency: string | null;
  barcode: string | null;
};

export type ItemReleasesResponse = {
  releases: ItemRelease[];
};
