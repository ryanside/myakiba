import { db } from "@myakiba/db/client";
import { collection, item, entry, entry_to_item } from "@myakiba/db/schema/figure";
import { asc, eq, count, and, desc, ilike, sql, not } from "drizzle-orm";
import { ENTRY_CATEGORIES } from "@myakiba/contracts/shared/constants";
import type { AnalyticsSection, EntryCategory } from "@myakiba/contracts/shared/types";

type RankedRow = {
  readonly rankByCount: number;
  readonly rankBySpend: number;
};

type EntryLeaderboardRow = {
  readonly entryId: string;
  readonly name: string;
  readonly itemCount: number;
  readonly totalSpent: number;
};

type EntryCategoryAnalytics = {
  readonly category: EntryCategory;
  readonly uniqueOwned: number;
  readonly topByCount: readonly EntryLeaderboardRow[];
  readonly topBySpend: readonly EntryLeaderboardRow[];
};

type ShopLeaderboardRow = {
  readonly shop: string;
  readonly itemCount: number;
  readonly totalSpent: number;
};

type ScaleLeaderboardRow = {
  readonly scale: string | null;
  readonly itemCount: number;
  readonly totalSpent: number;
};

type RankedAnalytics<T> = {
  readonly uniqueOwned: number;
  readonly topByCount: readonly T[];
  readonly topBySpend: readonly T[];
};

export type AnalyticsResult = {
  readonly entries: readonly EntryCategoryAnalytics[];
  readonly shops: RankedAnalytics<ShopLeaderboardRow>;
  readonly scales: RankedAnalytics<ScaleLeaderboardRow>;
};

type AnalyticsSectionRow = {
  readonly id: string | null;
  readonly name: string;
  readonly itemCount: number;
  readonly totalSpent: number;
};

type AnalyticsSectionKpis = {
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
  readonly title: string;
  readonly image: string | null;
};

export type AnalyticsSectionItemsResult = {
  readonly items: readonly AnalyticsSectionItem[];
  readonly totalCount: number;
  readonly limit: number;
  readonly offset: number;
};

type AnalyticsSectionPageRow = AnalyticsSectionRow & {
  readonly totalCount: number;
  readonly totalItemCount?: number;
  readonly totalSpentAll?: number;
};

type AnalyticsSectionItemPageRow = AnalyticsSectionItem & {
  readonly totalCount: number;
};

type EntrySection = Exclude<AnalyticsSection, "shops" | "scales">;

const TOP_LIMIT = 10;

const EMPTY_SECTION_KPIS: AnalyticsSectionKpis = {
  uniqueCount: 0,
  totalItemCount: 0,
  totalSpent: 0,
  averageSpent: 0,
};

const entryCategoryBySection = {
  artists: "Artists",
  characters: "Characters",
  origins: "Origins",
  companies: "Companies",
  classifications: "Classifications",
  events: "Events",
  materials: "Materials",
} as const satisfies Record<EntrySection, EntryCategory>;

const entrySummaryQuery = db
  .select({
    entryId: entry.id,
    name: entry.name,
    category: entry.category,
    itemCount: count().as("itemCount"),
    totalSpent: sql<number>`SUM(${collection.price})`.as("totalSpent"),
  })
  .from(collection)
  .innerJoin(entry_to_item, eq(collection.itemId, entry_to_item.itemId))
  .innerJoin(entry, eq(entry_to_item.entryId, entry.id))
  .where(and(eq(collection.userId, sql.placeholder("userId")), eq(collection.status, "Owned")))
  .groupBy(entry.id, entry.name, entry.category)
  .as("analytics_entry_summary");

const entryRankingsPrepared = db
  .select({
    entryId: entrySummaryQuery.entryId,
    name: entrySummaryQuery.name,
    category: entrySummaryQuery.category,
    itemCount: entrySummaryQuery.itemCount,
    totalSpent: entrySummaryQuery.totalSpent,
    rankByCount: sql<number>`ROW_NUMBER() OVER (
      PARTITION BY ${entrySummaryQuery.category}
      ORDER BY ${entrySummaryQuery.itemCount} DESC, ${entrySummaryQuery.totalSpent} DESC
    )`,
    rankBySpend: sql<number>`ROW_NUMBER() OVER (
      PARTITION BY ${entrySummaryQuery.category}
      ORDER BY ${entrySummaryQuery.totalSpent} DESC, ${entrySummaryQuery.itemCount} DESC
    )`,
  })
  .from(entrySummaryQuery)
  .prepare("analytics_entry_rankings");

