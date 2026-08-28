import * as z from "zod";
import { ANALYTICS_SECTIONS, DEFAULT_LIMIT } from "../shared/constants";
import { paginationLimitSchema, paginationOffsetSchema } from "../shared/pagination";

const analyticsRelationshipsLimitSchema = paginationLimitSchema.max(25);

export const analyticsSectionSchema = z.enum(ANALYTICS_SECTIONS);

/**
 * Validates the section name from an analytics API path.
 *
 * Content blockers can reject a request URL that ends in `/events`.
 * The client sends `section-entries` for the `events` section.
 * The transform returns `events` to the analytics service.
 */
export const analyticsSectionParamSchema = z.object({
  sectionName: z
    .union([analyticsSectionSchema, z.literal("section-entries")])
    .transform((sectionName) => (sectionName === "section-entries" ? "events" : sectionName)),
});

export const analyticsSectionSearchSchema = z.object({
  search: z.string().optional(),
  limit: paginationLimitSchema.optional(),
  offset: paginationOffsetSchema.optional(),
  sort: z.enum(["name", "itemCount", "totalSpent"]).optional(),
  order: z.enum(["asc", "desc"]).optional(),
});

export const analyticsSectionQuerySchema = analyticsSectionSearchSchema.extend({
  search: z.string().trim().optional(),
  limit: paginationLimitSchema.optional().default(DEFAULT_LIMIT),
  offset: paginationOffsetSchema.optional().default(0),
});

export const analyticsSectionItemsQuerySchema = z.object({
  match: z.string().min(1),
  limit: paginationLimitSchema.optional().default(6),
  offset: paginationOffsetSchema.optional().default(0),
});

export const analyticsSectionRelationshipsQuerySchema = z.object({
  match: z.string().min(1),
  relatedSection: analyticsSectionSchema,
  limit: analyticsRelationshipsLimitSchema.optional().default(5),
  offset: paginationOffsetSchema.optional().default(0),
});

export type AnalyticsSectionFilters = z.infer<typeof analyticsSectionSearchSchema>;
export type AnalyticsSectionItemsFilters = z.input<typeof analyticsSectionItemsQuerySchema>;
export type AnalyticsSectionRelationshipsFilters = z.input<
  typeof analyticsSectionRelationshipsQuerySchema
>;
export type AnalyticsSectionSort = NonNullable<AnalyticsSectionFilters["sort"]>;
export type AnalyticsSectionSortOrder = NonNullable<AnalyticsSectionFilters["order"]>;
