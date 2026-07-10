import { db } from "@myakiba/db/client";
import { collection, item, entry, entry_to_item } from "@myakiba/db/schema/figure";
import { asc, eq, count, and, desc, ilike, sql, not } from "drizzle-orm";
import { ENTRY_CATEGORIES } from "@myakiba/contracts/shared/constants";
import type { AnalyticsSection, EntryCategory } from "@myakiba/contracts/shared/types";
import type {
  AnalyticsResult,
  AnalyticsSectionItemPageRow,
  AnalyticsSectionItemsResult,
  AnalyticsSectionKpis,
  AnalyticsSectionPageRow,
  AnalyticsSectionResult,
  EntrySection,
} from "./model";

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
    scale: sql<string>`${item.scale}`.as("scale"),
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

class AnalyticsService {
  async getAnalytics(userId: string): Promise<AnalyticsResult> {
    const [entryRows, shopRows, scaleRows] = await Promise.all([
      entryRankingsPrepared.execute({ userId }),
      shopRankingsPrepared.execute({ userId }),
      scaleRankingsPrepared.execute({ userId }),
    ]);

    return {
      entries: ENTRY_CATEGORIES.map((category) => {
        const categoryRows = entryRows.filter((row) => row.category === category);

        return {
          category,
          uniqueOwned: categoryRows.length,
          topByCount: categoryRows
            .filter((row) => row.rankByCount <= TOP_LIMIT)
            .toSorted((left, right) => left.rankByCount - right.rankByCount)
            .map(({ entryId, name, itemCount, totalSpent }) => ({
              entryId,
              name,
              itemCount,
              totalSpent,
            })),
          topBySpend: categoryRows
            .filter((row) => row.rankBySpend <= TOP_LIMIT)
            .toSorted((left, right) => left.rankBySpend - right.rankBySpend)
            .map(({ entryId, name, itemCount, totalSpent }) => ({
              entryId,
              name,
              itemCount,
              totalSpent,
            })),
        };
      }),
      shops: {
        uniqueOwned: shopRows.length,
        topByCount: shopRows
          .filter((row) => row.rankByCount <= TOP_LIMIT)
          .toSorted((left, right) => left.rankByCount - right.rankByCount)
          .map(({ shop, itemCount, totalSpent }) => ({ shop, itemCount, totalSpent })),
        topBySpend: shopRows
          .filter((row) => row.rankBySpend <= TOP_LIMIT)
          .toSorted((left, right) => left.rankBySpend - right.rankBySpend)
          .map(({ shop, itemCount, totalSpent }) => ({ shop, itemCount, totalSpent })),
      },
      scales: {
        uniqueOwned: scaleRows.length,
        topByCount: scaleRows
          .filter((row) => row.rankByCount <= TOP_LIMIT)
          .toSorted((left, right) => left.rankByCount - right.rankByCount)
          .map(({ scale, itemCount, totalSpent }) => ({ scale, itemCount, totalSpent })),
        topBySpend: scaleRows
          .filter((row) => row.rankBySpend <= TOP_LIMIT)
          .toSorted((left, right) => left.rankBySpend - right.rankBySpend)
          .map(({ scale, itemCount, totalSpent }) => ({ scale, itemCount, totalSpent })),
      },
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
    let rows: readonly AnalyticsSectionPageRow[];
    let totalItemCount: number;
    let totalSpent: number;

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

      rows = await db
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

      totalItemCount = rows[0]?.totalItemCount ?? 0;
      totalSpent = rows[0]?.totalSpentAll ?? 0;
    } else if (section === "scales") {
      const scaleSummary = db
        .select({
          id: sql<string | null>`NULL`.as("id"),
          name: sql<string>`${item.scale}`.as("name"),
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
            trimmedSearch ? ilike(item.scale, `%${trimmedSearch}%`) : undefined,
          ),
        )
        .groupBy(item.scale)
        .as("analytics_scales_page_summary");

      rows = await db
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

      totalItemCount = rows[0]?.totalItemCount ?? 0;
      totalSpent = rows[0]?.totalSpentAll ?? 0;
    } else {
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

      const [entryRows, totalsRow] = await Promise.all([
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

      rows = entryRows;
      totalItemCount = totalsRow[0]?.totalItemCount ?? 0;
      totalSpent = totalsRow[0]?.totalSpent ?? 0;
    }

    const totalCount = rows[0]?.totalCount ?? 0;

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

  async getSectionItems(
    userId: string,
    section: AnalyticsSection,
    match: string,
    limit: number,
    offset: number,
  ): Promise<AnalyticsSectionItemsResult> {
    let rows: readonly AnalyticsSectionItemPageRow[];

    if (section === "shops") {
      rows = await db
        .select({
          id: item.id,
          externalId: item.externalId,
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
    } else if (section === "scales") {
      rows = await db
        .select({
          id: item.id,
          externalId: item.externalId,
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
            eq(item.scale, match),
          ),
        )
        .orderBy(asc(sql`LOWER(${item.title})`), asc(item.id))
        .limit(limit)
        .offset(offset);
    } else {
      rows = await db
        .select({
          id: item.id,
          externalId: item.externalId,
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
    }

    return {
      items: rows.map(({ id, externalId, title, image }) => ({ id, externalId, title, image })),
      totalCount: rows[0]?.totalCount ?? 0,
      limit,
      offset,
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
