import { db } from "@myakiba/db/client";
import { item, collection, item_release, order } from "@myakiba/db/schema/figure";
import type { Category } from "@myakiba/contracts/shared/types";
import { eq, count, and, sum, asc, sql, desc, ne, gte, lte, exists, or } from "drizzle-orm";
import { toDateOnlyString } from "@myakiba/utils/date-only";

const DASHBOARD_KANBAN_ORDER_LIMIT = 75;

class DashboardService {
  private collectionStatsPrepared;
  private categoriesOwnedPrepared;
  private ordersPrepared;
  private ordersSummaryPrepared;
  private unpaidOrdersPrepared;
  private monthlyOrdersPrepared;
  private releaseCalendarPrepared;
  private monthlySummaryPrepared;
  private monthlyShopBreakdownPrepared;
  private monthlyOrdersKanbanPrepared;

  constructor() {
    // Narrow the monthly dashboard to one filtered order set and build everything else from it.
    const monthlyOrdersBase = db
      .select({
        orderId: order.id,
        title: order.title,
        shop: order.shop,
        status: order.status,
        releaseDate: order.releaseDate,
        shippingFee: order.shippingFee,
        taxes: order.taxes,
        duties: order.duties,
        tariffs: order.tariffs,
        miscFees: order.miscFees,
      })
      .from(order)
      .where(
        and(
          eq(order.userId, sql.placeholder("userId")),
          gte(order.releaseDate, sql.placeholder("startDate")),
          lte(order.releaseDate, sql.placeholder("endDate")),
        ),
      )
      .as("monthly_orders_base");

    // Per-order item counts/totals for the selected month. This avoids rescanning collection
    // separately for KPI totals and shop breakdowns.
    const monthlyOrderItemStats = db
      .select({
        orderId: collection.orderId,
        itemCount: count(collection.id).as("itemCount"),
        itemTotal: sql<number>`COALESCE(${sum(collection.price)}, 0)`.as("itemTotal"),
      })
      .from(collection)
      .innerJoin(order, eq(collection.orderId, order.id))
      .where(
        and(
          eq(order.userId, sql.placeholder("userId")),
          gte(order.releaseDate, sql.placeholder("startDate")),
          lte(order.releaseDate, sql.placeholder("endDate")),
        ),
      )
      .groupBy(collection.orderId)
      .as("monthly_order_item_stats");

    // Reused fee expression so paid/unpaid monthly totals stay consistent everywhere.
    const monthlyOrderFeesTotal = sql<number>`
      COALESCE(${monthlyOrdersBase.shippingFee}, 0)
      + COALESCE(${monthlyOrdersBase.taxes}, 0)
      + COALESCE(${monthlyOrdersBase.duties}, 0)
      + COALESCE(${monthlyOrdersBase.tariffs}, 0)
      + COALESCE(${monthlyOrdersBase.miscFees}, 0)
    `;

    // Shop totals are computed in SQL now instead of merging separate order/item query results in JS.
    const monthlyShopTotalAmount = sql<number>`
      COALESCE(
        SUM(
          COALESCE(${monthlyOrderItemStats.itemTotal}, 0)
          + COALESCE(${monthlyOrdersBase.shippingFee}, 0)
          + COALESCE(${monthlyOrdersBase.taxes}, 0)
          + COALESCE(${monthlyOrdersBase.duties}, 0)
          + COALESCE(${monthlyOrdersBase.tariffs}, 0)
          + COALESCE(${monthlyOrdersBase.miscFees}, 0)
        ),
        0
      )
    `;

    // Total Items, Total Spent
    this.collectionStatsPrepared = db
      .select({
        totalItems: count(sql`CASE WHEN ${collection.status} = 'Owned' THEN 1 END`),
        totalSpent: sql<number>`COALESCE(${sum(sql`CASE WHEN ${collection.status} != 'Ordered' THEN ${collection.price} ELSE 0 END`)}, 0)`,
      })
      .from(collection)
      .where(eq(collection.userId, sql.placeholder("userId")))
      .prepare("collection_stats");

    // Categories Owned
    this.categoriesOwnedPrepared = db
      .select({
        name: sql<Category>`${item.category}::text`,
        count: count(),
        totalValue: sql<number>`COALESCE(${sum(collection.price)}, 0)`,
      })
      .from(collection)
      .innerJoin(item, eq(collection.itemId, item.id))
      .where(and(eq(collection.userId, sql.placeholder("userId")), eq(collection.status, "Owned")))
      .groupBy(item.category)
      .orderBy(desc(count()))
      .prepare("categories_owned");

    // Overview kanban shows recent and near-term order activity across every status.
    this.ordersPrepared = db
      .select({
        orderId: order.id,
        title: order.title,
        shop: order.shop,
        status: order.status,
        releaseDate: order.releaseDate,
        orderDate: order.orderDate,
        paymentDate: order.paymentDate,
        shippingDate: order.shippingDate,
        collectionDate: order.collectionDate,
        itemImages: sql<
          string[]
        >`COALESCE(array_agg(DISTINCT ${item.image}) FILTER (WHERE ${item.image} IS NOT NULL), ARRAY[]::text[])`,
        itemIds: sql<string[]>`COALESCE(array_agg(DISTINCT ${item.id}), ARRAY[]::text[])`,
        total: sql<number>`COALESCE(${sum(collection.price)}, 0) + COALESCE(${order.shippingFee}, 0) + COALESCE(${order.taxes}, 0) + COALESCE(${order.duties}, 0) + COALESCE(${order.tariffs}, 0) + COALESCE(${order.miscFees}, 0)`,
      })
      .from(order)
      .leftJoin(collection, and(eq(order.id, collection.orderId)))
      .leftJoin(item, eq(collection.itemId, item.id))
      .where(
        and(
          eq(order.userId, sql.placeholder("userId")),
          or(
            and(
              eq(order.status, "Owned"),
              gte(order.collectionDate, sql.placeholder("startDate")),
              lte(order.collectionDate, sql.placeholder("endDate")),
            ),
            and(
              ne(order.status, "Owned"),
              or(
                and(
                  gte(order.releaseDate, sql.placeholder("startDate")),
                  lte(order.releaseDate, sql.placeholder("endDate")),
                ),
                and(
                  eq(order.status, "Ordered"),
                  gte(order.orderDate, sql.placeholder("startDate")),
                  lte(order.orderDate, sql.placeholder("endDate")),
                ),
                and(
                  eq(order.status, "Paid"),
                  gte(order.paymentDate, sql.placeholder("startDate")),
                  lte(order.paymentDate, sql.placeholder("endDate")),
                ),
                and(
                  eq(order.status, "Shipped"),
                  gte(order.shippingDate, sql.placeholder("startDate")),
                  lte(order.shippingDate, sql.placeholder("endDate")),
                ),
              ),
            ),
          ),
        ),
      )
      .groupBy(
        order.id,
        order.title,
        order.shop,
        order.status,
        order.releaseDate,
        order.orderDate,
        order.paymentDate,
        order.shippingDate,
        order.collectionDate,
      )
      .orderBy(
        asc(
          sql`COALESCE(${order.collectionDate}, ${order.shippingDate}, ${order.paymentDate}, ${order.orderDate}, ${order.releaseDate})`,
        ),
        asc(order.createdAt),
      )
      .limit(DASHBOARD_KANBAN_ORDER_LIMIT)
      .prepare("orders_kanban");

    // Total Active Orders Count, This Month Order Count, Total Shipping, Taxes, Duties, Tariffs, Misc Fees
    this.ordersSummaryPrepared = db
      .select({
        totalActiveOrderCount: sql<number>`COALESCE(${sum(
          sql`CASE WHEN ${order.status} != 'Owned'
              THEN 1 ELSE 0 END`,
        )}, 0)`,
        totalShippingAllTime: sql<number>`COALESCE(${sum(sql`CASE WHEN ${order.status} != 'Ordered' THEN ${order.shippingFee} ELSE 0 END`)}, 0)`,
        totalTaxesAllTime: sql<number>`COALESCE(${sum(sql`CASE WHEN ${order.status} != 'Ordered' THEN ${order.taxes} ELSE 0 END`)}, 0)`,
        totalDutiesAllTime: sql<number>`COALESCE(${sum(sql`CASE WHEN ${order.status} != 'Ordered' THEN ${order.duties} ELSE 0 END`)}, 0)`,
        totalTariffsAllTime: sql<number>`COALESCE(${sum(sql`CASE WHEN ${order.status} != 'Ordered' THEN ${order.tariffs} ELSE 0 END`)}, 0)`,
        totalMiscFeesAllTime: sql<number>`COALESCE(${sum(sql`CASE WHEN ${order.status} != 'Ordered' THEN ${order.miscFees} ELSE 0 END`)}, 0)`,
      })
      .from(order)
      .where(eq(order.userId, sql.placeholder("userId")))
      .prepare("orders_summary");

    this.unpaidOrdersPrepared = db
      .select({
        orderId: order.id,
        title: order.title,
        shop: order.shop,
        releaseDate: order.releaseDate,
        itemImages: sql<
          string[]
        >`array_agg(DISTINCT ${item.image}) FILTER (WHERE ${item.image} IS NOT NULL)`,
        itemIds: sql<string[]>`array_agg(DISTINCT ${item.id})`,
        total: sql<number>`COALESCE(${sum(collection.price)}, 0) + COALESCE(${order.shippingFee}, 0) + COALESCE(${order.taxes}, 0) + COALESCE(${order.duties}, 0) + COALESCE(${order.tariffs}, 0) + COALESCE(${order.miscFees}, 0)`,
      })
      .from(order)
      .leftJoin(collection, and(eq(order.id, collection.orderId)))
      .leftJoin(item, eq(collection.itemId, item.id))
      .where(and(eq(order.userId, sql.placeholder("userId")), eq(order.status, "Ordered")))
      .orderBy(asc(order.releaseDate))
      .groupBy(order.id, order.title, order.shop, order.releaseDate)
      .prepare("unpaid_orders");

    // Monthly Orders - Order counts grouped by release month for current year
    this.monthlyOrdersPrepared = db
      .select({
        month: sql<number>`EXTRACT(MONTH FROM ${order.releaseDate})`,
        orderCount: count(),
      })
      .from(order)
      .where(
        and(
          eq(order.userId, sql.placeholder("userId")),
          gte(order.releaseDate, sql.placeholder("startOfYear")),
          lte(order.releaseDate, sql.placeholder("endOfYear")),
        ),
      )
      .groupBy(sql`EXTRACT(MONTH FROM ${order.releaseDate})`)
      .orderBy(sql`EXTRACT(MONTH FROM ${order.releaseDate})`)
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
      .where(
        and(
          gte(item_release.date, sql.placeholder("startDate")),
          lte(item_release.date, sql.placeholder("endDate")),
          // Use an existence check instead of joining collection and deduping release rows with GROUP BY.
          exists(
            db
              .select({ itemId: collection.itemId })
              .from(collection)
              .where(
                and(
                  eq(collection.itemId, item.id),
                  eq(collection.userId, sql.placeholder("userId")),
                  ne(collection.status, "Owned"),
                ),
              ),
          ),
        ),
      )
      .orderBy(asc(item_release.date))
      .prepare("release_calendar");

    // Single monthly KPI query: order counts, item totals, fees, and paid/unpaid splits.
    this.monthlySummaryPrepared = db
      .select({
        orderCount: count(monthlyOrdersBase.orderId),
        unpaidOrderCount: sql<number>`COALESCE(SUM(CASE WHEN ${monthlyOrdersBase.status} = 'Ordered' THEN 1 ELSE 0 END), 0)`,
        itemCount: sql<number>`COALESCE(SUM(COALESCE(${monthlyOrderItemStats.itemCount}, 0)), 0)`,
        paidItemTotal: sql<number>`COALESCE(SUM(CASE WHEN ${monthlyOrdersBase.status} != 'Ordered' THEN COALESCE(${monthlyOrderItemStats.itemTotal}, 0) ELSE 0 END), 0)`,
        unpaidItemTotal: sql<number>`COALESCE(SUM(CASE WHEN ${monthlyOrdersBase.status} = 'Ordered' THEN COALESCE(${monthlyOrderItemStats.itemTotal}, 0) ELSE 0 END), 0)`,
        shipping: sql<number>`COALESCE(SUM(COALESCE(${monthlyOrdersBase.shippingFee}, 0)), 0)`,
        taxes: sql<number>`COALESCE(SUM(COALESCE(${monthlyOrdersBase.taxes}, 0)), 0)`,
        duties: sql<number>`COALESCE(SUM(COALESCE(${monthlyOrdersBase.duties}, 0)), 0)`,
        tariffs: sql<number>`COALESCE(SUM(COALESCE(${monthlyOrdersBase.tariffs}, 0)), 0)`,
        miscFees: sql<number>`COALESCE(SUM(COALESCE(${monthlyOrdersBase.miscFees}, 0)), 0)`,
        paidFees: sql<number>`COALESCE(SUM(CASE WHEN ${monthlyOrdersBase.status} != 'Ordered' THEN ${monthlyOrderFeesTotal} ELSE 0 END), 0)`,
        unpaidFees: sql<number>`COALESCE(SUM(CASE WHEN ${monthlyOrdersBase.status} = 'Ordered' THEN ${monthlyOrderFeesTotal} ELSE 0 END), 0)`,
      })
      .from(monthlyOrdersBase)
      .leftJoin(monthlyOrderItemStats, eq(monthlyOrdersBase.orderId, monthlyOrderItemStats.orderId))
      .prepare("monthly_summary");

    // Shop breakdown is now assembled entirely in SQL from the shared monthly subqueries.
    this.monthlyShopBreakdownPrepared = db
      .select({
        shopName: monthlyOrdersBase.shop,
        orderCount: count(monthlyOrdersBase.orderId),
        totalAmount: monthlyShopTotalAmount,
      })
      .from(monthlyOrdersBase)
      .leftJoin(monthlyOrderItemStats, eq(monthlyOrdersBase.orderId, monthlyOrderItemStats.orderId))
      .groupBy(monthlyOrdersBase.shop)
      .orderBy(desc(monthlyShopTotalAmount))
      .prepare("monthly_shop_breakdown");

    // Monthly kanban keeps release-month orders plus owned orders collected in that month.
    this.monthlyOrdersKanbanPrepared = db
      .select({
        orderId: order.id,
        title: order.title,
        shop: order.shop,
        status: order.status,
        releaseDate: order.releaseDate,
        orderDate: order.orderDate,
        paymentDate: order.paymentDate,
        shippingDate: order.shippingDate,
        collectionDate: order.collectionDate,
        itemImages: sql<
          string[]
        >`COALESCE(array_agg(DISTINCT ${item.image}) FILTER (WHERE ${item.image} IS NOT NULL), ARRAY[]::text[])`,
        itemIds: sql<string[]>`COALESCE(array_agg(DISTINCT ${item.id}), ARRAY[]::text[])`,
        total: sql<number>`COALESCE(${sum(collection.price)}, 0) + COALESCE(${order.shippingFee}, 0) + COALESCE(${order.taxes}, 0) + COALESCE(${order.duties}, 0) + COALESCE(${order.tariffs}, 0) + COALESCE(${order.miscFees}, 0)`,
      })
      .from(order)
      .leftJoin(collection, and(eq(order.id, collection.orderId)))
      .leftJoin(item, eq(collection.itemId, item.id))
      .where(
        and(
          eq(order.userId, sql.placeholder("userId")),
          or(
            and(
              ne(order.status, "Owned"),
              gte(order.releaseDate, sql.placeholder("startDate")),
              lte(order.releaseDate, sql.placeholder("endDate")),
            ),
            and(
              eq(order.status, "Owned"),
              gte(order.collectionDate, sql.placeholder("startDate")),
              lte(order.collectionDate, sql.placeholder("endDate")),
            ),
          ),
        ),
      )
      .groupBy(
        order.id,
        order.title,
        order.shop,
        order.status,
        order.releaseDate,
        order.orderDate,
        order.paymentDate,
        order.shippingDate,
        order.collectionDate,
      )
      .orderBy(
        asc(sql`COALESCE(${order.collectionDate}, ${order.releaseDate})`),
        asc(order.createdAt),
      )
      .limit(DASHBOARD_KANBAN_ORDER_LIMIT)
      .prepare("monthly_orders_kanban");
  }

