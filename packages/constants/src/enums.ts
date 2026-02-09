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

export const SYNC_TYPES = ["csv", "order", "collection"] as const;

export const SYNC_SESSION_STATUSES = [
  "pending",
  "processing",
  "completed",
  "failed",
  "partial",
] as const;

export const SYNC_SESSION_ITEM_STATUSES = ["pending", "scraped", "failed"] as const;
