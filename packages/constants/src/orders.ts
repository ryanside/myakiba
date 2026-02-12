export const ORDER_CASCADE_OPTIONS = [
  "status",
  "shop",
  "orderDate",
  "paymentDate",
  "shippingDate",
  "collectionDate",
  "shippingMethod",
] as const;

export type OrderCascadeOption = (typeof ORDER_CASCADE_OPTIONS)[number];

export const SYNC_CSV_ITEM_STATUSES = ["Owned", "Ordered"] as const;
export type SyncCsvItemStatus = (typeof SYNC_CSV_ITEM_STATUSES)[number];
