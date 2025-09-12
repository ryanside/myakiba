import { dbHttp } from "@/db";
import {
  item,
  collection,
  item_release,
  order,
  budget,
} from "@/db/schema/figure";
import { eq, count, and, sum, asc, sql, desc } from "drizzle-orm";

class DashboardService {
  async getDashboard(userId: string) {
    const currentMonth = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1
    ).toISOString();
    const nextMonth = new Date(
      new Date().getFullYear(),
      new Date().getMonth() + 1,
      1
    ).toISOString();

    const [
      collectionStats,
      categoriesOwned,
      orders,
      ordersSummary,
      budgetSummary,
      upcomingReleases,
      latestCollectionItems,
    ] = await dbHttp.batch([
      dbHttp
        .select({
          totalItems: count(
            sql`CASE WHEN ${collection.status} = 'Owned' THEN 1 END`
          ),
          itemsThisMonth: count(
            sql`CASE WHEN ${collection.collectionDate} >= ${currentMonth} 
              AND ${collection.collectionDate} < ${nextMonth} 
              AND ${collection.status} = 'Owned' THEN 1 END`
          ),
          totalSpent: sql<string>`COALESCE(${sum(collection.price)}, 0)`,
          totalSpentThisMonth: sql<string>`COALESCE(${sum(
            sql`CASE WHEN ${collection.paymentDate} >= ${currentMonth} 
                AND ${collection.paymentDate} < ${nextMonth}
                THEN ${collection.price} ELSE 0 END`
          )}, 0)`
          ,
          totalActiveOrderPrice: sql<string>`COALESCE(${sum(
            sql`CASE WHEN ${collection.status} = 'Ordered'
                THEN ${collection.price} ELSE 0 END`
          )}, 0)`,
        })
        .from(collection)
        .leftJoin(item_release, eq(collection.releaseId, item_release.id))
        .where(eq(collection.userId, userId)),

      dbHttp
        .select({
          name: item.category,
          count: count(),
          totalValue: sum(sql`COALESCE(${collection.price}, 0)`),
        })
        .from(collection)
        .innerJoin(item, eq(collection.itemId, item.id))
        .where(
          and(eq(collection.userId, userId), eq(collection.status, "Owned"))
        )
        .groupBy(item.category)
        .orderBy(desc(count())),

      dbHttp
        .select({
          orderId: order.id,
          title: order.title,
          shop: order.shop,
          releaseMonthYear: order.releaseMonthYear,
          itemImages: sql<
            string[]
          >`array_agg(DISTINCT ${item.image}) FILTER (WHERE ${item.image} IS NOT NULL)`,
          itemIds: sql<number[]>`array_agg(DISTINCT ${item.id})`,
          total: sql<string>`COALESCE(${sum(collection.price)}, 0) + COALESCE(${order.shippingFee}, 0) + COALESCE(${order.taxes}, 0) + COALESCE(${order.duties}, 0) + COALESCE(${order.tariffs}, 0) + COALESCE(${order.miscFees}, 0)`,
        })
        .from(order)
        .leftJoin(
          collection,
          and(
            eq(order.id, collection.orderId),
            eq(collection.status, "Ordered")
          )
        )
        .leftJoin(item, eq(collection.itemId, item.id))
        .where(and(eq(order.userId, userId)))
        .groupBy(order.id, order.title, order.shop, order.releaseMonthYear)
        .orderBy(asc(order.releaseMonthYear))
        .limit(6),
      dbHttp
        .select({
          totalActiveOrderCount: sql<string>`COALESCE(${sum(
            sql`CASE WHEN ${order.collectionDate} IS NULL
                THEN 1 ELSE 0 END`
          )}, 0)`,
          totalActiveOrderShipping: sql<string>`COALESCE(${sum(
            sql`CASE WHEN ${order.collectionDate} IS NULL
                THEN ${order.shippingFee} ELSE 0 END`
          )}, 0)`,
          totalActiveOrderTaxes: sql<string>`COALESCE(${sum(
            sql`CASE WHEN ${order.collectionDate} IS NULL
                THEN ${order.taxes} ELSE 0 END`
          )}, 0)`,
          totalActiveOrderDuties: sql<string>`COALESCE(${sum(
            sql`CASE WHEN ${order.collectionDate} IS NULL
                THEN ${order.duties} ELSE 0 END`
          )}, 0)`,
          totalActiveOrderTariffs: sql<string>`COALESCE(${sum(
            sql`CASE WHEN ${order.collectionDate} IS NULL
                THEN ${order.tariffs} ELSE 0 END`
          )}, 0)`,
          totalActiveOrderMiscFees: sql<string>`COALESCE(${sum(
            sql`CASE WHEN ${order.collectionDate} IS NULL
                THEN ${order.miscFees} ELSE 0 END`
          )}, 0)`,
          totalShippingAllTime: sql<string>`COALESCE(${sum(order.shippingFee)}, 0)`,
          totalTaxesAllTime: sql<string>`COALESCE(${sum(order.taxes)}, 0)`,
          totalDutiesAllTime: sql<string>`COALESCE(${sum(order.duties)}, 0)`,
          totalTariffsAllTime: sql<string>`COALESCE(${sum(order.tariffs)}, 0)`,
          totalMiscFeesAllTime: sql<string>`COALESCE(${sum(order.miscFees)}, 0)`,
          thisMonthOrderCount: sql<string>`COALESCE(${sum(
            sql`CASE WHEN ${order.releaseMonthYear} >= ${currentMonth} 
                AND ${order.releaseMonthYear} < ${nextMonth} 
                THEN 1 ELSE 0 END`
          )}, 0)`,
          thisMonthShipping: sql<string>`COALESCE(${sum(
            sql`CASE WHEN ${order.paymentDate} >= ${currentMonth} 
                AND ${order.paymentDate} < ${nextMonth}
                THEN ${order.shippingFee} ELSE 0 END`
          )}, 0)`,
          thisMonthTaxes: sql<string>`COALESCE(${sum(
            sql`CASE WHEN ${order.paymentDate} >= ${currentMonth} 
                AND ${order.paymentDate} < ${nextMonth}
                THEN ${order.taxes} ELSE 0 END`
          )}, 0)`,
          thisMonthDuties: sql<string>`COALESCE(${sum(
            sql`CASE WHEN ${order.paymentDate} >= ${currentMonth} 
                AND ${order.paymentDate} < ${nextMonth}
                THEN ${order.duties} ELSE 0 END`
          )}, 0)`,
          thisMonthTariffs: sql<string>`COALESCE(${sum(
            sql`CASE WHEN ${order.paymentDate} >= ${currentMonth} 
                AND ${order.paymentDate} < ${nextMonth}
                THEN ${order.tariffs} ELSE 0 END`
          )}, 0)`,
          thisMonthMiscFees: sql<string>`COALESCE(${sum(
            sql`CASE WHEN ${order.paymentDate} >= ${currentMonth} 
                AND ${order.paymentDate} < ${nextMonth}
                THEN ${order.miscFees} ELSE 0 END`
          )}, 0)`,
        })
        .from(order)
        .where(eq(order.userId, userId)),
      dbHttp.select().from(budget).where(eq(budget.userId, userId)),
      
      dbHttp
        .select({
          itemId: item.id,
          title: item.title,
          image: item.image,
          category: item.category,
          releaseDate: item_release.date,
          price: item_release.price,
          priceCurrency: item_release.priceCurrency,
        })
        .from(item_release)
        .innerJoin(item, eq(item_release.itemId, item.id))
        .innerJoin(
          collection,
          and(
            eq(collection.itemId, item.id),
            eq(collection.userId, userId),
            eq(collection.status, "Ordered")
          )
        )
        .where(
          sql`${item_release.date} >= CURRENT_DATE AND ${item_release.date} <= CURRENT_DATE + INTERVAL '3 months'`
        )
        .orderBy(asc(item_release.date))
        .limit(4),
      
      dbHttp
        .select({
          itemId: item.id,
          title: item.title,
          image: item.image,
          category: item.category,
          status: collection.status,
          createdAt: collection.createdAt,
        })
        .from(collection)
        .innerJoin(item, eq(collection.itemId, item.id))
        .where(eq(collection.userId, userId))
        .orderBy(desc(collection.createdAt))
        .limit(4),
    ]);

    return {
      collectionStats,
      categoriesOwned,
      orders,
      ordersSummary,
      budgetSummary,
      upcomingReleases,
      latestCollectionItems,
    };
  }
}

export default new DashboardService();
