import { db } from "@/db";
import { item, collection, item_release } from "@/db/schema/figure";
import { eq, count, and, sum, gte, lt, asc, sql } from "drizzle-orm";

class DashboardService {
  async getCollectionStats(userId: string) {
    try {
      const currentMonth = new Date(
        new Date().getFullYear(),
        new Date().getMonth(),
        1
      );
      const nextMonth = new Date(
        new Date().getFullYear(),
        new Date().getMonth() + 1,
        1
      );

      const [collectionStats] = await db
        .select({
          totalItems: count(),
          itemsThisMonth: count(
            sql`CASE WHEN ${collection.createdAt} >= ${currentMonth} 
                AND ${collection.createdAt} < ${nextMonth} 
                AND ${collection.status} = 'Owned' THEN 1 END`
          ),
          totalMsrpJPY: sum(
            sql`CASE WHEN ${item_release.priceCurrency} = 'JPY' 
                AND ${collection.status} = 'Owned' 
                THEN ${item_release.price}::numeric END`
          ),
          totalMsrpUSD: sum(
            sql`CASE WHEN ${item_release.priceCurrency} = 'USD' 
                AND ${collection.status} = 'Owned' 
                THEN ${item_release.price}::numeric END`
          ),
          totalMsrpCNY: sum(
            sql`CASE WHEN ${item_release.priceCurrency} = 'CNY' 
                AND ${collection.status} = 'Owned' 
                THEN ${item_release.price}::numeric END`
          ),

          msrpThisMonthJPY: sum(
            sql`CASE WHEN ${item_release.priceCurrency} = 'JPY' 
                AND ${collection.status} = 'Owned'
                AND ${collection.createdAt} >= ${currentMonth} 
                AND ${collection.createdAt} < ${nextMonth}
                THEN ${item_release.price}::numeric END`
          ),
          totalSpent: sum(collection.price),
          totalShipping: sum(collection.shippingFee),
          spentThisMonth: sum(
            sql`CASE WHEN ${collection.status} = 'Ordered'
                   AND ${collection.createdAt} >= ${currentMonth} 
                   AND ${collection.createdAt} < ${nextMonth}
                   THEN ${collection.price}::numeric END`
          ),
          // TODO: add shippingThisMonth
        })
        .from(collection)
        .leftJoin(item_release, eq(collection.releaseId, item_release.id))
        .where(eq(collection.userId, userId));
      const categoriesOwned = await db
        .select({
          name: item.category,
          count: count(),
        })
        .from(collection)
        .innerJoin(item, eq(collection.itemId, item.id))
        .where(
          and(eq(collection.userId, userId), eq(collection.status, "Owned"))
        )
        .groupBy(item.category);

      return {
        itemsSummary: {
          itemsOwned: collectionStats.totalItems,
          newItemsThisMonth: collectionStats.itemsThisMonth,
          categoriesOwned,
        },
        msrpSummary: {
          totalMsrpJPY: collectionStats.totalMsrpJPY,
          totalMsrpUSD: collectionStats.totalMsrpUSD,
          totalMsrpCNY: collectionStats.totalMsrpCNY,
          msrpThisMonthJPY: collectionStats.msrpThisMonthJPY,
        },
        spentSummary: {
          totalSpent: collectionStats.totalSpent,
          totalSpentThisMonth: collectionStats.spentThisMonth,
        },
      };
    } catch (error) {
      console.error("Failed to get collection stats");
      throw error;
    }
  }

  async getOrdersSummary(userId: string) {
    try {
      const [orders, ordersThisMonth] = await db.batch([
        // orders
        db
          .select({
            paid: collection.price,
            itemTitle: item.title,
            itemReleaseDate: item_release.date,
            itemMSRP: item_release.price,
            itemCount: collection.count,
            currency: item_release.priceCurrency,
            shop: collection.shop,
          })
          .from(collection)
          .innerJoin(item_release, eq(collection.releaseId, item_release.id))
          .innerJoin(item, eq(collection.itemId, item.id))
          .where(
            and(eq(collection.userId, userId), eq(collection.status, "Ordered"))
          )
          .orderBy(asc(item_release.date))
          .limit(6),
        // ordersThisMonth
        db
          .select({
            count: count(),
          })
          .from(collection)
          .innerJoin(item_release, eq(collection.releaseId, item_release.id))
          .where(
            and(
              eq(collection.userId, userId),
              eq(collection.status, "Ordered"),
              gte(
                item_release.date,
                new Date(new Date().getFullYear(), new Date().getMonth(), 1)
                  .toISOString()
                  .slice(0, 10)
              ),
              lt(
                item_release.date,
                new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1)
                  .toISOString()
                  .slice(0, 10)
              )
            )
          ),
      ]);

      return {
        orders,
        ordersThisMonth,
      };
    } catch (error) {
      console.error("Failed to get orders");
      throw error;
    }
  }

  async getRecentItems(userId: string) {
    try {
      const recentItems = await db
        .select({
          itemTitle: item.title,
          itemReleaseDate: item_release.date,
          itemMSRP: item_release.price,
          itemCount: collection.count,
          currency: item_release.priceCurrency,
          shop: collection.shop,
          createdAt: collection.createdAt,
        })
        .from(collection)
        .innerJoin(item, eq(collection.itemId, item.id))
        .innerJoin(item_release, eq(collection.releaseId, item_release.id))
        .where(eq(collection.userId, userId))
        .orderBy(asc(collection.createdAt))
        .limit(3);

      return recentItems;
    } catch (error) {
      console.error("Failed to get recent items");
      throw error;
    }
  }
}

export default new DashboardService();
