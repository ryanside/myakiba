import type { AnalyticsSection, EntryCategory } from "@myakiba/contracts/shared/types";

export type EntryLeaderboardRow = {
  readonly entryId: string;
  readonly name: string;
  readonly itemCount: number;
  readonly totalSpent: number;
};

export type EntryCategoryAnalytics = {
  readonly category: EntryCategory;
  readonly uniqueOwned: number;
  readonly topByCount: readonly EntryLeaderboardRow[];
  readonly topBySpend: readonly EntryLeaderboardRow[];
};

export type ShopLeaderboardRow = {
  readonly shop: string;
  readonly itemCount: number;
  readonly totalSpent: number;
};

export type ScaleLeaderboardRow = {
  readonly scale: string;
  readonly itemCount: number;
  readonly totalSpent: number;
};

export type RankedAnalytics<T> = {
  readonly uniqueOwned: number;
  readonly topByCount: readonly T[];
  readonly topBySpend: readonly T[];
};

export type AnalyticsResult = {
  readonly entries: readonly EntryCategoryAnalytics[];
  readonly shops: RankedAnalytics<ShopLeaderboardRow>;
  readonly scales: RankedAnalytics<ScaleLeaderboardRow>;
};

export type AnalyticsSectionRow = {
  readonly id: string | null;
  readonly name: string;
  readonly itemCount: number;
  readonly totalSpent: number;
};

export type AnalyticsSectionKpis = {
  readonly uniqueCount: number;
  readonly totalItemCount: number;
  readonly totalSpent: number;
  readonly averageSpent: number;
};

export type AnalyticsSectionResult = {
  readonly section: AnalyticsSection;
  readonly rows: readonly AnalyticsSectionRow[];
  readonly kpis: AnalyticsSectionKpis;
  readonly totalCount: number;
  readonly limit: number;
  readonly offset: number;
};

export type AnalyticsSectionItem = {
  readonly id: string;
  readonly externalId: number | null;
  readonly title: string;
  readonly image: string | null;
};

export type AnalyticsSectionItemsResult = {
  readonly items: readonly AnalyticsSectionItem[];
  readonly totalCount: number;
  readonly limit: number;
  readonly offset: number;
};

export type AnalyticsSectionRelationshipPreviewItem = {
  readonly id: string;
  readonly externalId: number | null;
  readonly title: string;
  readonly image: string;
};

export type AnalyticsSectionRelationshipValue = {
  readonly id: string | null;
  readonly name: string;
  readonly itemCount: number;
  readonly previewItems: readonly AnalyticsSectionRelationshipPreviewItem[];
};

export type AnalyticsSectionRelationshipsResult = {
  readonly section: AnalyticsSection;
  readonly totalCount: number;
  readonly values: readonly AnalyticsSectionRelationshipValue[];
  readonly limit: number;
  readonly offset: number;
};

export type EntrySection = Exclude<AnalyticsSection, "shops" | "scales">;
