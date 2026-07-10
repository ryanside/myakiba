import * as z from "zod";
import { ANALYTICS_SECTIONS, DEFAULT_LIMIT } from "@myakiba/contracts/shared/constants";
import type { AnalyticsSection, EntryCategory } from "@myakiba/contracts/shared/types";

export const analyticsSectionParamSchema = z.object({
  sectionName: z.enum(ANALYTICS_SECTIONS),
});

export const analyticsSectionQuerySchema = z.object({
  search: z.string().trim().optional(),
  limit: z.coerce.number().int().positive().optional().default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export const analyticsSectionItemsQuerySchema = z.object({
  match: z.string().min(1),
  limit: z.coerce.number().int().positive().optional().default(6),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

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

export type AnalyticsSectionPageRow = AnalyticsSectionRow & {
  readonly totalCount: number;
  readonly totalItemCount?: number;
  readonly totalSpentAll?: number;
};

export type AnalyticsSectionItemPageRow = AnalyticsSectionItem & {
  readonly totalCount: number;
};

export type EntrySection = Exclude<AnalyticsSection, "shops" | "scales">;
