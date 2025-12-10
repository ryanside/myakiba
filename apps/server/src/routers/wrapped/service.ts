import { dbHttp } from "@myakiba/db";
import {
  collection,
  item,
  order,
} from "@myakiba/db/schema/figure";
import { and, eq, count, sum, desc, avg, between, sql } from "drizzle-orm";
import type { wrappedResponseType } from "./model";

class WrappedService {
  async getWrappedStats(userId: string, year: number): Promise<wrappedResponseType> {
    const startOfYear = new Date(year, 0, 1).toISOString();
    const endOfYear = new Date(year + 1, 0, 1).toISOString();

    const getBasicStats = dbHttp
      .select({
        totalItemsAdded: count(),
        totalSpent: sum(collection.price),
        averageItemPrice: avg(collection.price),
      })
      .from(collection)
      .where(
        and(
          eq(collection.userId, userId),
          between(collection.collectionDate, startOfYear, endOfYear)
        )
      );

    const getOrderStats = dbHttp
      .select({
        totalOrders: count(),
      })
      .from(order)
      .where(
        and(
          eq(order.userId, userId),
          between(order.collectionDate, startOfYear, endOfYear)
        )
      );

    const getMostExpensiveItem = dbHttp
      .select({
        title: item.title,
        price: collection.price,
        category: item.category,
      })
      .from(collection)
      .innerJoin(item, eq(collection.itemId, item.id))
      .where(
        and(
          eq(collection.userId, userId),
          between(collection.collectionDate, startOfYear, endOfYear)
        )
      )
      .orderBy(desc(collection.price))
      .limit(1);

    const getTopCategories = dbHttp
      .select({
        category: item.category,
        count: count(),
        totalValue: sum(collection.price),
      })
      .from(collection)
      .innerJoin(item, eq(collection.itemId, item.id))
      .where(
        and(
          eq(collection.userId, userId),
          between(collection.collectionDate, startOfYear, endOfYear)
        )
      )
      .groupBy(item.category)
      .orderBy(desc(count()))
      .limit(5);

    const getTopShops = dbHttp
      .select({
        shop: collection.shop,
        count: count(),
        totalSpent: sum(collection.price),
      })
      .from(collection)
      .where(
        and(
          eq(collection.userId, userId),
          between(collection.collectionDate, startOfYear, endOfYear)
        )
      )
      .groupBy(collection.shop)
      .orderBy(desc(count()))
      .limit(5);

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
          between(collection.collectionDate, startOfYear, endOfYear)
        )
      )
      .groupBy(sql`EXTRACT(MONTH FROM ${collection.collectionDate})`)
      .orderBy(sql`EXTRACT(MONTH FROM ${collection.collectionDate})`);

    const getTotalOwned = dbHttp
      .select({
        count: count(),
      })
      .from(collection)
      .where(
        and(
          eq(collection.userId, userId),
          eq(collection.status, "Owned"),
        )
      );

    const getOwnedThisYear = dbHttp
      .select({
        count: count(),
      })
      .from(collection)
      .where(
        and(
          eq(collection.userId, userId),
          eq(collection.status, "Owned"),
          between(collection.collectionDate, startOfYear, endOfYear)
        )
      );

    const [
      [basicStats],
      [orderStats],
      [mostExpensiveItemQuery],
      topCategories,
      topShops,
      monthlyBreakdown,
      [totalOwned],
      [ownedThisYear],
    ] = await dbHttp.batch([
      getBasicStats,
      getOrderStats,
      getMostExpensiveItem,
      getTopCategories,
      getTopShops,
      getMonthlyBreakdown,
      getTotalOwned,
      getOwnedThisYear,
    ]);

    const startCount = totalOwned?.count - ownedThisYear?.count || 0;
    const endCount = totalOwned?.count || 0;
    const growth = endCount - startCount;
    const growthPercentage = startCount > 0 ? Math.round((growth / startCount) * 100) : 100;

    const summary = this.generateSummary(year, basicStats, mostExpensiveItemQuery, topCategories, growth);

    return {
      year,
      stats: {
        totalItemsAdded: basicStats.totalItemsAdded,
        totalSpent: basicStats.totalSpent,
        totalOrders: orderStats?.totalOrders || 0,
        averageItemPrice: basicStats.averageItemPrice,
        mostExpensiveItem: mostExpensiveItemQuery || null,
        topCategories,
        topShops,
        monthlyBreakdown,
        collectionGrowth: {
          startOfYear: startCount,
          endOfYear: endCount,
          growth,
          growthPercentage,
        },
      },
      summary,
    };
  }

  private generateSummary(
    year: number,
    basicStats: any,
    mostExpensiveItem: any,
    topCategories: any[],
    growth: number
  ) {
    const highlights: string[] = [];
    
    if (basicStats.totalItemsAdded > 0) {
      highlights.push(`Added ${basicStats.totalItemsAdded} new items to your collection`);
    }
    
    if (basicStats.totalSpent && parseFloat(basicStats.totalSpent) > 0) {
      highlights.push(`Invested ${basicStats.totalSpent} in your hobby`);
    }
    
    if (mostExpensiveItem) {
      highlights.push(`Your most valuable addition was "${mostExpensiveItem.title}" (${mostExpensiveItem.price})`);
    }
    
    if (topCategories.length > 0 && topCategories[0].category) {
      highlights.push(`${topCategories[0].category} was your favorite category this year`);
    }
    
    if (growth > 0) {
      highlights.push(`Your collection grew by ${growth} items this year`);
    }

    const title = `${year} Collection Wrapped`;
    const description = basicStats.totalItemsAdded > 0 
      ? `What a year it's been for your collection! Here's how your hobby evolved in ${year}.`
      : `Your collection took a breather in ${year}. Ready for more adventures ahead?`;

    return {
      title,
      description,
      highlights,
    };
  }
}

export default new WrappedService();
