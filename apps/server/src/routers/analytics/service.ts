import { db } from "@myakiba/db/client";
import { collection, item, entry, entry_to_item } from "@myakiba/db/schema/figure";
import { eq, count, and, sql, not } from "drizzle-orm";
import { ENTRY_CATEGORIES } from "@myakiba/contracts/shared/constants";

type EntryCategory = (typeof ENTRY_CATEGORIES)[number];

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

const TOP_LIMIT = 10;

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
