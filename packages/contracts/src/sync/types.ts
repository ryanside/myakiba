import type {
  Condition,
  OrderStatus,
  ShippingMethod,
  SyncSessionItemStatus,
  SyncSessionStatus,
  SyncType,
} from "../shared/types";
import type { InternalCsvItem, SyncJobStatus } from "./schema";

export type SyncSessionRow = {
  readonly id: string;
  readonly userId: string;
  readonly syncType: SyncType;
  readonly jobId: string | null;
  readonly status: SyncSessionStatus;
  readonly statusMessage: string;
  readonly orderId: string | null;
  readonly totalItems: number;
  readonly successCount: number;
  readonly failCount: number;
  readonly retrySupported: boolean;
  readonly canRetry: boolean;
  readonly isRetrying: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly completedAt: Date | null;
};

export type SyncSessionDetail = SyncSessionRow & {
  readonly warnings: NonNullable<SyncJobStatus["warnings"]>;
};

type SyncSessionItemRow = {
  readonly id: string;
  readonly syncSessionId: string;
  readonly itemExternalId: number;
  readonly status: SyncSessionItemStatus;
  readonly errorReason: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type EnrichedSyncSessionItemRow = SyncSessionItemRow & {
  readonly itemId: string | null;
  readonly itemTitle: string | null;
  readonly itemImage: string | null;
};

export type UserItem = InternalCsvItem;

export type SyncFormOrderItem = {
  readonly formRowId: string;
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

type SyncOrderItem = Omit<
  SyncFormOrderItem,
  | "formRowId"
  | "itemExternalId"
  | "orderDate"
  | "paymentDate"
  | "shippingDate"
  | "collectionDate"
  | "price"
> & {
  itemExternalId: number;
  price: number;
  orderDate: string | null;
  paymentDate: string | null;
  shippingDate: string | null;
  collectionDate: string | null;
};

export type SyncOrderItems = {
  readonly orderId: string;
  readonly items: readonly SyncOrderItem[];
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
  readonly formRowId: string;
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
  | "formRowId"
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