const shopSummaryQuery = db
  .select({
    shop: collection.shop,
    itemCount: count().as("itemCount"),
    totalSpent: sql<number>`SUM(${collection.price})`.as("totalSpent"),
  })
  .from(collection)
  .where(
    and(
      eq(collection.userId, sql.placeholder("userId")),
      eq(collection.status, "Owned"),
      not(eq(collection.shop, "")),
    ),
  )
  .groupBy(collection.shop)
  .as("analytics_shop_summary");

const shopRankingsPrepared = db
  .select({
    shop: shopSummaryQuery.shop,
    itemCount: shopSummaryQuery.itemCount,
    totalSpent: shopSummaryQuery.totalSpent,
    rankByCount: sql<number>`ROW_NUMBER() OVER (
      ORDER BY ${shopSummaryQuery.itemCount} DESC, ${shopSummaryQuery.totalSpent} DESC
    )`,
    rankBySpend: sql<number>`ROW_NUMBER() OVER (
      ORDER BY ${shopSummaryQuery.totalSpent} DESC, ${shopSummaryQuery.itemCount} DESC
    )`,
  })
  .from(shopSummaryQuery)
  .prepare("analytics_shop_rankings");

const scaleSummaryQuery = db
  .select({
    scale: item.scale,
    itemCount: count().as("itemCount"),
    totalSpent: sql<number>`SUM(${collection.price})`.as("totalSpent"),
  })
  .from(collection)
  .innerJoin(item, eq(collection.itemId, item.id))
  .where(
    and(
      eq(collection.userId, sql.placeholder("userId")),
      eq(collection.status, "Owned"),
      eq(item.category, "Prepainted"),
    ),
  )
  .groupBy(item.scale)
  .as("analytics_scale_summary");

const scaleRankingsPrepared = db
  .select({
    scale: scaleSummaryQuery.scale,
    itemCount: scaleSummaryQuery.itemCount,
    totalSpent: scaleSummaryQuery.totalSpent,
    rankByCount: sql<number>`ROW_NUMBER() OVER (
      ORDER BY ${scaleSummaryQuery.itemCount} DESC, ${scaleSummaryQuery.totalSpent} DESC
    )`,
    rankBySpend: sql<number>`ROW_NUMBER() OVER (
      ORDER BY ${scaleSummaryQuery.totalSpent} DESC, ${scaleSummaryQuery.itemCount} DESC
    )`,
  })
  .from(scaleSummaryQuery)
  .prepare("analytics_scale_rankings");

type EntryRankingRow = Awaited<ReturnType<typeof entryRankingsPrepared.execute>>[number];

function buildRankedAnalytics<T extends RankedRow, TResult>(
  rows: readonly T[],
  mapRow: (row: T) => TResult,
): RankedAnalytics<TResult> {
  return {
    uniqueOwned: rows.length,
    topByCount: rows
      .filter((row) => row.rankByCount <= TOP_LIMIT)
      .sort((left, right) => left.rankByCount - right.rankByCount)
      .map(mapRow),
    topBySpend: rows
      .filter((row) => row.rankBySpend <= TOP_LIMIT)
      .sort((left, right) => left.rankBySpend - right.rankBySpend)
      .map(mapRow),
  };
}

function buildEntryAnalytics(rows: readonly EntryRankingRow[]): readonly EntryCategoryAnalytics[] {
  const buckets = new Map<
    EntryCategory,
    {
      uniqueOwned: number;
      topByCount: EntryRankingRow[];
      topBySpend: EntryRankingRow[];
    }
  >(
    ENTRY_CATEGORIES.map((category) => [
      category,
      {
        uniqueOwned: 0,
        topByCount: [],
        topBySpend: [],
      },
    ]),
  );

  for (const row of rows) {
    const bucket = buckets.get(row.category as EntryCategory);
    if (!bucket) {
      continue;
    }

    bucket.uniqueOwned += 1;

    if (row.rankByCount <= TOP_LIMIT) {
      bucket.topByCount.push(row);
    }

    if (row.rankBySpend <= TOP_LIMIT) {
      bucket.topBySpend.push(row);
    }
  }

  return ENTRY_CATEGORIES.map((category) => {
    const bucket = buckets.get(category);

    return {
      category,
      uniqueOwned: bucket?.uniqueOwned ?? 0,
      topByCount:
        bucket?.topByCount
          .sort((left, right) => left.rankByCount - right.rankByCount)
          .map((row) => ({
            entryId: row.entryId,
            name: row.name,
            itemCount: row.itemCount,
            totalSpent: row.totalSpent,
          })) ?? [],
      topBySpend:
        bucket?.topBySpend
          .sort((left, right) => left.rankBySpend - right.rankBySpend)
          .map((row) => ({
            entryId: row.entryId,
            name: row.name,
            itemCount: row.itemCount,
            totalSpent: row.totalSpent,
          })) ?? [],
    };
  });
}

