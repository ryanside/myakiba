import { db } from "@myakiba/db";
import {
  item,
  collection,
  item_release,
  order,
  budget,
} from "@myakiba/db/schema/figure";
import type { Category } from "@myakiba/types";
import {
  eq,
  count,
  and,
  sum,
  asc,
  sql,
  desc,
  ne,
  gte,
  lte,
} from "drizzle-orm";

class DashboardService {
  private collectionStatsPrepared;
  private categoriesOwnedPrepared;
  private ordersPrepared;
  private ordersSummaryPrepared;
  private budgetSummaryPrepared;
  private unpaidOrdersPrepared;
  private monthlyOrdersPrepared;
  private releaseCalendarPrepared;

  constructor() {
    // Total Items, Total Spent, Total Spent This Month (Items only)
    this.collectionStatsPrepared = db
      .select({
        totalItems: count(
          sql`CASE WHEN ${collection.status} = 'Owned' THEN 1 END`
        ),
        totalSpent: sql<string>`COALESCE(${sum(collection.price)}, 0)`,
        totalSpentThisMonth: sql<string>`COALESCE(${sum(
          sql`CASE WHEN ${collection.paymentDate} >= ${sql.placeholder('currentMonth')}
              AND ${collection.paymentDate} < ${sql.placeholder('nextMonth')}
              THEN ${collection.price} ELSE 0 END`
        )}, 0)`,
      })
      .from(collection)
      .where(eq(collection.userId, sql.placeholder('userId')))
      .prepare("collection_stats");

    // Categories Owned
    this.categoriesOwnedPrepared = db
      .select({
        name: sql<Category>`${item.category}::text`,
        count: count(),
        totalValue: sum(sql`COALESCE(${collection.price}, 0)`),
      })
      .from(collection)
      .innerJoin(item, eq(collection.itemId, item.id))
      .where(
        and(eq(collection.userId, sql.placeholder('userId')), eq(collection.status, "Owned"))
      )
      .groupBy(item.category)
      .orderBy(desc(count()))
      .prepare("categories_owned");

    // Order Kanban - Contains "Ordered", "Paid", "Shipped" Orders
    this.ordersPrepared = db
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
      .where(and(eq(order.userId, sql.placeholder('userId')), ne(order.status, "Owned")))
      .groupBy(
        order.id,
        order.title,
        order.shop,
        order.status,
        order.releaseMonthYear
      )
      .orderBy(asc(order.releaseMonthYear))
      .limit(10)
      .prepare("orders_kanban");

    // Total Active Orders Count, Total Shipping, Taxes, Duties, Tariffs, Misc Fees
    // This Month Order Count, Shipping, Taxes, Duties, Tariffs, Misc Fees
    this.ordersSummaryPrepared = db
      .select({
        totalActiveOrderCount: sql<string>`COALESCE(${sum(
          sql`CASE WHEN ${order.status} != 'Owned'
              THEN 1 ELSE 0 END`
        )}, 0)`,
        totalShippingAllTime: sql<string>`COALESCE(${sum(order.shippingFee)}, 0)`,
        totalTaxesAllTime: sql<string>`COALESCE(${sum(order.taxes)}, 0)`,
        totalDutiesAllTime: sql<string>`COALESCE(${sum(order.duties)}, 0)`,
        totalTariffsAllTime: sql<string>`COALESCE(${sum(order.tariffs)}, 0)`,
        totalMiscFeesAllTime: sql<string>`COALESCE(${sum(order.miscFees)}, 0)`,
        thisMonthOrderCount: sql<string>`COALESCE(${sum(
          sql`CASE WHEN ${order.releaseMonthYear} >= ${sql.placeholder('currentMonth')}
              AND ${order.releaseMonthYear} < ${sql.placeholder('nextMonth')}
              THEN 1 ELSE 0 END`
        )}, 0)`,
        thisMonthShipping: sql<string>`COALESCE(${sum(
          sql`CASE WHEN ${order.paymentDate} >= ${sql.placeholder('currentMonth')}
              AND ${order.paymentDate} < ${sql.placeholder('nextMonth')}
              THEN ${order.shippingFee} ELSE 0 END`
        )}, 0)`,
        thisMonthTaxes: sql<string>`COALESCE(${sum(
          sql`CASE WHEN ${order.paymentDate} >= ${sql.placeholder('currentMonth')}
              AND ${order.paymentDate} < ${sql.placeholder('nextMonth')}
              THEN ${order.taxes} ELSE 0 END`
        )}, 0)`,
        thisMonthDuties: sql<string>`COALESCE(${sum(
          sql`CASE WHEN ${order.paymentDate} >= ${sql.placeholder('currentMonth')}
              AND ${order.paymentDate} < ${sql.placeholder('nextMonth')}
              THEN ${order.duties} ELSE 0 END`
        )}, 0)`,
        thisMonthTariffs: sql<string>`COALESCE(${sum(
          sql`CASE WHEN ${order.paymentDate} >= ${sql.placeholder('currentMonth')}
              AND ${order.paymentDate} < ${sql.placeholder('nextMonth')}
              THEN ${order.tariffs} ELSE 0 END`
        )}, 0)`,
        thisMonthMiscFees: sql<string>`COALESCE(${sum(
          sql`CASE WHEN ${order.paymentDate} >= ${sql.placeholder('currentMonth')}
              AND ${order.paymentDate} < ${sql.placeholder('nextMonth')}
              THEN ${order.miscFees} ELSE 0 END`
        )}, 0)`,
      })
      .from(order)
      .where(eq(order.userId, sql.placeholder('userId')))
      .prepare("orders_summary");

    // Budget Summary
    this.budgetSummaryPrepared = db
      .select()
      .from(budget)
      .where(eq(budget.userId, sql.placeholder('userId')))
      .prepare("budget_summary");

    // Unpaid Orders
    this.unpaidOrdersPrepared = db
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
          eq(order.userId, sql.placeholder('userId')),
          eq(order.status, "Ordered")
        )
      )
      .orderBy(asc(order.releaseMonthYear))
      .groupBy(order.id, order.title, order.shop, order.releaseMonthYear)
      .prepare("unpaid_orders");

    // Monthly Orders - Order counts grouped by release month for current year
    this.monthlyOrdersPrepared = db
      .select({
        month: sql<number>`EXTRACT(MONTH FROM ${order.releaseMonthYear})`,
        orderCount: count(),
      })
      .from(order)
      .where(
        and(
          eq(order.userId, sql.placeholder('userId')),
          gte(order.releaseMonthYear, sql.placeholder('startOfYear')),
          lte(order.releaseMonthYear, sql.placeholder('endOfYear'))
        )
      )
      .groupBy(sql`EXTRACT(MONTH FROM ${order.releaseMonthYear})`)
      .orderBy(sql`EXTRACT(MONTH FROM ${order.releaseMonthYear})`)
      .prepare("monthly_orders");

    // Release Calendar
    this.releaseCalendarPrepared = db
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
          eq(collection.userId, sql.placeholder('userId')),
          ne(collection.status, "Owned")
        )
      )
      .where(
        and(
          gte(item_release.date, sql.placeholder('startDate')),
          lte(item_release.date, sql.placeholder('endDate'))
        )
      )
      .orderBy(asc(item_release.date))
      .prepare("release_calendar");
  }

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
    ] = await Promise.all([
      // Total Items, Total Spent, Total Spent This Month (Items only)
      this.collectionStatsPrepared.execute({
        userId,
        currentMonth,
        nextMonth,
      }),

      // Categories Owned
      this.categoriesOwnedPrepared.execute({ userId }),

      // Order Kanban
      // Contains "Ordered", "Paid", "Shipped" Orders
      this.ordersPrepared.execute({ userId }),

      // Total Active Orders Count,
      // Total Shipping, Taxes, Duties, Tariffs, Misc Fees
      // This Month Order Count, Shipping, Taxes, Duties, Tariffs, Misc Fees
      this.ordersSummaryPrepared.execute({
        userId,
        currentMonth,
        nextMonth,
      }),

      // Budget Summary
      this.budgetSummaryPrepared.execute({ userId }),

      // Unpaid Orders
      this.unpaidOrdersPrepared.execute({ userId }),

      // Monthly Orders - Order counts grouped by release month for current year
      this.monthlyOrdersPrepared.execute({
        userId,
        startOfYear,
        endOfYear,
      }),
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

    const releases = await this.releaseCalendarPrepared.execute({
      userId,
      startDate,
      endDate,
    });

    return { releases };
  }
}

export default new DashboardService();
