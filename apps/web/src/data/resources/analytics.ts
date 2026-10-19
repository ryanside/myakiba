import { keepPreviousData } from "@tanstack/react-query";
import type {
  AnalyticsSectionFilters,
  AnalyticsSectionItemsFilters,
  AnalyticsSectionRelationshipsFilters,
} from "@myakiba/contracts/analytics/schema";
import type { AnalyticsSection } from "@myakiba/contracts/shared/types";
import {
  getAnalytics,
  getAnalyticsSection,
  getAnalyticsSectionItems,
  getAnalyticsSectionRelationships,
} from "@/queries/analytics";
import { rootedRead } from "../client";

type InSection<Filters> = { readonly sectionName: AnalyticsSection; readonly filters: Filters };

export const analytics = {
  overview: rootedRead("analytics", {
    key: () => ["analytics"] as const,
    load: getAnalytics,
    staleTime: 1000 * 60 * 5,
    retry: false,
  }),
  section: rootedRead("analytics", {
    key: ({ sectionName, filters }: InSection<AnalyticsSectionFilters>) =>
      ["analytics", "section", sectionName, filters] as const,
    load: ({ sectionName, filters }) => getAnalyticsSection(sectionName, filters),
    staleTime: 1000 * 60 * 5,
    retry: false,
    placeholderData: keepPreviousData,
  }),
  sectionItems: rootedRead("analytics", {
    key: ({ sectionName, filters }: InSection<Required<AnalyticsSectionItemsFilters>>) =>
      [
        "analytics",
        "section-items",
        sectionName,
        filters.match,
        filters.limit,
        filters.offset,
      ] as const,
    load: ({ sectionName, filters }) => getAnalyticsSectionItems(sectionName, filters),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  }),
  sectionRelationships: rootedRead("analytics", {
    key: ({ sectionName, filters }: InSection<Required<AnalyticsSectionRelationshipsFilters>>) =>
      [
        "analytics",
        "section-relationships",
        sectionName,
        filters.match,
        filters.relatedSection,
        filters.limit,
        filters.offset,
      ] as const,
    load: ({ sectionName, filters }) => getAnalyticsSectionRelationships(sectionName, filters),
    keepPrevious: (previousData, { filters }) => previousData.section === filters.relatedSection,
    staleTime: 30_000,
    retry: false,
  }),
};
