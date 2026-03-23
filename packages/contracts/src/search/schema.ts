import * as z from "zod";
import { itemReleaseSchema } from "../items/schema";

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

export const searchQuerySchema = z.object({
  search: z.string().trim().min(1),
});

export const searchCollectionResultSchema = z.object({
  itemId: z.string(),
  itemExternalId: z.number().nullable(),
  itemTitle: z.string(),
  itemImage: z.string().nullable(),
  itemCategory: z.string().nullable(),
});

export const searchOrderResultSchema = z.object({
  orderId: z.string(),
  orderTitle: z.string(),
  itemImages: z.array(z.string()),
});

export const searchDataSchema = z.object({
  collectionResults: z.array(searchCollectionResultSchema),
  orderResults: z.array(searchOrderResultSchema),
});

export const searchResponseSchema = z.object({
  searchData: searchDataSchema,
});

export const searchReleasesQuerySchema = z.object({
  itemId: z.string().trim().min(1),
});

export const searchReleasesResponseSchema = z.object({
  releases: z.array(itemReleaseSchema),
});

export const searchEntriesQuerySchema = z.object({
  search: z.string().trim().min(1),
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const searchEntryResultSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string().nullable(),
});

export const searchEntriesResponseSchema = z.object({
  entries: z.array(searchEntryResultSchema),
});

export const searchOrdersQuerySchema = z.object({
  title: z.string().optional(),
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const searchOrderIdAndTitleSchema = z.object({
  id: z.string(),
  title: z.string(),
});

export const searchOrdersResponseSchema = z.object({
  orderIdsAndTitles: z.array(searchOrderIdAndTitleSchema),
});

export type SortDirection = z.infer<typeof sortDirectionSchema>;
export type OrderSearchSort = z.infer<typeof orderSearchSortSchema>;
export type CollectionSearchSort = z.infer<typeof collectionSearchSortSchema>;
export type SearchQuery = z.infer<typeof searchQuerySchema>;
export type SearchCollectionResult = z.infer<typeof searchCollectionResultSchema>;
export type SearchOrderResult = z.infer<typeof searchOrderResultSchema>;
export type SearchData = z.infer<typeof searchDataSchema>;
export type SearchResponse = z.infer<typeof searchResponseSchema>;
export type SearchEntryResult = z.infer<typeof searchEntryResultSchema>;
export type SearchOrderIdAndTitle = z.infer<typeof searchOrderIdAndTitleSchema>;
