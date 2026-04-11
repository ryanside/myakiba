import {
  ANALYTICS_SECTIONS,
  CATEGORIES,
  COLLECTION_STATUSES,
  CONDITIONS,
  CURRENCIES,
  DATE_FORMATS,
  ENTRY_CATEGORIES,
  ORDER_STATUSES,
  SHIPPING_METHODS,
  SYNC_SESSION_ITEM_STATUSES,
  SYNC_SESSION_STATUSES,
  SYNC_TYPES,
} from "./constants";

export type ShippingMethod = (typeof SHIPPING_METHODS)[number];
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type CollectionStatus = (typeof COLLECTION_STATUSES)[number];
export type Condition = (typeof CONDITIONS)[number];
export type Currency = (typeof CURRENCIES)[number];
export type Category = (typeof CATEGORIES)[number];
export type EntryCategory = (typeof ENTRY_CATEGORIES)[number];
export type DateFormat = (typeof DATE_FORMATS)[number];
export type SyncType = (typeof SYNC_TYPES)[number];
export type SyncSessionStatus = (typeof SYNC_SESSION_STATUSES)[number];
export type AnalyticsSection = (typeof ANALYTICS_SECTIONS)[number];
export type SyncSessionItemStatus = (typeof SYNC_SESSION_ITEM_STATUSES)[number];
