import { dbHttp } from "@/db";
import { collection, item_release, item } from "@/db/schema/figure";
import { eq, count, and, sql, avg, desc, sum, between, not } from "drizzle-orm";
import { entry, entry_to_item } from "@/db/schema/figure";

class AnalyticsService {
  async getAnalytics(userId: string) {
    const startOfYear = new Date(new Date().getFullYear(), 0, 1).toISOString();
    const endOfYear = new Date(
      new Date().getFullYear() + 1,
      0,
      1
    ).toISOString();

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
      .limit(3);

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

    const getMonthlyBreakdown = dbHttp
      .select({
        month: sql<number>`EXTRACT(MONTH FROM ${collection.collectionDate})`,
        itemsAdded: count(),
        amountSpent: sum(collection.price),
      })
      .from(collection)
      .where(
        and(
          eq(collection.userId, userId),
          eq(collection.status, "Owned"),
          between(collection.collectionDate, startOfYear, endOfYear)
        )
      )
      .groupBy(sql`EXTRACT(MONTH FROM ${collection.collectionDate})`)
      .orderBy(sql`EXTRACT(MONTH FROM ${collection.collectionDate})`);

    const getCategoriesOwned = dbHttp
      .select({
        name: item.category,
        count: count(),
        totalValue: sum(sql`COALESCE(${collection.price}, 0)`),
      })
      .from(collection)
      .innerJoin(item, eq(collection.itemId, item.id))
      .where(and(eq(collection.userId, userId), eq(collection.status, "Owned")))
      .groupBy(item.category)
      .orderBy(desc(count()));

    const getTotalOwned = dbHttp
      .select({
        count: count(),
      })
      .from(collection)
      .where(
        and(eq(collection.userId, userId), eq(collection.status, "Owned"))
      );

    const [
      priceRangeDistribution,
      scaleDistribution,
      mostExpensiveCollectionItems,
      topShops,
      monthlyBreakdown,
      categoriesOwned,
      totalOwned,
    ] = await dbHttp.batch([
      getPriceRangeDistribution,
      getScaleDistribution,
      getMostExpensiveCollectionItems,
      getTopShops,
      getMonthlyBreakdown,
      getCategoriesOwned,
      getTotalOwned,
    ]);

    return {
      priceRangeDistribution,
      scaleDistribution,
      mostExpensiveCollectionItems,
      topShops,
      monthlyBreakdown,
      categoriesOwned,
      totalOwned,
    };
  }

  async getEntryAnalytics(userId: string, entryCategory: string) {
    const [topEntriesByCategory] = await dbHttp.batch([
      dbHttp
        .select({
          originName: entry.name,
          itemCount: count(),
          totalValue: sql<string>`SUM(${collection.price}::numeric)`,
        })
        .from(collection)
        .innerJoin(entry_to_item, eq(collection.itemId, entry_to_item.itemId))
        .innerJoin(entry, eq(entry_to_item.entryId, entry.id))
        .where(
          and(
            eq(collection.userId, userId),
            eq(collection.status, "Owned"),
            eq(entry.category, entryCategory)
          )
        )
        .groupBy(entry.id, entry.name)
        .orderBy(
          desc(count()),
          desc(sql<string>`SUM(${collection.price}::numeric)`)
        )
        .limit(10),
    ]);
    return {
      topEntriesByCategory,
    };
  }
}

export default new AnalyticsService();
