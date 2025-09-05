import { dbHttp } from "@/db";
import {
  item,
  collection,
  item_release,
  order,
  budget,
} from "@/db/schema/figure";
import { eq, count, and, sum, asc, sql } from "drizzle-orm";

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
    ] = await dbHttp.batch([
      dbHttp
        .select({
          totalItems: count(),
          itemsThisMonth: count(
            sql`CASE WHEN ${collection.collectionDate} >= ${currentMonth} 
              AND ${collection.collectionDate} < ${nextMonth} 
              AND ${collection.status} = 'Owned' THEN 1 END`
          ),
          totalSpent: sum(collection.price),
          totalSpentThisMonth: sum(
            sql`CASE WHEN ${collection.paymentDate} >= ${currentMonth} 
                 AND ${collection.paymentDate} < ${nextMonth}
                 THEN ${collection.price}::numeric END`
          ),
        })
        .from(collection)
        .leftJoin(item_release, eq(collection.releaseId, item_release.id))
        .where(eq(collection.userId, userId)),

      dbHttp
        .select({
          name: item.category,
          count: count(),
        })
        .from(collection)
        .innerJoin(item, eq(collection.itemId, item.id))
        .where(
          and(eq(collection.userId, userId), eq(collection.status, "Owned"))
        )
        .groupBy(item.category),
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
          totalActiveOrderCount:
            sum(sql`CASE WHEN ${order.collectionDate} IS NULL
                THEN 1 ELSE 0 END`),
          totalShippingAllTime: sum(order.shippingFee),
          totalTaxesAllTime: sum(order.taxes),
          totalDutiesAllTime: sum(order.duties),
          totalTariffsAllTime: sum(order.tariffs),
          totalMiscFeesAllTime: sum(order.miscFees),
          thisMonthOrderCount: sum(
            sql`CASE WHEN ${order.releaseMonthYear} >= ${currentMonth} 
                AND ${order.releaseMonthYear} < ${nextMonth} 
                THEN 1 ELSE 0 END`
          ),
          thisMonthShipping: sum(
            sql`CASE WHEN ${order.paymentDate} >= ${currentMonth} 
                AND ${order.paymentDate} < ${nextMonth}
                THEN ${order.shippingFee} ELSE 0 END`
          ),
          thisMonthTaxes: sum(
            sql`CASE WHEN ${order.paymentDate} >= ${currentMonth} 
                AND ${order.paymentDate} < ${nextMonth}
                THEN ${order.taxes} ELSE 0 END`
          ),
          thisMonthDuties: sum(
            sql`CASE WHEN ${order.paymentDate} >= ${currentMonth} 
                AND ${order.paymentDate} < ${nextMonth}
                THEN ${order.duties} ELSE 0 END`
          ),
          thisMonthTariffs: sum(
            sql`CASE WHEN ${order.paymentDate} >= ${currentMonth} 
                AND ${order.paymentDate} < ${nextMonth}
                THEN ${order.tariffs} ELSE 0 END`
          ),
          thisMonthMiscFees: sum(
            sql`CASE WHEN ${order.paymentDate} >= ${currentMonth} 
                AND ${order.paymentDate} < ${nextMonth}
                THEN ${order.miscFees} ELSE 0 END`
          ),
        })
        .from(order)
        .where(eq(order.userId, userId)),
      dbHttp.select().from(budget).where(eq(budget.userId, userId)),
    ]);

    return {
      collectionStats,
      categoriesOwned,
      orders,
      ordersSummary,
      budgetSummary,
    };
  }
}

export default new DashboardService();
