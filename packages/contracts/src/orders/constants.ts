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
