export type OrdersQueryResponse = {
  orders: Order[];
  totalCount: number;
  pagination: {
    limit: number;
    offset: number;
    pageCount: number;
  };
};

export type Order = {
  orderId: string;
  title: string;
  shop: string | null;
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
    | "Domestic"
    | null;
  orderDate: string | null;
  paymentDate: string | null;
  shippingDate: string | null;
  collectionDate: string | null;
  orderStatus: "Ordered" | "Paid" | "Shipped" | "Collected";
  total: string;
  shippingFee: string;
  taxes: string;
  duties: string;
  tariffs: string;
  miscFees: string;
  notes: string | null;
  itemCount: number;
  createdAt: string;
  items: OrderItem[];
  totalCount: number;
};

export type OrderItem = {
  collectionId: string;
  itemId: number;
  title: string;
  image: string | null;
  price: string;
  count: number;
  shop: string | null;
  orderDate: string | null;
  paymentDate: string | null;
  shippingDate: string | null;
  collectionDate: string | null;
  shippingMethod: string | null;
  releaseDate: string | null;
  condition: string | null;
};

export type NewOrder = {
  title: string;
  shop: string | null;
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
    | "Domestic"
    | null;
  orderDate: string | null;
  paymentDate: string | null;
  shippingDate: string | null;
  collectionDate: string | null;
  orderStatus: "Ordered" | "Paid" | "Shipped" | "Collected";
  shippingFee: string;
  taxes: string;
  duties: string;
  tariffs: string;
  miscFees: string;
  notes: string | null;
};

export type EditedOrder = NewOrder & {
  orderId: string;
};

export type Filters = {
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
  | "orderStatus"
  | "shop"
  | "orderDate"
  | "paymentDate"
  | "shippingDate"
  | "collectionDate"
  | "shippingMethod"
>;

