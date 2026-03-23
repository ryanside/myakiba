import { db } from "@myakiba/db/client";
import { collection, entry, item, item_release, order } from "@myakiba/db/schema/figure";
import { and, asc, desc, eq, ilike, sql } from "drizzle-orm";
import type { ItemReleasesResponse } from "@myakiba/contracts/items/schema";
import {
  SEARCH_COLLECTION_RESULT_LIMIT,
  SEARCH_ORDER_RESULT_LIMIT,
  type SearchCollectionResult,
  type SearchData,
  type SearchEntryResult,
  type SearchOrderIdAndTitle,
} from "./model";

const latestOwnedAt = sql<Date>`max(${collection.createdAt})`;

const collectionResultsPrepared = db
  .select({
    itemId: item.id,
    itemExternalId: item.externalId,
    itemTitle: item.title,
    itemImage: item.image,
    itemCategory: item.category,
    latestOwnedAt,
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

function toSearchCollectionResults(
  rows: readonly (SearchCollectionResult & { readonly latestOwnedAt: Date })[],
): readonly SearchCollectionResult[] {
  return rows.map((row) => ({
    itemId: row.itemId,
    itemExternalId: row.itemExternalId,
    itemTitle: row.itemTitle,
    itemImage: row.itemImage,
    itemCategory: row.itemCategory,
  }));
}

class SearchService {
  async getSearchResults(search: string, userId: string): Promise<SearchData> {
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
      collectionResults: toSearchCollectionResults(collectionRows),
      orderResults: orderRows,
    };
  }

  async getReleases(itemId: string): Promise<ItemReleasesResponse> {
    const releases = await db
      .select({
        id: item_release.id,
        itemId: item_release.itemId,
        date: item_release.date,
        type: item_release.type,
        price: item_release.price,
        priceCurrency: item_release.priceCurrency,
        barcode: item_release.barcode,
      })
      .from(item_release)
      .where(eq(item_release.itemId, itemId))
      .orderBy(item_release.date);

    return { releases };
  }

  async getEntries(
    search: string,
    limit?: number,
    offset?: number,
  ): Promise<readonly SearchEntryResult[]> {
    const query = db
      .select({
        id: entry.id,
        name: entry.name,
        category: entry.category,
      })
      .from(entry)
      .where(ilike(entry.name, `%${search}%`))
      .orderBy(asc(entry.name), asc(entry.id));

    const paginatedQuery = typeof limit === "number" ? query.limit(limit) : query;
    return typeof offset === "number" ? paginatedQuery.offset(offset) : paginatedQuery;
  }

  async getOrderIdsAndTitles(
    userId: string,
    title?: string,
    limit?: number,
    offset?: number,
  ): Promise<readonly SearchOrderIdAndTitle[]> {
    const query = db
      .select({ id: order.id, title: order.title })
      .from(order)
      .where(and(eq(order.userId, userId), title ? ilike(order.title, `%${title}%`) : undefined))
      .orderBy(desc(order.createdAt), desc(order.id));

    const paginatedQuery = typeof limit === "number" ? query.limit(limit) : query;
    return typeof offset === "number" ? paginatedQuery.offset(offset) : paginatedQuery;
  }
}

export default new SearchService();
