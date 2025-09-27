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
            WHEN ${item_release.price}::numeric < 5000 THEN '< ¥5,000'
            WHEN ${item_release.price}::numeric < 10000 THEN '¥5,000-¥10,000'
            WHEN ${item_release.price}::numeric < 20000 THEN '¥10,000-¥20,000'
            WHEN ${item_release.price}::numeric < 50000 THEN '¥20,000-¥50,000'
            ELSE '> ¥50,000'
          END
        `,
        count: count(),
        totalValue: sql<string>`SUM(${item_release.price}::numeric)`,
      })
      .from(collection)
      .innerJoin(item_release, eq(collection.releaseId, item_release.id))
      .where(
        and(
          eq(collection.userId, userId),
          eq(collection.status, "Owned"),
          eq(item_release.priceCurrency, "JPY")
        )
      )
      .groupBy(
        sql`
        CASE 
          WHEN ${item_release.price}::numeric < 5000 THEN '< ¥5,000'
          WHEN ${item_release.price}::numeric < 10000 THEN '¥5,000-¥10,000'
          WHEN ${item_release.price}::numeric < 20000 THEN '¥10,000-¥20,000'
          WHEN ${item_release.price}::numeric < 50000 THEN '¥20,000-¥50,000'
          ELSE '> ¥50,000'
        END
      `
      )
      .orderBy(sql`MIN(${item_release.price}::numeric)`);

    const getScaleDistribution = dbHttp
      .select({
        scale: item.scale,
        count: count(),
        totalValue: sql<string>`SUM(${item_release.price}::numeric)`,
      })
      .from(collection)
      .innerJoin(item_release, eq(collection.releaseId, item_release.id))
      .innerJoin(item, eq(item_release.itemId, item.id))
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
        itemTitle: item.title,
        itemReleaseDate: item_release.date,
        itemMSRP: item_release.price,
        currency: item_release.priceCurrency,
      })
      .from(collection)
      .innerJoin(item_release, eq(collection.releaseId, item_release.id))
      .innerJoin(item, eq(collection.itemId, item.id))
      .where(and(eq(collection.userId, userId), eq(collection.status, "Owned")))
      .orderBy(desc(item_release.price))
      .limit(5);

    const getTopShops = dbHttp
      .select({
        shop: collection.shop,
        count: count(),
        totalSpent: sum(collection.price),
      })
      .from(collection)
      .where(and(eq(collection.userId, userId), not(eq(collection.shop, ""))))
      .groupBy(collection.shop)
      .orderBy(desc(count()))
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
      })
      .from(collection)
      .innerJoin(item, eq(collection.itemId, item.id))
      .where(and(eq(collection.userId, userId), eq(collection.status, "Owned")))
      .groupBy(item.category);

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
    const [topEntriesCountByCategory, topEntriesAveragePriceByCategory] =
      await dbHttp.batch([
        dbHttp
          .select({
            originName: entry.name,
            itemCount: count(),
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
          .orderBy(sql`COUNT(*) DESC`)
          .limit(10),

        dbHttp
          .select({
            category: entry.category,
            entryName: entry.name,
            averagePrice: avg(item_release.price),
          })
          .from(collection)
          .innerJoin(item_release, eq(collection.releaseId, item_release.id))
          .innerJoin(
            entry_to_item,
            eq(item_release.itemId, entry_to_item.itemId)
          )
          .innerJoin(entry, eq(entry_to_item.entryId, entry.id))
          .where(
            and(
              eq(collection.userId, userId),
              eq(collection.status, "Owned"),
              eq(item_release.priceCurrency, "JPY"),
              eq(entry.category, entryCategory)
            )
          )
          .groupBy(entry.id, entry.name)
          .orderBy(desc(avg(item_release.price)))
          .limit(5),
      ]);

    return {
      topEntriesCountByCategory,
      topEntriesAveragePriceByCategory,
    };
  }
}

export default new AnalyticsService();
