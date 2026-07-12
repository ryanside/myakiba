import { db } from "@myakiba/db/client";
import { collection, item, entry, entry_to_item } from "@myakiba/db/schema/figure";
import {
  and,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  lte,
  not,
  sql,
} from "drizzle-orm";
import type { SQL, SQLWrapper } from "drizzle-orm";
import { ENTRY_CATEGORIES } from "@myakiba/contracts/shared/constants";
import type { AnalyticsSection, EntryCategory } from "@myakiba/contracts/shared/types";
import type {
  AnalyticsResult,
  AnalyticsSectionItemsResult,
  AnalyticsSectionKpis,
  AnalyticsSectionRow,
  AnalyticsSectionRelationshipPreviewItem,
  AnalyticsSectionRelationshipValue,
  AnalyticsSectionRelationshipsResult,
  AnalyticsSectionResult,
  AnalyticsSectionSort,
  AnalyticsSectionSortOrder,
  EntrySection,
} from "./model";

const TOP_LIMIT = 10;
const RELATIONSHIP_PREVIEW_LIMIT = 3;

const EMPTY_SECTION_KPIS: AnalyticsSectionKpis = {
  uniqueCount: 0,
  totalItemCount: 0,
  totalSpent: 0,
  averageSpent: 0,
};

type SectionOrderFields = {
  readonly name: SQLWrapper;
  readonly itemCount: SQLWrapper;
  readonly totalSpent: SQLWrapper;
  readonly id?: SQLWrapper;
};

function getSectionOrderBy(
  fields: SectionOrderFields,
  sort?: AnalyticsSectionSort,
  order?: AnalyticsSectionSortOrder,
): SQL[] {
  const name = sql`LOWER(${fields.name})`;
  const stableId = fields.id ? [asc(fields.id)] : [];
  const stableName = [asc(name), asc(fields.name)];

  if (!sort || !order) {
    return [desc(fields.itemCount), desc(fields.totalSpent), ...stableName, ...stableId];
  }

  const direction = order === "asc" ? asc : desc;
  const primary = sort === "name" ? name : fields[sort];

  if (sort === "name") {
    return [direction(primary), direction(fields.name), ...stableId];
  }

  return [direction(primary), ...stableName, ...stableId];
}

const entryCategoryBySection = {
  artists: "Artists",
  characters: "Characters",
  origins: "Origins",
  companies: "Companies",
  classifications: "Classifications",
  events: "Events",
  materials: "Materials",
} as const satisfies Record<EntrySection, EntryCategory>;

