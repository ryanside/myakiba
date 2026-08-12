import { db } from "@myakiba/db/client";
import {
  collection,
  entry,
  entry_to_item,
  item,
  item_release,
  order,
} from "@myakiba/db/schema/figure";
import { and, asc, desc, eq, exists, ilike, isNotNull, or, sql } from "drizzle-orm";
import type {
  CatalogItemsSearchResponse,
  SearchCommandData,
  SearchEntryResult,
  SearchOrderIdAndTitle,
} from "@myakiba/contracts/search/schema";
import { DEFAULT_LIMIT } from "@myakiba/contracts/shared/constants";
import { SEARCH_COLLECTION_RESULT_LIMIT, SEARCH_ORDER_RESULT_LIMIT } from "./model";

const latestOwnedAt = sql<Date>`max(${collection.createdAt})`;

const collectionResultsPrepared = db
  .select({
    itemId: item.id,
    itemExternalId: item.externalId,
    itemTitle: item.title,
    itemImage: item.image,
    itemCategory: item.category,
  })
  .from(collection)
  .innerJoin(item, eq(collection.itemId, item.id))
  .where(
    and(
      ilike(item.title, sql.placeholder("search")),
      eq(collection.userId, sql.placeholder("userId")),
    ),
  )
  .groupBy(item.id, item.externalId, item.title, item.image, item.category)
  .orderBy(desc(latestOwnedAt))
  .limit(SEARCH_COLLECTION_RESULT_LIMIT)
  .prepare("search_collection");

const orderResultsPrepared = db
  .select({
    orderId: order.id,
    orderTitle: order.title,
    itemImages: sql<string[]>`COALESCE(
      (
        SELECT array_agg(image_row.image)
        FROM (
          SELECT DISTINCT i.image
          FROM "collection" c
          INNER JOIN item i ON c.item_id = i.id
          WHERE c.order_id = "order".id
            AND i.image IS NOT NULL
          LIMIT 4
        ) AS image_row
      ),
      ARRAY[]::text[]
    )`,
  })
  .from(order)
  .where(
    and(ilike(order.title, sql.placeholder("search")), eq(order.userId, sql.placeholder("userId"))),
  )
  .orderBy(desc(order.createdAt))
  .limit(SEARCH_ORDER_RESULT_LIMIT)
  .prepare("search_orders");

class SearchService {
  async getCommandResults(search: string, userId: string): Promise<SearchCommandData> {
    const [collectionRows, orderRows] = await Promise.all([
      collectionResultsPrepared.execute({
        search: `%${search}%`,
        userId,
      }),
      orderResultsPrepared.execute({
        search: `%${search}%`,
        userId,
      }),
    ]);

    return {
      collectionResults: collectionRows,
      orderResults: orderRows,
    };
  }

