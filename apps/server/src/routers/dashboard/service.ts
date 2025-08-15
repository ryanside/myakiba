import { db } from "@/db";
import { item, collection, item_release } from "@/db/schema/figure";
import { eq, count, and, sum, gte, lt, asc } from "drizzle-orm";

// TODO: Currency conversion all to USD
export async function getCollectionStats(userId: string) {
  try {
    const [
      itemsOwned,
      newItemsThisMonth,
      categoriesOwned,
      totalMsrpJPY,
      totalMsrpCNY,
      totalMsrpUSD,
      msrpThisMonthJPY,
      msrpThisMonthCNY,
      msrpThisMonthUSD,
      totalSpent,
      totalSpentThisMonth,
    ] = await db.batch([
      // Items Summary queries
      // itemsOwned
      db
        .select({
          count: count(),
        })
        .from(collection)
        .where(
          and(eq(collection.userId, userId), eq(collection.status, "Owned"))
        ),
      // newItemsThisMonth
      db
        .select({
          count: count(),
        })
        .from(collection)
        .where(
          and(
            eq(collection.userId, userId),
            eq(collection.status, "Owned"),
            gte(
              collection.createdAt,
              new Date(new Date().getFullYear(), new Date().getMonth(), 1)
            ),
            lt(
              collection.createdAt,
              new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1)
            )
          )
        ),
      // categoriesOwned
      db
        .select({
          name: item.category,
          count: count(),
        })
        .from(collection)
        .innerJoin(item, eq(collection.itemId, item.id))
        .where(and(eq(collection.userId, userId), eq(collection.status, "Owned")))
        .groupBy(item.category),
      // Collection MSRP Summary queries
      // totalMsrpJPY
      db
        .select({
          totalMsrpJPY: sum(item_release.price),
        })
        .from(collection)
        .innerJoin(item_release, eq(collection.releaseId, item_release.id))
        .where(
          and(
            eq(collection.userId, userId),
            eq(collection.status, "Owned"),
            eq(item_release.priceCurrency, "JPY")
          )
        ),
      // totalMsrpCNY
      db
        .select({
          totalMsrpCNY: sum(item_release.price),
        })
        .from(collection)
        .innerJoin(item_release, eq(collection.releaseId, item_release.id))
        .where(
          and(
            eq(collection.userId, userId),
            eq(collection.status, "Owned"),
            eq(item_release.priceCurrency, "CNY")
          )
        ),
      // totalMsrpUSD
      db
        .select({
          totalMsrpUSD: sum(item_release.price),
        })
        .from(collection)
        .innerJoin(item_release, eq(collection.releaseId, item_release.id))
        .where(
          and(
            eq(collection.userId, userId),
            eq(collection.status, "Owned"),
            eq(item_release.priceCurrency, "USD")
          )
        ),
      // msrpThisMonthJPY
      db
        .select({
          msrpThisMonthJPY: sum(item_release.price),
        })
        .from(collection)
        .innerJoin(item_release, eq(collection.releaseId, item_release.id))
        .where(
          and(
            eq(collection.userId, userId),
            eq(collection.status, "Owned"),
            eq(item_release.priceCurrency, "JPY"),
            gte(
              collection.createdAt,
              new Date(new Date().getFullYear(), new Date().getMonth(), 1)
            ),
            lt(
              collection.createdAt,
              new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1)
            )
          )
        ),
      // msrpThisMonthCNY
      db
        .select({
          msrpThisMonthCNY: sum(item_release.price),
        })
        .from(collection)
        .innerJoin(item_release, eq(collection.releaseId, item_release.id))
        .where(
          and(
            eq(collection.userId, userId),
            eq(collection.status, "Owned"),
            eq(item_release.priceCurrency, "CNY"),
            gte(
              collection.createdAt,
              new Date(new Date().getFullYear(), new Date().getMonth(), 1)
            ),
            lt(
              collection.createdAt,
              new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1)
            )
          )
        ),
      // msrpThisMonthUSD
      db
        .select({
          msrpThisMonthUSD: sum(item_release.price),
        })
        .from(collection)
        .innerJoin(item_release, eq(collection.releaseId, item_release.id))
        .where(
          and(
            eq(collection.userId, userId),
            eq(collection.status, "Owned"),
            eq(item_release.priceCurrency, "USD"),
            gte(
              collection.createdAt,
              new Date(new Date().getFullYear(), new Date().getMonth(), 1)
            ),
            lt(
              collection.createdAt,
              new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1)
            )
          )
        ),
      // Total Spent Summary queries
      // totalSpent
      db
        .select({
          totalSpent: sum(collection.price),
          totalShipping: sum(collection.shippingFee),
        })
        .from(collection)
        .where(eq(collection.userId, userId)),
      // totalSpentThisMonth
      db
        .select({
          totalSpentThisMonth: sum(collection.price),
        })
        .from(collection)
        .where(
          and(
            eq(collection.userId, userId),
            eq(collection.status, "Ordered"),
            gte(
              collection.createdAt,
              new Date(new Date().getFullYear(), new Date().getMonth(), 1)
            ),
            lt(
              collection.createdAt,
              new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1)
            )
          )
        ),
    ]);

    return {
      // Items Summary data
      itemsSummary: {
        itemsOwned,
        newItemsThisMonth,
        categoriesOwned,
      },
      // Collection MSRP Summary data
      msrpSummary: {
        totalMsrpJPY,
        totalMsrpCNY,
        totalMsrpUSD,
        msrpThisMonthJPY,
        msrpThisMonthCNY,
        msrpThisMonthUSD,
      },
      // Total Spent Summary data
      spentSummary: {
        totalSpent,
        totalSpentThisMonth,
      },
    };
  } catch (error) {
    console.error("Failed to get collection stats");
    throw error;
  }
}

export async function getOrdersSummary(userId: string) {
  try {
    const [
      orders,
      ordersThisMonth,
    ] = await db.batch([
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

export async function getRecentItems(userId: string) {
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
