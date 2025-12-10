import {
  SHIPPING_METHODS,
  ORDER_STATUSES,
  CONDITIONS,
  CURRENCIES,
  CATEGORIES,
} from "@myakiba/constants";

export type ShippingMethod = (typeof SHIPPING_METHODS)[number];
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type Condition = (typeof CONDITIONS)[number];
export type Currency = (typeof CURRENCIES)[number];
export type Category = (typeof CATEGORIES)[number];