function buildSectionResult(
  section: AnalyticsSection,
  limit: number,
  offset: number,
  rows: readonly AnalyticsSectionPageRow[],
  kpiOverrides?: Partial<Pick<AnalyticsSectionKpis, "totalItemCount" | "totalSpent">>,
): AnalyticsSectionResult {
  const firstRow = rows[0];
  const totalCount = firstRow?.totalCount ?? 0;
  const totalItemCount = kpiOverrides?.totalItemCount ?? firstRow?.totalItemCount ?? 0;
  const totalSpent = kpiOverrides?.totalSpent ?? firstRow?.totalSpentAll ?? 0;

  return {
    section,
    limit,
    offset,
    totalCount,
    kpis:
      totalCount === 0
        ? EMPTY_SECTION_KPIS
        : {
            uniqueCount: totalCount,
            totalItemCount,
            totalSpent,
            averageSpent: totalItemCount === 0 ? 0 : totalSpent / totalItemCount,
          },
    rows: rows.map(({ id, name, itemCount, totalSpent: rowTotalSpent }) => ({
      id,
      name,
      itemCount,
      totalSpent: rowTotalSpent,
    })),
  };
}

function buildSectionItemsResult(
  limit: number,
  offset: number,
  rows: readonly AnalyticsSectionItemPageRow[],
): AnalyticsSectionItemsResult {
  return {
    items: rows.map(({ id, title, image }) => ({ id, title, image })),
    totalCount: rows[0]?.totalCount ?? 0,
    limit,
    offset,
  };
}

class AnalyticsService {
  async getAnalytics(userId: string): Promise<AnalyticsResult> {
    const [entryRows, shopRows, scaleRows] = await Promise.all([
      entryRankingsPrepared.execute({ userId }),
      shopRankingsPrepared.execute({ userId }),
      scaleRankingsPrepared.execute({ userId }),
    ]);

    return {
      entries: buildEntryAnalytics(entryRows),
      shops: buildRankedAnalytics(shopRows, (row) => ({
        shop: row.shop,
        itemCount: row.itemCount,
        totalSpent: row.totalSpent,
      })),
      scales: buildRankedAnalytics(scaleRows, (row) => ({
        scale: row.scale,
        itemCount: row.itemCount,
        totalSpent: row.totalSpent,
      })),
    };
  }

