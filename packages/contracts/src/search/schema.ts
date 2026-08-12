import * as z from "zod";
import { CATEGORIES, DEFAULT_PAGE_SIZE } from "../shared/constants";
import {
  paginationLimitSchema,
  paginationOffsetSchema,
  paginationPageSchema,
} from "../shared/pagination";

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

export const searchCommandQuerySchema = z.object({
  search: z.string().trim().min(1),
});

export const searchCommandCollectionResultSchema = z.object({
  itemId: z.string(),
  itemExternalId: z.number().nullable(),
  itemTitle: z.string(),
  itemImage: z.string().nullable(),
  itemCategory: z.string().nullable(),
});

export const searchCommandOrderResultSchema = z.object({
  orderId: z.string(),
  orderTitle: z.string(),
  itemImages: z.array(z.string()),
});

export const searchCommandDataSchema = z.object({
  collectionResults: z.array(searchCommandCollectionResultSchema),
  orderResults: z.array(searchCommandOrderResultSchema),
});

export const itemDatabaseSearchSchema = z.object({
  query: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((value) => value || undefined),
  page: paginationPageSchema.default(1),
  pageSize: paginationLimitSchema.default(DEFAULT_PAGE_SIZE),
});

export const itemDatabaseReleaseSummarySchema = z.object({
  date: z.iso.date(),
  price: z.number().int().nullable(),
  priceCurrency: z.string().nullable(),
});

export const itemDatabaseItemSchema = z.object({
  itemId: z.string(),
  externalId: z.number().int().positive(),
  title: z.string(),
  image: z.string().nullable(),
  category: z.enum(CATEGORIES).nullable(),
  latestRelease: itemDatabaseReleaseSummarySchema.nullable(),
});

export const itemDatabaseSearchResponseSchema = z.object({
  items: z.array(itemDatabaseItemSchema),
  totalCount: z.number().int().nonnegative(),
});

export const searchEntriesQuerySchema = z.object({
  search: z.string().trim().min(1),
  limit: paginationLimitSchema.optional(),
  offset: paginationOffsetSchema.optional(),
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
  limit: paginationLimitSchema.optional(),
  offset: paginationOffsetSchema.optional(),
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
export type SearchCommandCollectionResult = z.infer<typeof searchCommandCollectionResultSchema>;
export type SearchCommandData = z.infer<typeof searchCommandDataSchema>;
export type ItemDatabaseSearch = z.infer<typeof itemDatabaseSearchSchema>;
export type ItemDatabaseItem = z.infer<typeof itemDatabaseItemSchema>;
export type ItemDatabaseSearchResponse = z.infer<typeof itemDatabaseSearchResponseSchema>;
export type SearchEntriesQuery = z.infer<typeof searchEntriesQuerySchema>;
export type SearchEntryResult = z.infer<typeof searchEntryResultSchema>;
export type SearchEntriesResponse = z.infer<typeof searchEntriesResponseSchema>;
export type SearchOrdersQuery = z.infer<typeof searchOrdersQuerySchema>;
export type SearchOrderIdAndTitle = z.infer<typeof searchOrderIdAndTitleSchema>;
export type SearchOrdersResponse = z.infer<typeof searchOrdersResponseSchema>;
