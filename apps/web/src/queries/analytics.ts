import { app, getErrorMessage } from "@/lib/treaty-client";
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
export type AnalyticsSectionRelationshipValue = AnalyticsSectionRelationshipsData["values"][number];
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

export async function getAnalytics(): Promise<AnalyticsOverviewResponse> {
  const { data, error } = await app.api.analytics.get();

  if (error) {
    throw new Error(getErrorMessage(error, "Failed to get analytics"));
  }

  if (!data) {
    throw new Error("Failed to get analytics");
  }

  return data;
}

export async function getAnalyticsSection(
  sectionName: AnalyticsSection,
  filters: AnalyticsSectionFilters = {},
): Promise<AnalyticsSectionData> {
  const apiSectionName = getAnalyticsSectionApiPath(sectionName);
  const search = filters.search?.trim();
  const query = {
    search: search && search.length > 0 ? search : undefined,
    limit: filters.limit ?? DEFAULT_LIMIT,
    offset: filters.offset ?? 0,
    sort: filters.sort,
    order: filters.order,
  };

  const { data, error } = await app.api.analytics({ sectionName: apiSectionName }).get({ query });

  if (error) {
    throw new Error(getErrorMessage(error, "Failed to get analytics section"));
  }

  if (!data?.analytics) {
    throw new Error("Failed to get analytics section");
  }

  return data.analytics;
}

export async function getAnalyticsSectionItems(
  sectionName: AnalyticsSection,
  filters: AnalyticsSectionItemsFilters,
): Promise<AnalyticsSectionItemsData> {
  const apiSectionName = getAnalyticsSectionApiPath(sectionName);
  const query = {
    match: filters.match,
    limit: filters.limit ?? 6,
    offset: filters.offset ?? 0,
  };

  const { data, error } = await app.api.analytics({ sectionName: apiSectionName }).items.get({
    query,
  });

  if (error) {
    throw new Error(getErrorMessage(error, "Failed to get analytics section items"));
  }

  if (!data?.items) {
    throw new Error("Failed to get analytics section items");
  }

  return data;
}

export async function getAnalyticsSectionRelationships(
  sectionName: AnalyticsSection,
  filters: AnalyticsSectionRelationshipsFilters,
): Promise<AnalyticsSectionRelationshipsData> {
  const apiSectionName = getAnalyticsSectionApiPath(sectionName);
  const query = {
    match: filters.match,
    relatedSection: filters.relatedSection,
    limit: filters.limit ?? 5,
    offset: filters.offset ?? 0,
  };
  const { data, error } = await app.api
    .analytics({ sectionName: apiSectionName })
    .relationships.get({ query });

  if (error) {
    throw new Error(getErrorMessage(error, "Failed to get analytics section relationships"));
  }

  if (!data?.values) {
    throw new Error("Failed to get analytics section relationships");
  }

  return data;
}