  async getDashboard(userId: string) {
    const now = new Date();
    const currentMonth = toDateOnlyString(new Date(now.getFullYear(), now.getMonth(), 1));
    const nextMonth = toDateOnlyString(new Date(now.getFullYear(), now.getMonth() + 1, 1));
    const overviewStartDate = toDateOnlyString(new Date(now.getFullYear(), now.getMonth() - 2, 1));
    const overviewEndDate = toDateOnlyString(new Date(now.getFullYear(), now.getMonth() + 3, 0));
    const startOfYear = toDateOnlyString(new Date(now.getFullYear(), 0, 1));
    const endOfYear = toDateOnlyString(new Date(now.getFullYear() + 1, 0, 1));

    const [
      collectionStatsRows,
      categoriesOwned,
      orders,
      ordersSummaryRows,
      unpaidOrders,
      monthlyOrders,
    ] = await Promise.all([
      this.collectionStatsPrepared.execute({ userId }),

      this.categoriesOwnedPrepared.execute({ userId }),

      this.ordersPrepared.execute({
        userId,
        startDate: overviewStartDate,
        endDate: overviewEndDate,
      }),

      this.ordersSummaryPrepared.execute({
        userId,
        currentMonth,
        nextMonth,
      }),

      this.unpaidOrdersPrepared.execute({ userId }),

      this.monthlyOrdersPrepared.execute({
        userId,
        startOfYear,
        endOfYear,
      }),
    ]);

    const collectionStats = collectionStatsRows[0] ?? {
      totalItems: 0,
      totalSpent: 0,
    };
    const ordersSummary = ordersSummaryRows[0] ?? {
      totalActiveOrderCount: 0,
      totalShippingAllTime: 0,
      totalTaxesAllTime: 0,
      totalDutiesAllTime: 0,
      totalTariffsAllTime: 0,
      totalMiscFeesAllTime: 0,
    };

    return {
      collectionStats,
      categoriesOwned,
      orders,
      ordersSummary,
      unpaidOrders,
      monthlyOrders,
    };
  }