  async getCatalogItems(
    search: string | undefined,
    page: number,
    pageSize: number,
  ): Promise<CatalogItemsSearchResponse> {
    const normalizedSearch = search?.trim();
    const offset = (page - 1) * pageSize;

    const latestRelease = db
      .select({
        date: item_release.date,
        type: item_release.type,
        price: item_release.price,
        priceCurrency: item_release.priceCurrency,
      })
      .from(item_release)
      .where(eq(item_release.itemId, item.id))
      .orderBy(desc(item_release.date), desc(item_release.createdAt), desc(item_release.id))
      .limit(1)
      .as("latest_release");

    const parsedExternalId =
      normalizedSearch && /^\d+$/.test(normalizedSearch) ? Number(normalizedSearch) : undefined;
    const exactExternalIdMatch =
      parsedExternalId !== undefined && Number.isSafeInteger(parsedExternalId)
        ? eq(item.externalId, parsedExternalId)
        : sql`FALSE`;
    const externalIdPrefixMatch = normalizedSearch
      ? sql`${item.externalId}::text LIKE ${`${normalizedSearch}%`}`
      : sql`FALSE`;
    const titleExactMatch = normalizedSearch
      ? sql`LOWER(${item.title}) = LOWER(${normalizedSearch})`
      : sql`FALSE`;
    const titleSubstringMatch = normalizedSearch
      ? ilike(item.title, `%${normalizedSearch}%`)
      : sql`FALSE`;
    const titleFuzzyMatch = normalizedSearch
      ? sql`${item.title} % ${normalizedSearch}`
      : sql`FALSE`;

    const entrySubstringMatch = normalizedSearch
      ? exists(
          db
            .select({ entryId: entry_to_item.entryId })
            .from(entry_to_item)
            .innerJoin(entry, eq(entry_to_item.entryId, entry.id))
            .where(
              and(
                eq(entry_to_item.itemId, item.id),
                eq(entry.source, "mfc"),
                ilike(entry.name, `%${normalizedSearch}%`),
              ),
            ),
        )
      : sql`FALSE`;
    const entryFuzzyMatch = normalizedSearch
      ? exists(
          db
            .select({ entryId: entry_to_item.entryId })
            .from(entry_to_item)
            .innerJoin(entry, eq(entry_to_item.entryId, entry.id))
            .where(
              and(
                eq(entry_to_item.itemId, item.id),
                eq(entry.source, "mfc"),
                sql`${entry.name} % ${normalizedSearch}`,
              ),
            ),
        )
      : sql`FALSE`;

    const searchFilter = normalizedSearch
      ? or(
          exactExternalIdMatch,
          externalIdPrefixMatch,
          titleExactMatch,
          titleSubstringMatch,
          titleFuzzyMatch,
          entrySubstringMatch,
          entryFuzzyMatch,
        )
      : undefined;
    const relevance = sql<number>`CASE
      WHEN ${exactExternalIdMatch} THEN 0
      WHEN ${externalIdPrefixMatch} THEN 1
      WHEN ${titleExactMatch} THEN 2
      WHEN ${titleSubstringMatch} THEN 3
      WHEN ${titleFuzzyMatch} THEN 4
      WHEN ${entrySubstringMatch} THEN 5
      WHEN ${entryFuzzyMatch} THEN 6
      ELSE 7
    END`;
    const titleSimilarity = normalizedSearch
      ? sql<number>`GREATEST(
          SIMILARITY(${item.title}, ${normalizedSearch}),
          WORD_SIMILARITY(${normalizedSearch}, ${item.title})
        )`
      : sql<number>`0`;

    const rows = await db
      .select({
        itemId: item.id,
        externalId: sql<number>`${item.externalId}`.as("externalId"),
        title: item.title,
        image: item.image,
        category: item.category,
        releaseDate: latestRelease.date,
        releaseType: latestRelease.type,
        releasePrice: latestRelease.price,
        releasePriceCurrency: latestRelease.priceCurrency,
        totalCount: sql<number>`COUNT(*) OVER()::integer`.as("totalCount"),
      })
      .from(item)
      .leftJoinLateral(latestRelease, sql`TRUE`)
      .where(and(eq(item.source, "mfc"), isNotNull(item.externalId), searchFilter))
      .orderBy(
        ...(normalizedSearch ? [asc(relevance), desc(titleSimilarity)] : []),
        desc(item.createdAt),
        desc(item.id),
      )
      .limit(pageSize)
      .offset(offset);

    return {
      items: rows.map((row) => ({
        itemId: row.itemId,
        externalId: row.externalId,
        title: row.title,
        image: row.image,
        category: row.category,
        latestRelease: row.releaseDate
          ? {
              date: row.releaseDate,
              type: row.releaseType,
              price: row.releasePrice,
              priceCurrency: row.releasePriceCurrency,
            }
          : null,
      })),
      totalCount: rows[0]?.totalCount ?? 0,
      page,
      pageSize,
    };
  }

  async getEntries(
    search: string,
    limit = DEFAULT_LIMIT,
    offset = 0,
  ): Promise<SearchEntryResult[]> {
    const query = db
      .select({
        id: entry.id,
        name: entry.name,
        category: entry.category,
      })
      .from(entry)
      .where(and(eq(entry.source, "mfc"), ilike(entry.name, `%${search}%`)))
      .orderBy(asc(entry.name), asc(entry.id));

    return query.limit(limit).offset(offset);
  }

  async getOrderIdsAndTitles(
    userId: string,
    title: string | undefined,
    limit = DEFAULT_LIMIT,
    offset = 0,
  ): Promise<SearchOrderIdAndTitle[]> {
    const query = db
      .select({ id: order.id, title: order.title })
      .from(order)
      .where(and(eq(order.userId, userId), title ? ilike(order.title, `%${title}%`) : undefined))
      .orderBy(desc(order.createdAt), desc(order.id));

    return query.limit(limit).offset(offset);
  }
}

export default new SearchService();
