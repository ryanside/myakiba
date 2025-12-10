import { dbHttp } from "@myakiba/db";
import { collection, item } from "@myakiba/db/schema/figure";
import { eq, count, and, sql, desc, not } from "drizzle-orm";
import { entry, entry_to_item } from "@myakiba/db/schema/figure";

class AnalyticsService {
  async getAnalytics(userId: string) {
    const getPriceRangeDistribution = dbHttp
      .select({
        priceRange: sql<string>`
          CASE 
            WHEN ${collection.price}::numeric < 50 THEN '< $50'
            WHEN ${collection.price}::numeric < 100 THEN '$50-$100'
            WHEN ${collection.price}::numeric < 200 THEN '$100-$200'
            WHEN ${collection.price}::numeric < 500 THEN '$200-$500'
            ELSE '> $500'
          END
        `,
        count: count(),
        totalValue: sql<string>`SUM(${collection.price}::numeric)`,
      })
      .from(collection)
      .where(and(eq(collection.userId, userId), eq(collection.status, "Owned")))
      .groupBy(
        sql`
        CASE 
          WHEN ${collection.price}::numeric < 50 THEN '< $50'
          WHEN ${collection.price}::numeric < 100 THEN '$50-$100'
          WHEN ${collection.price}::numeric < 200 THEN '$100-$200'
          WHEN ${collection.price}::numeric < 500 THEN '$200-$500'
          ELSE '> $500'
        END
      `
      )
      .orderBy(sql`MIN(${collection.price}::numeric)`);

    const getScaleDistribution = dbHttp
      .select({
        scale: item.scale,
        count: count(),
        totalValue: sql<string>`SUM(${collection.price}::numeric)`,
      })
      .from(collection)
      .innerJoin(item, eq(collection.itemId, item.id))
      .where(
        and(
          eq(collection.userId, userId),
          eq(collection.status, "Owned"),
          eq(item.category, "Prepainted")
        )
      )
      .groupBy(item.scale)
      .orderBy(sql`COUNT(*) DESC`)
      .limit(10);

    const getMostExpensiveCollectionItems = dbHttp
      .select({
        itemId: item.id,
        itemTitle: item.title,
        itemImage: item.image,
        itemCategory: item.category,
        collectionPrice: collection.price,
      })
      .from(collection)
      .innerJoin(item, eq(collection.itemId, item.id))
      .where(and(eq(collection.userId, userId), eq(collection.status, "Owned")))
      .orderBy(desc(collection.price))
      .limit(10);

    const getTopShops = dbHttp
      .select({
        shop: collection.shop,
        count: count(),
        totalSpent: sql<string>`SUM(${collection.price}::numeric)`,
      })
      .from(collection)
      .where(and(eq(collection.userId, userId), not(eq(collection.shop, ""))))
      .groupBy(collection.shop)
      .orderBy(
        desc(count()),
        desc(sql<string>`SUM(${collection.price}::numeric)`)
      )
      .limit(10);

    const getTotalOwned = dbHttp
      .select({
        count: count(),
      })
      .from(collection)
      .where(
        and(eq(collection.userId, userId), eq(collection.status, "Owned"))
      );

    const allCategories = [
      "Characters",
      "Origins",
      "Companies",
      "Artists",
      "Materials",
      "Classifications",
      "Event",
    ];

    const topEntriesByCategoryQueries = allCategories.map((category) =>
      dbHttp
        .select({
          entryId: entry.id,
          originName: entry.name,
          itemCount: count(),
          totalValue: sql<string>`SUM(${collection.price}::numeric)`,
          category: sql<string>`${category}`,
        })
        .from(collection)
        .innerJoin(entry_to_item, eq(collection.itemId, entry_to_item.itemId))
        .innerJoin(entry, eq(entry_to_item.entryId, entry.id))
        .where(
          and(
            eq(collection.userId, userId),
            eq(collection.status, "Owned"),
            eq(entry.category, category)
          )
        )
        .groupBy(entry.id, entry.name)
        .orderBy(
          desc(count()),
          desc(sql<string>`SUM(${collection.price}::numeric)`)
        )
        .limit(10)
    );

    const [
      priceRangeDistribution,
      scaleDistribution,
      mostExpensiveCollectionItems,
      topShops,
      totalOwned,
      ...topEntriesResults
    ] = await dbHttp.batch([
      getPriceRangeDistribution,
      getScaleDistribution,
      getMostExpensiveCollectionItems,
      getTopShops,
      getTotalOwned,
      ...topEntriesByCategoryQueries,
    ]);

    // Structure the top entries by category
    const topEntriesByAllCategories = allCategories.reduce(
      (acc, category, index) => {
        acc[category] = topEntriesResults[index];
        return acc;
      },
      {} as Record<string, typeof topEntriesResults[0]>
    );

    return {
      priceRangeDistribution,
      scaleDistribution,
      mostExpensiveCollectionItems,
      topShops,
      totalOwned,
      topEntriesByAllCategories,
    };
  }
}

export default new AnalyticsService();