  async getSectionAnalytics(
    userId: string,
    section: AnalyticsSection,
    limit: number,
    offset: number,
    search?: string,
  ): Promise<AnalyticsSectionResult> {
    const trimmedSearch = search?.trim();

    if (section === "shops") {
      const shopSummary = db
        .select({
          id: sql<string | null>`NULL`.as("id"),
          name: collection.shop,
          itemCount: count().as("itemCount"),
          totalSpent: sql<number>`COALESCE(SUM(${collection.price}), 0)`.as("totalSpent"),
        })
        .from(collection)
        .where(
          and(
            eq(collection.userId, userId),
            eq(collection.status, "Owned"),
            not(eq(collection.shop, "")),
            trimmedSearch ? ilike(collection.shop, `%${trimmedSearch}%`) : undefined,
          ),
        )
        .groupBy(collection.shop)
        .as("analytics_shops_page_summary");

      const rows = await db
        .select({
          id: shopSummary.id,
          name: shopSummary.name,
          itemCount: shopSummary.itemCount,
          totalSpent: shopSummary.totalSpent,
          totalCount: sql<number>`COUNT(*) OVER()`,
          totalItemCount: sql<number>`COALESCE(SUM(${shopSummary.itemCount}) OVER(), 0)`,
          totalSpentAll: sql<number>`COALESCE(SUM(${shopSummary.totalSpent}) OVER(), 0)`,
        })
        .from(shopSummary)
        .orderBy(
          desc(shopSummary.itemCount),
          desc(shopSummary.totalSpent),
          asc(sql`LOWER(${shopSummary.name})`),
        )
        .limit(limit)
        .offset(offset);

      return buildSectionResult(section, limit, offset, rows);
    }

    if (section === "scales") {
      const scaleName = sql<string>`COALESCE(${item.scale}, 'Unknown')`;
      const scaleSummary = db
        .select({
          id: sql<string | null>`NULL`.as("id"),
          name: scaleName.as("name"),
          itemCount: count().as("itemCount"),
          totalSpent: sql<number>`COALESCE(SUM(${collection.price}), 0)`.as("totalSpent"),
        })
        .from(collection)
        .innerJoin(item, eq(collection.itemId, item.id))
        .where(
          and(
            eq(collection.userId, userId),
            eq(collection.status, "Owned"),
            eq(item.category, "Prepainted"),
            trimmedSearch ? ilike(scaleName, `%${trimmedSearch}%`) : undefined,
          ),
        )
        .groupBy(item.scale)
        .as("analytics_scales_page_summary");

      const rows = await db
        .select({
          id: scaleSummary.id,
          name: scaleSummary.name,
          itemCount: scaleSummary.itemCount,
          totalSpent: scaleSummary.totalSpent,
          totalCount: sql<number>`COUNT(*) OVER()`,
          totalItemCount: sql<number>`COALESCE(SUM(${scaleSummary.itemCount}) OVER(), 0)`,
          totalSpentAll: sql<number>`COALESCE(SUM(${scaleSummary.totalSpent}) OVER(), 0)`,
        })
        .from(scaleSummary)
        .orderBy(
          desc(scaleSummary.itemCount),
          desc(scaleSummary.totalSpent),
          asc(sql`LOWER(${scaleSummary.name})`),
        )
        .limit(limit)
        .offset(offset);

      return buildSectionResult(section, limit, offset, rows);
    }

    const entryFilters = and(
      eq(collection.userId, userId),
      eq(collection.status, "Owned"),
      eq(entry.category, entryCategoryBySection[section]),
      trimmedSearch ? ilike(entry.name, `%${trimmedSearch}%`) : undefined,
    );

    const matchedCollections = db
      .selectDistinct({
        id: collection.id,
        price: collection.price,
      })
      .from(collection)
      .innerJoin(entry_to_item, eq(collection.itemId, entry_to_item.itemId))
      .innerJoin(entry, eq(entry_to_item.entryId, entry.id))
      .where(entryFilters)
      .as("analytics_entry_matched_collections");

    const entrySummary = db
      .select({
        id: entry.id,
        name: entry.name,
        itemCount: sql<number>`COUNT(DISTINCT ${collection.id})`.as("itemCount"),
        totalSpent: sql<number>`COALESCE(SUM(${collection.price}), 0)`.as("totalSpent"),
      })
      .from(collection)
      .innerJoin(entry_to_item, eq(collection.itemId, entry_to_item.itemId))
      .innerJoin(entry, eq(entry_to_item.entryId, entry.id))
      .where(entryFilters)
      .groupBy(entry.id, entry.name)
      .as("analytics_entries_page_summary");

    const [rows, totalsRow] = await Promise.all([
      db
        .select({
          id: entrySummary.id,
          name: entrySummary.name,
          itemCount: entrySummary.itemCount,
          totalSpent: entrySummary.totalSpent,
          totalCount: sql<number>`COUNT(*) OVER()`,
        })
        .from(entrySummary)
        .orderBy(
          desc(entrySummary.itemCount),
          desc(entrySummary.totalSpent),
          asc(sql`LOWER(${entrySummary.name})`),
        )
        .limit(limit)
        .offset(offset),
      db
        .select({
          totalItemCount: count().as("totalItemCount"),
          totalSpent: sql<number>`COALESCE(SUM(${matchedCollections.price}), 0)`.as("totalSpent"),
        })
        .from(matchedCollections),
    ]);

    return buildSectionResult(section, limit, offset, rows, {
      totalItemCount: totalsRow[0]?.totalItemCount ?? 0,
      totalSpent: totalsRow[0]?.totalSpent ?? 0,
    });
  }

