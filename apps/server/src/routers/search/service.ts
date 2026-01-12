import { db } from "@myakiba/db";
import { collection, item, order } from "@myakiba/db/schema/figure";
import { eq, sql, and, ilike } from "drizzle-orm";

class SearchService {
  private collectionResultsPrepared;
  private orderResultsPrepared;

  constructor() {
    // Collection Results
    this.collectionResultsPrepared = db
      .select({
        collectionId: collection.id,
        itemId: item.id,
        itemTitle: item.title,
        itemImage: item.image,
        itemCategory: item.category,
      })
      .from(collection)
      .innerJoin(item, eq(collection.itemId, item.id))
      .where(
        and(
          ilike(item.title, sql.placeholder("search")),
          eq(collection.status, "Owned"),
          eq(collection.userId, sql.placeholder("userId"))
        )
      )
      .prepare("search_collection");

    // Order Results
    this.orderResultsPrepared = db
      .select({
        orderId: order.id,
        orderTitle: order.title,
        orderStatus: order.status,
        orderShop: order.shop,
        orderReleaseMonthYear: order.releaseMonthYear,
        itemImages: sql<string[]>`COALESCE(
            (
              SELECT array_agg(DISTINCT img)
              FROM (
                SELECT i.image as img
                FROM collection c
                INNER JOIN item i ON c.item_id = i.id
                WHERE c.order_id = "order".id
                  AND i.image IS NOT NULL
                LIMIT 4
              ) subq
            ),
            ARRAY[]::text[]
          )`,
      })
      .from(order)
      .innerJoin(collection, eq(order.id, collection.orderId))
      .where(
        and(
          ilike(order.title, sql.placeholder("search")),
          eq(collection.userId, sql.placeholder("userId"))
        )
      )
      .groupBy(order.id)
      .prepare("search_orders");
  }

  async getSearchResults(search: string, userId: string) {
    const [collectionResults, orderResults] = await Promise.all([
      this.collectionResultsPrepared.execute({
        search: `%${search}%`,
        userId,
      }),
      this.orderResultsPrepared.execute({
        search: `%${search}%`,
        userId,
      }),
    ]);
    return { collectionResults, orderResults };
  }
}

export default new SearchService();
