import type {
  ShippingMethod,
  OrderStatus,
  Condition,
  SyncSessionStatus,
  SyncSessionItemStatus,
  SyncType,
} from "./enums";
import type {
  InternalCsvItem,
  SyncTerminalState as SharedSyncTerminalState,
  SyncJobStatus as SharedSyncJobStatus,
} from "@myakiba/schemas";

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
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly completedAt: Date | null;
};

export type SyncSessionItemRow = {
  readonly id: string;
  readonly syncSessionId: string;
  readonly itemExternalId: number;
  readonly status: SyncSessionItemStatus;
  readonly errorReason: string | null;
  readonly retryCount: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

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

export type SyncTerminalState = SharedSyncTerminalState;
export type SyncJobStatus = Readonly<SharedSyncJobStatus>;

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

export type UserItem = InternalCsvItem;
