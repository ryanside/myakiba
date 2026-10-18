import { and, asc, desc, eq, exists, ilike, isNotNull, or, sql } from "drizzle-orm";
import {
  collection,
  entry,
  entry_to_item,
  item,
  item_release,
  order,
} from "@myakiba/db/schema/figure";
import type {
  ItemDatabaseSearch,
  ItemDatabaseSearchResponse,
  SearchCommandData,
  SearchEntriesQuery,
  SearchEntryResult,
  SearchOrderIdAndTitle,
  SearchOrdersQuery,
} from "@myakiba/contracts/search/schema";
import { DEFAULT_LIMIT } from "@myakiba/contracts/shared/constants";
import { orderPreviewImagesSql } from "@/lib/order-preview";
import { ok, paginateBy, prepared, query } from "@/domain/kernel";
import { SEARCH_COLLECTION_RESULT_LIMIT, SEARCH_ORDER_RESULT_LIMIT } from "./model";

const latestOwnedAt = sql<Date>`max(${collection.createdAt})`;

const collectionResultsRead = prepared("search_collection", (pool) =>
  pool
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
    .orderBy(desc(latestOwnedAt), desc(item.id))
    .limit(SEARCH_COLLECTION_RESULT_LIMIT),
);

const orderResultsRead = prepared("search_orders", (pool) =>
  pool
    .select({
      orderId: order.id,
      orderTitle: order.title,
      itemImages: sql<string[]>`(${orderPreviewImagesSql})[1:4]`,
    })
    .from(order)
    .where(
      and(
        ilike(order.title, sql.placeholder("search")),
        eq(order.userId, sql.placeholder("userId")),
      ),
    )
    .orderBy(desc(order.createdAt), desc(order.id))
    .limit(SEARCH_ORDER_RESULT_LIMIT),
);

export const Search = {
  command: query(
    { action: "search.command", failure: "Failed to search" },
    async (scope, input: { readonly search: string }) => {
      scope.log.set({ search: { query: input.search } });
      const values = { search: `%${input.search}%`, userId: scope.viewer.userId };
      const [collectionResults, orderResults] = await Promise.all([
        scope.read(collectionResultsRead, values),
        scope.read(orderResultsRead, values),
      ]);

      const searchData: SearchCommandData = { collectionResults, orderResults };
      const result = { searchData };
      scope.log.set({
        search: {
          resultCount: collectionResults.length + orderResults.length,
          collectionCount: collectionResults.length,
          orderCount: orderResults.length,
        },
      });
      return ok(result);
    },
  ),

  items: query(
    { action: "search.items", failure: "Failed to search item database" },
    async (scope, input: ItemDatabaseSearch) => {
      scope.log.set({
        query: { search: input.query, page: input.page, pageSize: input.pageSize },
      });
      const normalizedSearch = input.query?.trim();
      const offset = (input.page - 1) * input.pageSize;

      const latestRelease = scope.tx
        .select({
          date: item_release.date,
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
            scope.tx
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
            scope.tx
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
      const rows = scope.tx
        .select({
          itemId: item.id,
          externalId: sql<number>`${item.externalId}`.as("externalId"),
          title: item.title,
          image: item.image,
          category: item.category,
          releaseDate: latestRelease.date,
          releasePrice: latestRelease.price,
          releasePriceCurrency: latestRelease.priceCurrency,
        })
        .from(item)
        .leftJoinLateral(latestRelease, sql`TRUE`)
        .where(and(eq(item.source, "mfc"), isNotNull(item.externalId), searchFilter))
        .$dynamic();
      const page = await paginateBy(
        scope,
        { limit: input.pageSize, offset },
        {
          rows,
          orderBy: [
            ...(normalizedSearch ? [asc(relevance), desc(titleSimilarity)] : []),
            desc(item.createdAt),
            desc(item.id),
          ],
        },
      );

      const result: ItemDatabaseSearchResponse = {
        items: page.items.map((row) => ({
          itemId: row.itemId,
          externalId: row.externalId,
          title: row.title,
          image: row.image,
          category: row.category,
          latestRelease: row.releaseDate
            ? {
                date: row.releaseDate,
                price: row.releasePrice,
                priceCurrency: row.releasePriceCurrency,
              }
            : null,
        })),
        totalCount: page.totalCount,
      };
      scope.log.set({ result: { count: result.items.length, totalCount: result.totalCount } });
      return ok(result);
    },
  ),

  entries: query(
    { action: "search.entries", failure: "Failed to search entries" },
    async (scope, input: SearchEntriesQuery) => {
      const { search, limit = DEFAULT_LIMIT, offset = 0 } = input;
      scope.log.set({ query: { search: input.search, limit: input.limit, offset: input.offset } });
      const entries: SearchEntryResult[] = await scope.tx
        .select({
          id: entry.id,
          name: entry.name,
          category: entry.category,
        })
        .from(entry)
        .where(and(eq(entry.source, "mfc"), ilike(entry.name, `%${search}%`)))
        .orderBy(asc(entry.name), asc(entry.id))
        .limit(limit)
        .offset(offset);

      scope.log.set({ result: { count: entries.length } });
      const result = { entries };
      return ok(result);
    },
  ),

  orders: query(
    { action: "search.orders", failure: "Failed to search orders" },
    async (scope, input: SearchOrdersQuery) => {
      const { title, limit = DEFAULT_LIMIT, offset = 0 } = input;
      scope.log.set({ query: { title: input.title, limit: input.limit, offset: input.offset } });
      const orderIdsAndTitles: SearchOrderIdAndTitle[] = await scope.tx
        .select({ id: order.id, title: order.title })
        .from(order)
        .where(
          and(
            eq(order.userId, scope.viewer.userId),
            title ? ilike(order.title, `%${title}%`) : undefined,
          ),
        )
        .orderBy(desc(order.createdAt), desc(order.id))
        .limit(limit)
        .offset(offset);

      const result = { orderIdsAndTitles };
      return ok(result);
    },
  ),
};
