import {
  SHIPPING_METHODS,
  COLLECTION_STATUSES,
  ORDER_STATUSES,
  CONDITIONS,
  CURRENCIES,
  CATEGORIES,
  ENTRY_CATEGORIES,
  DATE_FORMATS,
} from "@myakiba/constants";

export type ShippingMethod = (typeof SHIPPING_METHODS)[number];
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type CollectionStatus = (typeof COLLECTION_STATUSES)[number];
export type Condition = (typeof CONDITIONS)[number];
export type Currency = (typeof CURRENCIES)[number];
export type Category = (typeof CATEGORIES)[number];
export type EntryCategory = (typeof ENTRY_CATEGORIES)[number];
export type DateFormat = (typeof DATE_FORMATS)[number];

