import * as z from "zod";

export const sortDirectionSchema = z.enum(["asc", "desc"]);

export const orderSearchSortSchema = z.enum([
  "title",
  "shop",
  "orderDate",
  "paymentDate",
  "shippingDate",
  "collectionDate",
  "releaseDate",
  "shippingMethod",
  "total",
  "shippingFee",
  "taxes",
  "duties",
  "tariffs",
  "miscFees",
  "itemCount",
  "status",
  "createdAt",
]);

export const collectionSearchSortSchema = z.enum([
  "itemTitle",
  "itemCategory",
  "itemScale",
  "status",
  "count",
  "score",
  "price",
  "shop",
  "orderDate",
  "paymentDate",
  "shippingDate",
  "releaseDate",
  "collectionDate",
  "createdAt",
]);

export type SortDirection = z.infer<typeof sortDirectionSchema>;
export type OrderSearchSort = z.infer<typeof orderSearchSortSchema>;
export type CollectionSearchSort = z.infer<typeof collectionSearchSortSchema>;