  async getSectionItems(
    userId: string,
    section: AnalyticsSection,
    match: string,
    limit: number,
    offset: number,
  ): Promise<AnalyticsSectionItemsResult> {
    if (section === "shops") {
      const rows = await db
        .select({
          id: item.id,
          title: item.title,
          image: item.image,
          totalCount: sql<number>`COUNT(*) OVER()`,
        })
        .from(collection)
        .innerJoin(item, eq(collection.itemId, item.id))
        .where(
          and(
            eq(collection.userId, userId),
            eq(collection.status, "Owned"),
            eq(collection.shop, match),
          ),
        )
        .orderBy(asc(sql`LOWER(${item.title})`), asc(item.id))
        .limit(limit)
        .offset(offset);

      return buildSectionItemsResult(limit, offset, rows);
    }

    if (section === "scales") {
      const scaleName = sql<string>`COALESCE(${item.scale}, 'Unknown')`;
      const rows = await db
        .select({
          id: item.id,
          title: item.title,
          image: item.image,
          totalCount: sql<number>`COUNT(*) OVER()`,
        })
        .from(collection)
        .innerJoin(item, eq(collection.itemId, item.id))
        .where(
          and(
            eq(collection.userId, userId),
            eq(collection.status, "Owned"),
            eq(item.category, "Prepainted"),
            eq(scaleName, match),
          ),
        )
        .orderBy(asc(sql`LOWER(${item.title})`), asc(item.id))
        .limit(limit)
        .offset(offset);

      return buildSectionItemsResult(limit, offset, rows);
    }

    const rows = await db
      .select({
        id: item.id,
        title: item.title,
        image: item.image,
        totalCount: sql<number>`COUNT(*) OVER()`,
      })
      .from(collection)
      .innerJoin(item, eq(collection.itemId, item.id))
      .innerJoin(entry_to_item, eq(item.id, entry_to_item.itemId))
      .innerJoin(entry, eq(entry_to_item.entryId, entry.id))
      .where(
        and(
          eq(collection.userId, userId),
          eq(collection.status, "Owned"),
          eq(entry.category, entryCategoryBySection[section]),
          eq(entry.id, match),
        ),
      )
      .orderBy(asc(sql`LOWER(${item.title})`), asc(item.id))
      .limit(limit)
      .offset(offset);

    return buildSectionItemsResult(limit, offset, rows);
  }
}

export default new AnalyticsService();

// ---------------------------------------------------------------------------
// Commented-out queries not yet part of the revamp
// ---------------------------------------------------------------------------
// this.priceRangeDistributionPrepared = db
//   .select({
//     priceRange: sql<string>`
//       CASE
//         WHEN ${collection.price} < 5000 THEN '< $50'
//         WHEN ${collection.price} < 10000 THEN '$50-$100'
//         WHEN ${collection.price} < 20000 THEN '$100-$200'
//         WHEN ${collection.price} < 50000 THEN '$200-$500'
//         ELSE '> $500'
//       END
//     `,
//     count: count(),
//     totalValue: sql<number>`SUM(${collection.price})`,
//   })
//   .from(collection)
//   .where(and(eq(collection.userId, sql.placeholder("userId")), eq(collection.status, "Owned")))
//   .groupBy(
//     sql`
//     CASE
//       WHEN ${collection.price} < 5000 THEN '< $50'
//       WHEN ${collection.price} < 10000 THEN '$50-$100'
//       WHEN ${collection.price} < 20000 THEN '$100-$200'
//       WHEN ${collection.price} < 50000 THEN '$200-$500'
//       ELSE '> $500'
//     END
//   `,
//   )
//   .orderBy(sql`MIN(${collection.price})`)
//   .prepare("price_range_distribution");
//
// this.mostExpensiveCollectionItemsPrepared = db
//   .select({
//     itemId: item.id,
//     itemTitle: item.title,
//     itemImage: item.image,
//     itemCategory: item.category,
//     collectionPrice: collection.price,
//   })
//   .from(collection)
//   .innerJoin(item, eq(collection.itemId, item.id))
//   .where(and(eq(collection.userId, sql.placeholder("userId")), eq(collection.status, "Owned")))
//   .orderBy(desc(collection.price))
//   .limit(10)
//   .prepare("most_expensive_items");
//
// this.totalOwnedPrepared = db
//   .select({ count: count() })
//   .from(collection)
//   .where(and(eq(collection.userId, sql.placeholder("userId")), eq(collection.status, "Owned")))
//   .prepare("total_owned");
