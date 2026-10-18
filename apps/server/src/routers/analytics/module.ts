import { collection, item, entry, entry_to_item } from "@myakiba/db/schema/figure";
import type { ReadTx } from "@myakiba/db/tx";
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
  AnalyticsSectionSort,
  AnalyticsSectionSortOrder,
} from "@myakiba/contracts/analytics/schema";
import type { Page } from "@myakiba/contracts/shared/pagination";
import { fail, ok, paginateBy, prepared, query } from "@/domain/kernel";
import type {
  AnalyticsResult,
  AnalyticsSectionItemsResult,
  AnalyticsSectionKpis,
  AnalyticsSectionRow,
  AnalyticsSectionRelationshipPreviewItem,
  AnalyticsSectionRelationshipValue,
  AnalyticsSectionRelationshipsResult,
  AnalyticsSectionResult,
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

function getSectionCollectionFilter(tx: ReadTx, section: AnalyticsSection, match: string) {
  if (section === "shops") {
    return eq(collection.shop, match);
  }

  if (section === "scales") {
    return and(eq(item.category, "Prepainted"), eq(item.scale, match));
  }

  const sourceItemIds = tx
    .select({ itemId: entry_to_item.itemId })
    .from(entry_to_item)
    .innerJoin(entry, eq(entry_to_item.entryId, entry.id))
    .where(
      and(eq(entry_to_item.entryId, match), eq(entry.category, entryCategoryBySection[section])),
    );

  return inArray(collection.itemId, sourceItemIds);
}

function entryRankings(tx: ReadTx) {
  const entrySummaryQuery = tx
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

  return tx
    .select({
      entryId: entrySummaryQuery.entryId,
      name: entrySummaryQuery.name,
      category: entrySummaryQuery.category,
      itemCount: entrySummaryQuery.itemCount,
      totalSpent: entrySummaryQuery.totalSpent,
      rankByCount: sql<number>`ROW_NUMBER() OVER (
        PARTITION BY ${entrySummaryQuery.category}
        ORDER BY ${entrySummaryQuery.itemCount} DESC, ${entrySummaryQuery.totalSpent} DESC,
          LOWER(${entrySummaryQuery.name}), ${entrySummaryQuery.name}, ${entrySummaryQuery.entryId}
      )`,
      rankBySpend: sql<number>`ROW_NUMBER() OVER (
        PARTITION BY ${entrySummaryQuery.category}
        ORDER BY ${entrySummaryQuery.totalSpent} DESC, ${entrySummaryQuery.itemCount} DESC,
          LOWER(${entrySummaryQuery.name}), ${entrySummaryQuery.name}, ${entrySummaryQuery.entryId}
      )`,
    })
    .from(entrySummaryQuery);
}

const entryRankingsRead = prepared("analytics_entry_rankings", entryRankings);

function shopRankings(tx: ReadTx) {
  const shopSummaryQuery = tx
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

  return tx
    .select({
      shop: shopSummaryQuery.shop,
      itemCount: shopSummaryQuery.itemCount,
      totalSpent: shopSummaryQuery.totalSpent,
      rankByCount: sql<number>`ROW_NUMBER() OVER (
        ORDER BY ${shopSummaryQuery.itemCount} DESC, ${shopSummaryQuery.totalSpent} DESC,
          LOWER(${shopSummaryQuery.shop}), ${shopSummaryQuery.shop}
      )`,
      rankBySpend: sql<number>`ROW_NUMBER() OVER (
        ORDER BY ${shopSummaryQuery.totalSpent} DESC, ${shopSummaryQuery.itemCount} DESC,
          LOWER(${shopSummaryQuery.shop}), ${shopSummaryQuery.shop}
      )`,
    })
    .from(shopSummaryQuery);
}

const shopRankingsRead = prepared("analytics_shop_rankings", shopRankings);

function scaleRankings(tx: ReadTx) {
  const scaleSummaryQuery = tx
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

  return tx
    .select({
      scale: scaleSummaryQuery.scale,
      itemCount: scaleSummaryQuery.itemCount,
      totalSpent: scaleSummaryQuery.totalSpent,
      rankByCount: sql<number>`ROW_NUMBER() OVER (
        ORDER BY ${scaleSummaryQuery.itemCount} DESC, ${scaleSummaryQuery.totalSpent} DESC,
          LOWER(${scaleSummaryQuery.scale}), ${scaleSummaryQuery.scale}
      )`,
      rankBySpend: sql<number>`ROW_NUMBER() OVER (
        ORDER BY ${scaleSummaryQuery.totalSpent} DESC, ${scaleSummaryQuery.itemCount} DESC,
          LOWER(${scaleSummaryQuery.scale}), ${scaleSummaryQuery.scale}
      )`,
    })
    .from(scaleSummaryQuery);
}

const scaleRankingsRead = prepared("analytics_scale_rankings", scaleRankings);

function rankAnalytics(
  entryRows: Awaited<ReturnType<typeof entryRankings>>,
  shopRows: Awaited<ReturnType<typeof shopRankings>>,
  scaleRows: Awaited<ReturnType<typeof scaleRankings>>,
): AnalyticsResult {
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

async function getSectionAnalytics(
  tx: ReadTx,
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
    const shopSummary = tx
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
      tx
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
      tx
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
    const scaleSummary = tx
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
      tx
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
      tx
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

    const matchedCollections = tx
      .selectDistinct({
        id: collection.id,
        price: collection.price,
      })
      .from(collection)
      .innerJoin(entry_to_item, eq(collection.itemId, entry_to_item.itemId))
      .innerJoin(entry, eq(entry_to_item.entryId, entry.id))
      .where(entryFilters)
      .as("analytics_entry_matched_collections");

    const entrySummary = tx
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
      tx
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
      tx.select({ totalCount: count().as("totalCount") }).from(entrySummary),
      tx
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

async function getSectionItems(
  tx: ReadTx,
  userId: string,
  section: AnalyticsSection,
  match: string,
  limit: number,
  offset: number,
): Promise<AnalyticsSectionItemsResult> {
  const sourceFilter = getSectionCollectionFilter(tx, section, match);

  const matchedItems = tx
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

  const page = await paginateBy(
    { tx },
    { limit, offset },
    {
      rows: tx.select().from(matchedItems).$dynamic(),
      orderBy: [asc(sql`LOWER(${matchedItems.title})`), asc(matchedItems.id)],
    },
  );

  return { ...page, limit, offset };
}

async function getSectionRelationships(
  tx: ReadTx,
  userId: string,
  section: AnalyticsSection,
  match: string,
  relatedSection: AnalyticsSection,
  limit: number,
  offset: number,
): Promise<AnalyticsSectionRelationshipsResult> {
  const sourceFilter = getSectionCollectionFilter(tx, section, match);

  const matchedCollections = tx
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

  const page: Page<Omit<AnalyticsSectionRelationshipValue, "previewItems">> = await (async () => {
    if (relatedSection === "shops") {
      const summary = tx
        .select({
          id: sql<string | null>`NULL`.as("id"),
          name: matchedCollections.shop,
          itemCount: countDistinct(matchedCollections.collectionId).as("itemCount"),
        })
        .from(matchedCollections)
        .where(not(eq(matchedCollections.shop, "")))
        .groupBy(matchedCollections.shop)
        .as("analytics_shop_relationship_summary");

      return paginateBy(
        { tx },
        { limit, offset },
        {
          rows: tx.select().from(summary).$dynamic(),
          orderBy: [desc(summary.itemCount), asc(sql`LOWER(${summary.name})`), asc(summary.name)],
        },
      );
    }

    if (relatedSection === "scales") {
      const summary = tx
        .select({
          id: sql<string | null>`NULL`.as("id"),
          name: matchedCollections.scale,
          itemCount: countDistinct(matchedCollections.collectionId).as("itemCount"),
        })
        .from(matchedCollections)
        .where(eq(matchedCollections.category, "Prepainted"))
        .groupBy(matchedCollections.scale)
        .as("analytics_scale_relationship_summary");

      return paginateBy(
        { tx },
        { limit, offset },
        {
          rows: tx.select().from(summary).$dynamic(),
          orderBy: [desc(summary.itemCount), asc(sql`LOWER(${summary.name})`), asc(summary.name)],
        },
      );
    }

    const summary = tx
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

    return paginateBy(
      { tx },
      { limit, offset },
      {
        rows: tx.select().from(summary).$dynamic(),
        orderBy: [
          desc(summary.itemCount),
          asc(sql`LOWER(${summary.name})`),
          asc(summary.name),
          asc(summary.id),
        ],
      },
    );
  })();
  const relationshipRows = page.items;

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
      const candidates = tx
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
            relatedSection === "scales" ? eq(matchedCollections.category, "Prepainted") : undefined,
            relatedSection === "shops"
              ? inArray(matchedCollections.shop, relationshipNames)
              : inArray(matchedCollections.scale, relationshipNames),
            isNotNull(matchedCollections.image),
          ),
        )
        .as("analytics_scalar_relationship_preview_candidates");

      const ranked = tx
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

      const previewRows = await tx
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
      const candidates = tx
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
          and(inArray(entry_to_item.entryId, relationshipIds), isNotNull(matchedCollections.image)),
        )
        .as("analytics_entry_relationship_preview_candidates");

      const ranked = tx
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

      const previewRows = await tx
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
    items: relationshipRows.map(({ id, name, itemCount }) => ({
      id,
      name,
      itemCount,
      previewItems: previewItemsByRelationship.get(id ?? name) ?? [],
    })),
    totalCount: page.totalCount,
    limit,
    offset,
  };
}

