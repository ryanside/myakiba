import { db } from "@/db";
import { collection, item_release } from "@/db/schema/figure";
import { eq, count, and, sql } from "drizzle-orm";
import { entry, entry_to_item } from "@/db/schema/figure";

export async function getPriceRangeDistribution(
  userId: string,
  currency: string = "JPY"
) {
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
          eq(item_release.priceCurrency, currency)
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

export async function getTopCollectedOrigins(
  userId: string,
  limit: number = 10
) {
  try {
    const topOrigins = await db
      .select({
        originName: entry.name,
        itemCount: count(),
        percentage: sql<number>`
          ROUND(
            (COUNT(*)::numeric / (
              SELECT COUNT(*) 
              FROM ${collection} 
              WHERE ${collection.userId} = ${userId} 
              AND ${collection.status} = 'Owned'
            )) * 100, 
            2
          )
        `,
      })
      .from(collection)
      .innerJoin(entry_to_item, eq(collection.itemId, entry_to_item.itemId))
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
      .limit(limit);

    return topOrigins;
  } catch (error) {
    console.error("Failed to get top collected origins:", error);
    throw error;
  }
}
