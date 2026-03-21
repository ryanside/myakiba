export const SHIPPING_METHODS = [
  "n/a",
  "EMS",
  "SAL",
  "AIRMAIL",
  "SURFACE",
  "FEDEX",
  "DHL",
  "Colissimo",
  "UPS",
  "Domestic",
] as const;

export const ORDER_STATUSES = ["Ordered", "Paid", "Shipped", "Owned"] as const;

export const COLLECTION_STATUSES = ["Ordered", "Paid", "Shipped", "Owned"] as const;

export const CONDITIONS = ["New", "Pre-Owned"] as const;

export const ENTRY_CATEGORIES = [
  "Classifications",
  "Origins",
  "Characters",
  "Companies",
  "Artists",
  "Materials",
  "Events",
] as const;

export const DATE_FORMATS = ["MM/DD/YYYY", "DD/MM/YYYY", "YYYY/MM/DD", "YYYY/DD/MM"] as const;

export const SYNC_TYPES = ["csv", "order", "order-item", "collection"] as const;

export const SYNC_SESSION_STATUSES = [
  "pending",
  "processing",
  "completed",
  "failed",
  "partial",
] as const;

export const SYNC_SESSION_ITEM_STATUSES = ["pending", "scraped", "failed"] as const;

export const CATEGORIES = [
  "Prepainted",
  "Action/Dolls",
  "Trading",
  "Garage Kits",
  "Model Kits",
  "Accessories",
  "Plushes",
  "Linens",
  "Dishes",
  "Hanged up",
  "Apparel",
  "On Walls",
  "Stationeries",
  "Misc",
  "Books",
  "Music",
  "Video",
  "Games",
] as const;

export const CURRENCIES = [
  "USD",
  "JPY",
  "CNY",
  "EUR",
  "GBP",
  "CAD",
  "AUD",
  "NZD",
  "BRL",
  "HKD",
  "PHP",
  "RUB",
  "SGD",
] as const;

export const DEFAULT_PAGE_INDEX = 0;
export const DEFAULT_PAGE_SIZE = 10;
export const DEFAULT_LIMIT = 10;
