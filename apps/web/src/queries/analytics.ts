import { app, getErrorMessage } from "@/lib/treaty-client";
import { DEFAULT_LIMIT } from "@myakiba/contracts/shared/constants";
import type { AnalyticsSection, EntryCategory } from "@myakiba/contracts/shared/types";

type AnalyticsCellValue = string | number | null;

/**
 * Shared row shape for `LeaderboardTable`.
 * It reads cells by string column ids, so analytics rows need record-style access.
 */
type AnalyticsRow<TData extends object> = Readonly<TData> &
  Readonly<Record<string, AnalyticsCellValue>>;

// Overview route: `apps/web/src/routes/(app)/analytics.tsx`
export interface RankedAnalytics<TRow> {
  readonly uniqueOwned: number;
  readonly topByCount: readonly TRow[];
  readonly topBySpend: readonly TRow[];
}

export type EntryLeaderboardRow = AnalyticsRow<{
  readonly entryId: string;
  readonly name: string;
  readonly itemCount: number;
  readonly totalSpent: number;
}>;

export type ShopLeaderboardRow = AnalyticsRow<{
  readonly shop: string;
  readonly itemCount: number;
  readonly totalSpent: number;
}>;

export type ScaleLeaderboardRow = AnalyticsRow<{
  readonly scale: string;
  readonly itemCount: number;
  readonly totalSpent: number;
}>;

export interface EntryCategoryAnalytics {
  readonly category: EntryCategory;
  readonly uniqueOwned: number;
  readonly topByCount: readonly EntryLeaderboardRow[];
  readonly topBySpend: readonly EntryLeaderboardRow[];
}

/** Response payload consumed by the overview analytics page. */
export interface AnalyticsOverview {
  readonly entries: readonly EntryCategoryAnalytics[];
  readonly shops: RankedAnalytics<ShopLeaderboardRow>;
  readonly scales: RankedAnalytics<ScaleLeaderboardRow>;
}

export interface AnalyticsOverviewResponse {
  readonly analytics: AnalyticsOverview;
}

// Section route: `apps/web/src/routes/(app)/analytics_.$sectionName.tsx`
export interface AnalyticsSectionFilters {
  readonly search?: string;
  readonly limit?: number;
  readonly offset?: number;
}

export interface AnalyticsSectionItemsFilters {
  readonly match: string;
  readonly limit?: number;
  readonly offset?: number;
}

export type AnalyticsSectionRow = AnalyticsRow<{
  readonly id: string | null;
  readonly name: string;
  readonly itemCount: number;
  readonly totalSpent: number;
}>;

export interface AnalyticsSectionKpis {
  readonly uniqueCount: number;
  readonly totalItemCount: number;
  readonly totalSpent: number;
  readonly averageSpent: number;
}

/** Response payload consumed by the per-section analytics page. */
export interface AnalyticsSectionData {
  readonly section: AnalyticsSection;
  readonly rows: readonly AnalyticsSectionRow[];
  readonly kpis: AnalyticsSectionKpis;
  readonly totalCount: number;
  readonly limit: number;
  readonly offset: number;
}

export interface AnalyticsSectionResponse {
  readonly analytics: AnalyticsSectionData;
}

export interface AnalyticsSectionItem {
  readonly id: string;
  readonly title: string;
  readonly image: string | null;
}

export interface AnalyticsSectionItemsData {
  readonly items: readonly AnalyticsSectionItem[];
  readonly totalCount: number;
  readonly limit: number;
  readonly offset: number;
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
  const search = filters.search?.trim();
  const query = {
    search: search && search.length > 0 ? search : undefined,
    limit: filters.limit ?? DEFAULT_LIMIT,
    offset: filters.offset ?? 0,
  };

  const { data, error } = await app.api.analytics({ sectionName }).get({ query });

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
  const query = {
    match: filters.match,
    limit: filters.limit ?? 6,
    offset: filters.offset ?? 0,
  };

  const { data, error } = await app.api.analytics({ sectionName }).items.get({ query });

  if (error) {
    throw new Error(getErrorMessage(error, "Failed to get analytics section items"));
  }

  if (!data?.items) {
    throw new Error("Failed to get analytics section items");
  }

  return data;
}
