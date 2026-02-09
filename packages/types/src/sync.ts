import type { ShippingMethod, OrderStatus, Condition } from "./enums";
import { syncSession, syncSessionItem } from "@myakiba/db/schema/figure";

export type SyncSessionRow = typeof syncSession.$inferSelect;
export type SyncSessionItemRow = typeof syncSessionItem.$inferSelect;
export type EnrichedSyncSessionItemRow = SyncSessionItemRow & {
  readonly itemId: string | null;
  readonly itemTitle: string | null;
  readonly itemImage: string | null;
};

export type SyncStatus = {
  existingItems: number;
  newItems: number;
  isFinished: boolean;
  status: string;
};

export type SyncFormOrderItem = {
  itemExternalId: string;
  price: string;
  count: number;
  status: OrderStatus;
  condition: Condition;
  shippingMethod: ShippingMethod;
  orderDate: string;
  paymentDate: string;
  shippingDate: string;
  collectionDate: string;
};

export type SyncOrderItem = Omit<
  SyncFormOrderItem,
  "itemExternalId" | "orderDate" | "paymentDate" | "shippingDate" | "collectionDate" | "price"
> & {
  itemExternalId: number;
  price: number;
  orderDate: string | null;
  paymentDate: string | null;
  shippingDate: string | null;
  collectionDate: string | null;
};

export type SyncFormOrder = {
  status: OrderStatus;
  title: string;
  shop: string;
  orderDate: string;
  releaseDate: string;
  paymentDate: string;
  shippingDate: string;
  collectionDate: string;
  shippingMethod: ShippingMethod;
  shippingFee: string;
  taxes: string;
  duties: string;
  tariffs: string;
  miscFees: string;
  notes: string;
  items: SyncFormOrderItem[];
};

export type SyncOrder = Omit<
  SyncFormOrder,
  | "items"
  | "orderDate"
  | "releaseDate"
  | "paymentDate"
  | "shippingDate"
  | "collectionDate"
  | "shippingFee"
  | "taxes"
  | "duties"
  | "tariffs"
  | "miscFees"
> & {
  items: SyncOrderItem[];
  shippingFee: number;
  taxes: number;
  duties: number;
  tariffs: number;
  miscFees: number;
  orderDate: string | null;
  releaseDate: string | null;
  paymentDate: string | null;
  shippingDate: string | null;
  collectionDate: string | null;
};

export type SyncFormCollectionItem = {
  itemExternalId: string;
  price: string;
  count: number;
  score: number;
  shop: string;
  orderDate: string;
  paymentDate: string;
  shippingDate: string;
  collectionDate: string;
  shippingMethod: ShippingMethod;
  tags: string[];
  condition: Condition;
  notes: string;
};

export type SyncCollectionItem = Omit<
  SyncFormCollectionItem,
  | "itemExternalId"
  | "orderDate"
  | "paymentDate"
  | "shippingDate"
  | "collectionDate"
  | "score"
  | "price"
> & {
  itemExternalId: number;
  price: number;
  orderDate: string | null;
  paymentDate: string | null;
  shippingDate: string | null;
  collectionDate: string | null;
  score: string;
};

export type UserItem = {
  itemExternalId: number;
  status: "Owned" | "Ordered";
  count: number;
  score: string;
  payment_date: string | null;
  shipping_date: string | null;
  collecting_date: string | null;
  price: string;
  shop: string;
  shipping_method: ShippingMethod;
  note: string;
  orderId: null;
  orderDate: string | null;
};
