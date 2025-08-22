import { db } from "@/db";
import { collection, item_release, item } from "@/db/schema/figure";
import { eq, count, and, sql, avg, desc } from "drizzle-orm";
import { entry, entry_to_item } from "@/db/schema/figure";

class ReportsService {
  async getPriceRangeDistribution(userId: string) {
    try {
      const priceDistribution = await db
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

      return priceDistribution;
    } catch (error) {
      console.error("Failed to get price range distribution:", error);
      throw error;
    }
  }

  async getScaleDistribution(userId: string) {
    try {
      const scaleDistribution = await db
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

      return scaleDistribution;
    } catch (error) {
      console.error("Failed to get scale distribution:", error);
      throw error;
    }
  }

  async getTopCollectedEntries(userId: string, limit: number = 10) {
    try {
      // Get total count first
      const totalOwnedResult = await db
        .select({ total: count() })
        .from(collection)
        .where(
          and(eq(collection.userId, userId), eq(collection.status, "Owned"))
        );

      const totalOwned = totalOwnedResult[0]?.total || 0;

      if (totalOwned === 0) return [];

      const [topOrigins, topCharacters, topArtists, topCompanies] =
        await db.batch([
          db
            .select({
              originName: entry.name,
              itemCount: count(),
              percentage: sql<number>`
              ROUND((COUNT(*)::numeric / ${totalOwned}) * 100, 2)
            `,
            })
            .from(collection)
            .innerJoin(
              entry_to_item,
              eq(collection.itemId, entry_to_item.itemId)
            )
            .innerJoin(entry, eq(entry_to_item.entryId, entry.id))
            .where(
              and(
                eq(collection.userId, userId),
                eq(collection.status, "Owned"),
                eq(entry.category, "Origins")
              )
            )
            .groupBy(entry.id, entry.name)
            .orderBy(sql`COUNT(*) DESC`)
            .limit(limit),
          db
            .select({
              characterName: entry.name,
              itemCount: count(),
              percentage: sql<number>`
              ROUND((COUNT(*)::numeric / ${totalOwned}) * 100, 2)
            `,
            })
            .from(collection)
            .innerJoin(
              entry_to_item,
              eq(collection.itemId, entry_to_item.itemId)
            )
            .innerJoin(entry, eq(entry_to_item.entryId, entry.id))
            .where(
              and(
                eq(collection.userId, userId),
                eq(collection.status, "Owned"),
                eq(entry.category, "Characters")
              )
            )
            .groupBy(entry.id, entry.name)
            .orderBy(sql`COUNT(*) DESC`)
            .limit(limit),
          db
            .select({
              artistName: entry.name,
              itemCount: count(),
              percentage: sql<number>`
              ROUND((COUNT(*)::numeric / ${totalOwned}) * 100, 2)
            `,
            })
            .from(collection)
            .innerJoin(
              entry_to_item,
              eq(collection.itemId, entry_to_item.itemId)
            )
            .innerJoin(entry, eq(entry_to_item.entryId, entry.id))
            .where(
              and(
                eq(collection.userId, userId),
                eq(collection.status, "Owned"),
                eq(entry.category, "Artists")
              )
            )
            .groupBy(entry.id, entry.name)
            .orderBy(sql`COUNT(*) DESC`)
            .limit(limit),
          db
            .select({
              companyName: entry.name,
              itemCount: count(),
              percentage: sql<number>`
              ROUND((COUNT(*)::numeric / ${totalOwned}) * 100, 2)
            `,
            })
            .from(collection)
            .innerJoin(
              entry_to_item,
              eq(collection.itemId, entry_to_item.itemId)
            )
            .innerJoin(entry, eq(entry_to_item.entryId, entry.id))
            .where(
              and(
                eq(collection.userId, userId),
                eq(collection.status, "Owned"),
                eq(entry.category, "Companies")
              )
            )
            .groupBy(entry.id, entry.name)
            .orderBy(sql`COUNT(*) DESC`)
            .limit(limit),
        ]);

      return {
        totalOwned,
        topOrigins,
        topCharacters,
        topArtists,
        topCompanies,
      };
    } catch (error) {
      console.error("Failed to get top collected origins:", error);
      throw error;
    }
  }

  async getAverageEntryPrice(userId: string, entryCategory: string) {
    try {
      const averagePrice = await db
        .select({
          category: entry.category,
          entryName: entry.name,
          averagePrice: avg(item_release.price),
        })
        .from(collection)
        .innerJoin(item_release, eq(collection.releaseId, item_release.id))
        .innerJoin(entry_to_item, eq(item_release.itemId, entry_to_item.itemId))
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
        .limit(5);

      return averagePrice;
    } catch (error) {
      console.error("Failed to get average entry price:", error);
      throw error;
    }
  }

  async getMostExpensiveCollectionItems(userId: string) {
    try {
      const mostExpensiveCollectionItems = await db
        .select({
          itemTitle: item.title,
          itemReleaseDate: item_release.date,
          itemMSRP: item_release.price,
          currency: item_release.priceCurrency,
        })
        .from(collection)
        .innerJoin(item_release, eq(collection.releaseId, item_release.id))
        .innerJoin(item, eq(collection.itemId, item.id))
        .where(
          and(eq(collection.userId, userId), eq(collection.status, "Owned"))
        )
        .orderBy(desc(item_release.price))
        .limit(5);

      return mostExpensiveCollectionItems;
    } catch (error) {
      console.error("Failed to get most expensive", error);
      throw error;
    }
  }
}

export default new ReportsService();
