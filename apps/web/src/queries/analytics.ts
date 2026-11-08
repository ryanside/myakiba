import { Result } from "better-result";
import { call } from "@/data/api";
import type { ApiFailure } from "@/data/api";
import { app } from "@/lib/treaty-client";
import { DEFAULT_LIMIT } from "@myakiba/contracts/shared/constants";
import type { AnalyticsSection } from "@myakiba/contracts/shared/types";
import type {
  AnalyticsSectionFilters,
  AnalyticsSectionItemsFilters,
  AnalyticsSectionRelationshipsFilters,
} from "@myakiba/contracts/analytics/schema";

export type AnalyticsOverviewResponse = NonNullable<
  Awaited<ReturnType<typeof app.api.analytics.get>>["data"]
>;

type AnalyticsSectionClient = ReturnType<typeof app.api.analytics>;

export type AnalyticsSectionData = NonNullable<
  Awaited<ReturnType<AnalyticsSectionClient["get"]>>["data"]
>["analytics"];
export type AnalyticsSectionRow = AnalyticsSectionData["rows"][number];
export type AnalyticsSectionItemsData = NonNullable<
  Awaited<ReturnType<AnalyticsSectionClient["items"]["get"]>>["data"]
>;

export type AnalyticsSectionRelationshipsData = NonNullable<
  Awaited<ReturnType<AnalyticsSectionClient["relationships"]["get"]>>["data"]
>;
export type AnalyticsSectionRelationshipValue = AnalyticsSectionRelationshipsData["items"][number];
export type AnalyticsSectionRelationshipPreviewItem =
  AnalyticsSectionRelationshipValue["previewItems"][number];

/**
 * Returns the API path for an analytics section.
 *
 * Content blockers can reject a request URL that ends in `/events`.
 * The client uses `/section-entries` for the `events` section.
 * The server converts this path value to `events`.
 */
function getAnalyticsSectionApiPath(sectionName: AnalyticsSection) {
  return sectionName === "events" ? "section-entries" : sectionName;
}

export function getAnalytics(): Promise<Result<AnalyticsOverviewResponse, ApiFailure>> {
  return call(app.api.analytics.get(), {
    fallback: "Failed to get analytics",
    empty: "Failed to get analytics",
  });
}

export function getAnalyticsSection(
  sectionName: AnalyticsSection,
  filters: AnalyticsSectionFilters = {},
): Promise<Result<AnalyticsSectionData, ApiFailure>> {
  const apiSectionName = getAnalyticsSectionApiPath(sectionName);
  const search = filters.search?.trim();
  const query = {
    search: search && search.length > 0 ? search : undefined,
    limit: filters.limit ?? DEFAULT_LIMIT,
    offset: filters.offset ?? 0,
    sort: filters.sort,
    order: filters.order,
  };

  return call(app.api.analytics({ sectionName: apiSectionName }).get({ query }), {
    fallback: "Failed to get analytics section",
    empty: "Failed to get analytics section",
  }).then(Result.map((data) => data.analytics));
}

export function getAnalyticsSectionItems(
  sectionName: AnalyticsSection,
  filters: AnalyticsSectionItemsFilters,
): Promise<Result<AnalyticsSectionItemsData, ApiFailure>> {
  const apiSectionName = getAnalyticsSectionApiPath(sectionName);
  const query = {
    match: filters.match,
    limit: filters.limit ?? 6,
    offset: filters.offset ?? 0,
  };

  return call(app.api.analytics({ sectionName: apiSectionName }).items.get({ query }), {
    fallback: "Failed to get analytics section items",
    empty: "Failed to get analytics section items",
  });
}

export function getAnalyticsSectionRelationships(
  sectionName: AnalyticsSection,
  filters: AnalyticsSectionRelationshipsFilters,
): Promise<Result<AnalyticsSectionRelationshipsData, ApiFailure>> {
  const apiSectionName = getAnalyticsSectionApiPath(sectionName);
  const query = {
    match: filters.match,
    relatedSection: filters.relatedSection,
    limit: filters.limit ?? 5,
    offset: filters.offset ?? 0,
  };
  return call(app.api.analytics({ sectionName: apiSectionName }).relationships.get({ query }), {
    fallback: "Failed to get analytics section relationships",
    empty: "Failed to get analytics section relationships",
  });
}
