import * as z from "zod";
import { CATEGORIES, DEFAULT_PAGE_SIZE, ENTRY_CATEGORIES } from "../shared/constants";
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

export const searchCommandResponseSchema = z.object({
  searchData: searchCommandDataSchema,
});

export const catalogItemsSearchSchema = z.object({
  query: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((value) => value || undefined),
  page: paginationPageSchema.default(1),
  pageSize: paginationLimitSchema.default(DEFAULT_PAGE_SIZE),
});

export const catalogItemReleaseSummarySchema = z.object({
  date: z.iso.date(),
  type: z.string().nullable(),
  price: z.number().int().nullable(),
  priceCurrency: z.string().nullable(),
});

export const catalogItemSearchResultSchema = z.object({
  itemId: z.string(),
  externalId: z.number().int().positive(),
  title: z.string(),
  image: z.string().nullable(),
  category: z.enum(CATEGORIES).nullable(),
  latestRelease: catalogItemReleaseSummarySchema.nullable(),
});

export const catalogItemsSearchResponseSchema = z.object({
  items: z.array(catalogItemSearchResultSchema),
  totalCount: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});

export const searchEntriesQuerySchema = z.object({
  search: z.string().trim().min(1),
  category: z.enum(ENTRY_CATEGORIES).optional(),
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
export type SearchCommandQuery = z.infer<typeof searchCommandQuerySchema>;
export type SearchCommandCollectionResult = z.infer<typeof searchCommandCollectionResultSchema>;
export type SearchCommandOrderResult = z.infer<typeof searchCommandOrderResultSchema>;
export type SearchCommandData = z.infer<typeof searchCommandDataSchema>;
export type SearchCommandResponse = z.infer<typeof searchCommandResponseSchema>;
export type CatalogItemsSearch = z.infer<typeof catalogItemsSearchSchema>;
export type CatalogItemReleaseSummary = z.infer<typeof catalogItemReleaseSummarySchema>;
export type CatalogItemSearchResult = z.infer<typeof catalogItemSearchResultSchema>;
export type CatalogItemsSearchResponse = z.infer<typeof catalogItemsSearchResponseSchema>;
export type SearchEntriesQuery = z.infer<typeof searchEntriesQuerySchema>;
export type SearchEntryResult = z.infer<typeof searchEntryResultSchema>;
export type SearchEntriesResponse = z.infer<typeof searchEntriesResponseSchema>;
export type SearchOrdersQuery = z.infer<typeof searchOrdersQuerySchema>;
export type SearchOrderIdAndTitle = z.infer<typeof searchOrderIdAndTitleSchema>;
export type SearchOrdersResponse = z.infer<typeof searchOrdersResponseSchema>;