function getSectionCollectionFilter(section: AnalyticsSection, match: string) {
  if (section === "shops") {
    return eq(collection.shop, match);
  }

  if (section === "scales") {
    return and(eq(item.category, "Prepainted"), eq(item.scale, match));
  }

  const sourceItemIds = db
    .select({ itemId: entry_to_item.itemId })
    .from(entry_to_item)
    .innerJoin(entry, eq(entry_to_item.entryId, entry.id))
    .where(
      and(eq(entry_to_item.entryId, match), eq(entry.category, entryCategoryBySection[section])),
    );

  return inArray(collection.itemId, sourceItemIds);
}

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
    sort?: AnalyticsSectionSort,
    order?: AnalyticsSectionSortOrder,
  ): Promise<AnalyticsSectionResult> {
    const trimmedSearch = search?.trim();
    let rows: readonly AnalyticsSectionRow[];
    let totalCount: number;
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

      const [shopRows, totalsRows] = await Promise.all([
        db
          .select({
            id: shopSummary.id,
            name: shopSummary.name,
            itemCount: shopSummary.itemCount,
            totalSpent: shopSummary.totalSpent,
          })
          .from(shopSummary)
          .orderBy(...getSectionOrderBy(shopSummary, sort, order))
          .limit(limit)
          .offset(offset),
        db
          .select({
            totalCount: count().as("totalCount"),
            totalItemCount: sql<number>`COALESCE(SUM(${shopSummary.itemCount}), 0)`.as(
              "totalItemCount",
            ),
            totalSpent: sql<number>`COALESCE(SUM(${shopSummary.totalSpent}), 0)`.as("totalSpent"),
          })
          .from(shopSummary),
      ]);

      const totals = totalsRows[0];
      rows = shopRows;
      totalCount = totals?.totalCount ?? 0;
      totalItemCount = totals?.totalItemCount ?? 0;
      totalSpent = totals?.totalSpent ?? 0;
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

      const [scaleRows, totalsRows] = await Promise.all([
        db
          .select({
            id: scaleSummary.id,
            name: scaleSummary.name,
            itemCount: scaleSummary.itemCount,
            totalSpent: scaleSummary.totalSpent,
          })
          .from(scaleSummary)
          .orderBy(...getSectionOrderBy(scaleSummary, sort, order))
          .limit(limit)
          .offset(offset),
        db
          .select({
            totalCount: count().as("totalCount"),
            totalItemCount: sql<number>`COALESCE(SUM(${scaleSummary.itemCount}), 0)`.as(
              "totalItemCount",
            ),
            totalSpent: sql<number>`COALESCE(SUM(${scaleSummary.totalSpent}), 0)`.as("totalSpent"),
          })
          .from(scaleSummary),
      ]);

      const totals = totalsRows[0];
      rows = scaleRows;
      totalCount = totals?.totalCount ?? 0;
      totalItemCount = totals?.totalItemCount ?? 0;
      totalSpent = totals?.totalSpent ?? 0;
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

      const [entryRows, countRows, totalsRows] = await Promise.all([
        db
          .select({
            id: entrySummary.id,
            name: entrySummary.name,
            itemCount: entrySummary.itemCount,
            totalSpent: entrySummary.totalSpent,
          })
          .from(entrySummary)
          .orderBy(...getSectionOrderBy(entrySummary, sort, order))
          .limit(limit)
          .offset(offset),
        db.select({ totalCount: count().as("totalCount") }).from(entrySummary),
        db
          .select({
            totalItemCount: count().as("totalItemCount"),
            totalSpent: sql<number>`COALESCE(SUM(${matchedCollections.price}), 0)`.as("totalSpent"),
          })
          .from(matchedCollections),
      ]);

      rows = entryRows;
      totalCount = countRows[0]?.totalCount ?? 0;
      totalItemCount = totalsRows[0]?.totalItemCount ?? 0;
      totalSpent = totalsRows[0]?.totalSpent ?? 0;
    }

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
    const sourceFilter = getSectionCollectionFilter(section, match);

    const matchedItems = db
      .select({
        id: item.id,
        externalId: item.externalId,
        title: item.title,
        image: item.image,
      })
      .from(collection)
      .innerJoin(item, eq(collection.itemId, item.id))
      .where(and(eq(collection.userId, userId), eq(collection.status, "Owned"), sourceFilter))
      .as("analytics_section_items");

    const rows = await db
      .select({
        id: matchedItems.id,
        externalId: matchedItems.externalId,
        title: matchedItems.title,
        image: matchedItems.image,
        totalCount: sql<number>`(COUNT(*) OVER ())::integer`.as("totalCount"),
      })
      .from(matchedItems)
      .orderBy(asc(sql`LOWER(${matchedItems.title})`), asc(matchedItems.id))
      .limit(limit)
      .offset(offset);

    return {
      items: rows.map(({ id, externalId, title, image }) => ({ id, externalId, title, image })),
      totalCount: rows[0]?.totalCount ?? 0,
      limit,
      offset,
    };
  }

  async getSectionRelationships(
    userId: string,
    section: AnalyticsSection,
    match: string,
    relatedSection: AnalyticsSection,
    limit: number,
    offset: number,
  ): Promise<AnalyticsSectionRelationshipsResult> {
    const sourceFilter = getSectionCollectionFilter(section, match);

    const matchedCollections = db
      .select({
        collectionId: sql<string>`${collection.id}`.as("collection_id"),
        itemId: item.id,
        externalId: item.externalId,
        title: item.title,
        image: item.image,
        category: item.category,
        scale: item.scale,
        shop: collection.shop,
      })
      .from(collection)
      .innerJoin(item, eq(collection.itemId, item.id))
      .where(and(eq(collection.userId, userId), eq(collection.status, "Owned"), sourceFilter))
      .as("analytics_relationship_matched_collections");

    type RelationshipRow = Omit<AnalyticsSectionRelationshipValue, "previewItems"> & {
      readonly totalCount: number;
    };

    const relationshipRows: readonly RelationshipRow[] = await (async () => {
      if (relatedSection === "shops") {
        const summary = db
          .select({
            id: sql<string | null>`NULL`.as("id"),
            name: matchedCollections.shop,
            itemCount: countDistinct(matchedCollections.collectionId).as("itemCount"),
          })
          .from(matchedCollections)
          .where(not(eq(matchedCollections.shop, "")))
          .groupBy(matchedCollections.shop)
          .as("analytics_shop_relationship_summary");

        return db
          .select({
            id: summary.id,
            name: summary.name,
            itemCount: summary.itemCount,
            totalCount: sql<number>`(COUNT(*) OVER ())::integer`.as("totalCount"),
          })
          .from(summary)
          .orderBy(desc(summary.itemCount), asc(sql`LOWER(${summary.name})`))
          .limit(limit)
          .offset(offset);
      }

      if (relatedSection === "scales") {
        const summary = db
          .select({
            id: sql<string | null>`NULL`.as("id"),
            name: matchedCollections.scale,
            itemCount: countDistinct(matchedCollections.collectionId).as("itemCount"),
          })
          .from(matchedCollections)
          .where(eq(matchedCollections.category, "Prepainted"))
          .groupBy(matchedCollections.scale)
          .as("analytics_scale_relationship_summary");

        return db
          .select({
            id: summary.id,
            name: summary.name,
            itemCount: summary.itemCount,
            totalCount: sql<number>`(COUNT(*) OVER ())::integer`.as("totalCount"),
          })
          .from(summary)
          .orderBy(desc(summary.itemCount), asc(sql`LOWER(${summary.name})`))
          .limit(limit)
          .offset(offset);
      }

      const summary = db
        .select({
          id: entry.id,
          name: entry.name,
          itemCount: countDistinct(matchedCollections.collectionId).as("itemCount"),
        })
        .from(matchedCollections)
        .innerJoin(entry_to_item, eq(matchedCollections.itemId, entry_to_item.itemId))
        .innerJoin(entry, eq(entry_to_item.entryId, entry.id))
        .where(eq(entry.category, entryCategoryBySection[relatedSection]))
        .groupBy(entry.id, entry.name)
        .as("analytics_entry_relationship_summary");

      return db
        .select({
          id: summary.id,
          name: summary.name,
          itemCount: summary.itemCount,
          totalCount: sql<number>`(COUNT(*) OVER ())::integer`.as("totalCount"),
        })
        .from(summary)
        .orderBy(desc(summary.itemCount), asc(sql`LOWER(${summary.name})`), asc(summary.id))
        .limit(limit)
        .offset(offset);
    })();

    const previewItemsByRelationship = new Map<string, AnalyticsSectionRelationshipPreviewItem[]>();
    const addPreviewItem = (
      key: string,
      previewItem: AnalyticsSectionRelationshipPreviewItem,
    ): void => {
      const previewItems = previewItemsByRelationship.get(key) ?? [];
      previewItems.push(previewItem);
      previewItemsByRelationship.set(key, previewItems);
    };

    if (relationshipRows.length > 0) {
      if (relatedSection === "shops" || relatedSection === "scales") {
        const relationshipNames = relationshipRows.map((row) => row.name);
        const candidates = db
          .selectDistinct({
            relationshipName:
              relatedSection === "shops" ? matchedCollections.shop : matchedCollections.scale,
            id: matchedCollections.itemId,
            externalId: matchedCollections.externalId,
            title: matchedCollections.title,
            image: matchedCollections.image,
          })
          .from(matchedCollections)
          .where(
            and(
              relatedSection === "scales"
                ? eq(matchedCollections.category, "Prepainted")
                : undefined,
              relatedSection === "shops"
                ? inArray(matchedCollections.shop, relationshipNames)
                : inArray(matchedCollections.scale, relationshipNames),
              isNotNull(matchedCollections.image),
            ),
          )
          .as("analytics_scalar_relationship_preview_candidates");

        const ranked = db
          .select({
            relationshipName: candidates.relationshipName,
            id: candidates.id,
            externalId: candidates.externalId,
            title: candidates.title,
            image: candidates.image,
            rank: sql<number>`(ROW_NUMBER() OVER (
              PARTITION BY ${candidates.relationshipName}
              ORDER BY LOWER(${candidates.title}), ${candidates.id}
            ))::integer`.as("rank"),
          })
          .from(candidates)
          .as("analytics_ranked_scalar_relationship_previews");

        const previewRows = await db
          .select()
          .from(ranked)
          .where(lte(ranked.rank, RELATIONSHIP_PREVIEW_LIMIT))
          .orderBy(asc(ranked.relationshipName), asc(ranked.rank));

        for (const row of previewRows) {
          if (row.image === null) continue;
          addPreviewItem(row.relationshipName, {
            id: row.id,
            externalId: row.externalId,
            title: row.title,
            image: row.image,
          });
        }
      } else {
        const relationshipIds = relationshipRows.flatMap((row) => (row.id ? [row.id] : []));
        const candidates = db
          .selectDistinct({
            relationshipId: entry_to_item.entryId,
            id: matchedCollections.itemId,
            externalId: matchedCollections.externalId,
            title: matchedCollections.title,
            image: matchedCollections.image,
          })
          .from(matchedCollections)
          .innerJoin(entry_to_item, eq(matchedCollections.itemId, entry_to_item.itemId))
          .where(
            and(
              inArray(entry_to_item.entryId, relationshipIds),
              isNotNull(matchedCollections.image),
            ),
          )
          .as("analytics_entry_relationship_preview_candidates");

        const ranked = db
          .select({
            relationshipId: candidates.relationshipId,
            id: candidates.id,
            externalId: candidates.externalId,
            title: candidates.title,
            image: candidates.image,
            rank: sql<number>`(ROW_NUMBER() OVER (
              PARTITION BY ${candidates.relationshipId}
              ORDER BY LOWER(${candidates.title}), ${candidates.id}
            ))::integer`.as("rank"),
          })
          .from(candidates)
          .as("analytics_ranked_entry_relationship_previews");

        const previewRows = await db
          .select()
          .from(ranked)
          .where(lte(ranked.rank, RELATIONSHIP_PREVIEW_LIMIT))
          .orderBy(asc(ranked.relationshipId), asc(ranked.rank));

        for (const row of previewRows) {
          if (row.image === null) continue;
          addPreviewItem(row.relationshipId, {
            id: row.id,
            externalId: row.externalId,
            title: row.title,
            image: row.image,
          });
        }
      }
    }

    return {
      section: relatedSection,
      values: relationshipRows.map(({ id, name, itemCount }) => ({
        id,
        name,
        itemCount,
        previewItems: previewItemsByRelationship.get(id ?? name) ?? [],
      })),
      totalCount: relationshipRows[0]?.totalCount ?? 0,
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
