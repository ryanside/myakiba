import type { ShippingMethod, OrderStatus } from "./enums";
import type { CollectionItem } from "./collection";
import type {
  OrderFilters as SchemaOrderFilters,
  NewOrder as SchemaNewOrder,
  EditedOrder as SchemaEditedOrder,
  CascadeOptions as SchemaCascadeOptions,
  ItemRelease as SchemaItemRelease,
  ItemReleasesResponse as SchemaItemReleasesResponse,
} from "@myakiba/schemas";

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

export type NewOrder = SchemaNewOrder;

export type EditedOrder = SchemaEditedOrder;

export type OrderFilters = SchemaOrderFilters;

export type CascadeOptions = SchemaCascadeOptions;

export type ItemRelease = SchemaItemRelease;

export type ItemReleasesResponse = SchemaItemReleasesResponse;