  async getReleaseCalendar(userId: string, month: number, year: number) {
    const startDate = toDateOnlyString(new Date(year, month - 1, 1));
    const endDate = toDateOnlyString(new Date(year, month, 0));

    const releases = await this.releaseCalendarPrepared.execute({
      userId,
      startDate,
      endDate,
    });

    return { releases };
  }

  async getMonthlyDashboard(userId: string, month: number, year: number) {
    const startDate = toDateOnlyString(new Date(year, month - 1, 1));
    const endDate = toDateOnlyString(new Date(year, month, 0));
    const params = { userId, startDate, endDate };

    // The monthly response now comes from three queries instead of multiple overlapping scans.
    const [monthlySummaryRows, shopBreakdownRows, orders] = await Promise.all([
      this.monthlySummaryPrepared.execute(params),
      this.monthlyShopBreakdownPrepared.execute(params),
      this.monthlyOrdersKanbanPrepared.execute(params),
    ]);

    const monthlySummary = monthlySummaryRows[0] ?? {
      itemCount: 0,
      orderCount: 0,
      unpaidOrderCount: 0,
      paidItemTotal: 0,
      unpaidItemTotal: 0,
      shipping: 0,
      taxes: 0,
      duties: 0,
      tariffs: 0,
      miscFees: 0,
      paidFees: 0,
      unpaidFees: 0,
    };
    const shopBreakdown = shopBreakdownRows.map((row) => ({
      shopName: row.shopName,
      orderCount: row.orderCount,
      totalAmount: Number(row.totalAmount),
    }));
    const costBreakdown = {
      items: Number(monthlySummary.paidItemTotal) + Number(monthlySummary.unpaidItemTotal),
      shipping: Number(monthlySummary.shipping),
      taxes: Number(monthlySummary.taxes),
      duties: Number(monthlySummary.duties),
      tariffs: Number(monthlySummary.tariffs),
      miscFees: Number(monthlySummary.miscFees),
    };

    return {
      itemCount: Number(monthlySummary.itemCount),
      orderCount: monthlySummary.orderCount,
      unpaidOrderCount: Number(monthlySummary.unpaidOrderCount),
      paidAmount: Number(monthlySummary.paidItemTotal) + Number(monthlySummary.paidFees),
      unpaidAmount: Number(monthlySummary.unpaidItemTotal) + Number(monthlySummary.unpaidFees),
      shopBreakdown,
      costBreakdown,
      orders,
    };
  }
}

export default new DashboardService();