type SectionInput = { readonly sectionName: AnalyticsSection };

export const Analytics = {
  overview: query(
    { action: "analytics.overview", failure: "Failed to get analytics" },
    async (scope) => {
      const userId = scope.viewer.userId;
      const [entryRows, shopRows, scaleRows] = await Promise.all([
        scope.read(entryRankingsRead, { userId }),
        scope.read(shopRankingsRead, { userId }),
        scope.read(scaleRankingsRead, { userId }),
      ]);
      const analytics = rankAnalytics(entryRows, shopRows, scaleRows);
      return ok({ analytics });
    },
  ),

  section: query(
    { action: "analytics.section", failure: "Failed to get analytics section" },
    async (
      scope,
      input: SectionInput & {
        readonly limit: number;
        readonly offset: number;
        readonly search?: string;
        readonly sort?: AnalyticsSectionSort;
        readonly order?: AnalyticsSectionSortOrder;
      },
    ) => {
      scope.log.set({ analytics: { section: input.sectionName } });
      const analytics = await getSectionAnalytics(
        scope.tx,
        scope.viewer.userId,
        input.sectionName,
        input.limit,
        input.offset,
        input.search,
        input.sort,
        input.order,
      );
      scope.log.set({
        analytics: {
          section: input.sectionName,
          resultCount: analytics.rows.length,
          totalCount: analytics.totalCount,
        },
      });
      return ok({ analytics });
    },
  ),

  sectionItems: query(
    { action: "analytics.section_items", failure: "Failed to get analytics section items" },
    async (
      scope,
      input: SectionInput & {
        readonly match: string;
        readonly limit: number;
        readonly offset: number;
      },
    ) => {
      scope.log.set({ analytics: { section: input.sectionName, match: input.match } });
      const items = await getSectionItems(
        scope.tx,
        scope.viewer.userId,
        input.sectionName,
        input.match,
        input.limit,
        input.offset,
      );
      scope.log.set({
        analytics: {
          section: input.sectionName,
          match: input.match,
          resultCount: items.items.length,
          totalCount: items.totalCount,
        },
      });
      return ok(items);
    },
  ),

  sectionRelationships: query(
    {
      action: "analytics.section_relationships",
      failure: "Failed to get analytics section relationships",
    },
    async (
      scope,
      input: SectionInput & {
        readonly match: string;
        readonly relatedSection: AnalyticsSection;
        readonly limit: number;
        readonly offset: number;
      },
    ) => {
      if (input.sectionName === input.relatedSection) {
        return fail("bad_request", "Related section must differ from source section");
      }

      const analytics = {
        section: input.sectionName,
        relatedSection: input.relatedSection,
        match: input.match,
      };
      scope.log.set({ analytics });
      const relationships = await getSectionRelationships(
        scope.tx,
        scope.viewer.userId,
        input.sectionName,
        input.match,
        input.relatedSection,
        input.limit,
        input.offset,
      );
      scope.log.set({
        analytics: {
          ...analytics,
          resultCount: relationships.items.length,
          totalCount: relationships.totalCount,
        },
      });
      return ok(relationships);
    },
  ),
};
