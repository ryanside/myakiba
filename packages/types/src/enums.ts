import {
  SHIPPING_METHODS,
  COLLECTION_STATUSES,
  ORDER_STATUSES,
  CONDITIONS,
  ENTRY_CATEGORIES,
  DATE_FORMATS,
  SYNC_TYPES,
  SYNC_SESSION_STATUSES,
  SYNC_SESSION_ITEM_STATUSES,
} from "@myakiba/constants/enums";
import { CURRENCIES } from "@myakiba/constants/currencies";
import { CATEGORIES } from "@myakiba/constants/categories";

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
export type SyncSessionItemStatus = (typeof SYNC_SESSION_ITEM_STATUSES)[number];
