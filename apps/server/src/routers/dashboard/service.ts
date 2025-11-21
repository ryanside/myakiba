import { db, dbHttp } from "@/db";
import {
  item,
  collection,
  item_release,
  order,
  budget,
} from "@/db/schema/figure";
import {
  eq,
  count,
  and,
  sum,
  asc,
  sql,
  desc,
  ne,
  isNull,
  gte,
  lte,
} from "drizzle-orm";

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
    const startOfYear = new Date(new Date().getFullYear(), 0, 1).toISOString();
    const endOfYear = new Date(
      new Date().getFullYear() + 1,
      0,
      1
    ).toISOString();

    const [
      collectionStats,
      categoriesOwned,
      orders,
      ordersSummary,
      budgetSummary,
      unpaidOrders,
      monthlyOrders,
    ] = await dbHttp.batch([
      // Total Items, Total Spent, Total Spent This Month (Items only)
      dbHttp
        .select({
          totalItems: count(
            sql`CASE WHEN ${collection.status} = 'Owned' THEN 1 END`
          ),
          totalSpent: sql<string>`COALESCE(${sum(collection.price)}, 0)`,
          totalSpentThisMonth: sql<string>`COALESCE(${sum(
            sql`CASE WHEN ${collection.paymentDate} >= ${currentMonth} 
                AND ${collection.paymentDate} < ${nextMonth}
                THEN ${collection.price} ELSE 0 END`
          )}, 0)`,
        })
        .from(collection)
        .where(eq(collection.userId, userId)),

      // Categories Owned
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

      // Order Kanban
      // Contains "Ordered", "Paid", "Shipped" Orders
      dbHttp
        .select({
          orderId: order.id,
          title: order.title,
          shop: order.shop,
          status: order.status,
          releaseMonthYear: order.releaseMonthYear,
          itemImages: sql<
            string[]
          >`array_agg(DISTINCT ${item.image}) FILTER (WHERE ${item.image} IS NOT NULL)`,
          itemIds: sql<number[]>`array_agg(DISTINCT ${item.id})`,
          total: sql<string>`COALESCE(${sum(collection.price)}, 0) + COALESCE(${order.shippingFee}, 0) + COALESCE(${order.taxes}, 0) + COALESCE(${order.duties}, 0) + COALESCE(${order.tariffs}, 0) + COALESCE(${order.miscFees}, 0)`,
        })
        .from(order)
        .leftJoin(collection, and(eq(order.id, collection.orderId)))
        .leftJoin(item, eq(collection.itemId, item.id))
        .where(and(eq(order.userId, userId), ne(order.status, "Owned")))
        .groupBy(
          order.id,
          order.title,
          order.shop,
          order.status,
          order.releaseMonthYear
        )
        .orderBy(asc(order.releaseMonthYear))
        .limit(10),

      // Total Active Orders Count,
      // Total Shipping, Taxes, Duties, Tariffs, Misc Fees
      // This Month Order Count, Shipping, Taxes, Duties, Tariffs, Misc Fees
      dbHttp
        .select({
          totalActiveOrderCount: sql<string>`COALESCE(${sum(
            sql`CASE WHEN ${order.collectionDate} IS NULL
                THEN 1 ELSE 0 END`
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

      // Budget Summary
      dbHttp.select().from(budget).where(eq(budget.userId, userId)),

      // Unpaid Orders
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
        .leftJoin(collection, and(eq(order.id, collection.orderId)))
        .leftJoin(item, eq(collection.itemId, item.id))
        .where(
          and(
            eq(order.userId, userId),
            ne(order.status, "Owned"),
            ne(order.status, "Paid"),
            isNull(order.paymentDate)
          )
        )
        .orderBy(asc(order.releaseMonthYear))
        .groupBy(order.id, order.title, order.shop, order.releaseMonthYear),

      // Monthly Orders - Order counts grouped by release month for current year
      dbHttp
        .select({
          month: sql<number>`EXTRACT(MONTH FROM ${order.releaseMonthYear})`,
          orderCount: count(),
        })
        .from(order)
        .where(
          and(
            eq(order.userId, userId),
            gte(order.releaseMonthYear, startOfYear),
            lte(order.releaseMonthYear, endOfYear)
          )
        )
        .groupBy(sql`EXTRACT(MONTH FROM ${order.releaseMonthYear})`)
        .orderBy(sql`EXTRACT(MONTH FROM ${order.releaseMonthYear})`),

      // dbHttp
      //   .select({
      //     itemId: item.id,
      //     title: item.title,
      //     image: item.image,
      //     category: item.category,
      //     releaseDate: item_release.date,
      //     price: item_release.price,
      //     priceCurrency: item_release.priceCurrency,
      //   })
      //   .from(item_release)
      //   .innerJoin(item, eq(item_release.itemId, item.id))
      //   .innerJoin(
      //     collection,
      //     and(
      //       eq(collection.itemId, item.id),
      //       eq(collection.userId, userId),
      //       ne(collection.status, "Owned")
      //     )
      //   )
      //   .where(
      //     sql`${item_release.date} >= CURRENT_DATE AND ${item_release.date} <= CURRENT_DATE + INTERVAL '3 months'`
      //   )
      //   .orderBy(asc(item_release.date))
      //   .limit(4),
    ]);

    return {
      collectionStats,
      categoriesOwned,
      orders,
      ordersSummary,
      budgetSummary,
      unpaidOrders,
      monthlyOrders,
    };
  }

  async getReleaseCalendar(userId: string, month: number, year: number) {
    const startDate = new Date(year, month - 1, 1).toISOString();
    const endDate = new Date(year, month, 0).toISOString();

    const releases = await db
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
          eq(item.id, collection.itemId),
          eq(collection.userId, userId),
          ne(collection.status, "Owned")
        )
      )
      .where(
        and(gte(item_release.date, startDate), lte(item_release.date, endDate))
      )
      .orderBy(asc(item_release.date));

    return { releases };
  }
}

export default new DashboardService();
