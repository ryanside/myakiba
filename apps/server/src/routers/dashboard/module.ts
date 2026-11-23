import { eq, count, and, sum, asc, sql, desc, ne, gte, lt, lte, exists, or } from "drizzle-orm";
import { item, collection, item_release, order } from "@myakiba/db/schema/figure";
import type { ReadTx } from "@myakiba/db/tx";
import type { Category } from "@myakiba/contracts/shared/types";
import { getDateOnlyMonthBounds, toDateOnlyString } from "@myakiba/utils/date-only";
import { orderPreviewImagesSql, orderPreviewItemIdsSql } from "@/lib/order-preview";
import { Result } from "better-result";
import { prepared, query } from "@/domain/kernel";
import { itemImageSql } from "@/lib/item-image-url";
import {
  itemOrderJoin,
  orderIsPaid,
  orderIsUnpaid,
  orderSpend,
  orderTotal,
  orderUnpaidCosts,
  paidItemPrice,
  selectUnpaidCosts,
} from "@/lib/order-money";

const DASHBOARD_KANBAN_ORDER_LIMIT = 75;

type MonthQuery = { readonly month: number; readonly year: number };

function ordersReleasingInMonth(tx: ReadTx) {
  return tx
    .select({
      orderId: order.id,
      shop: order.shop,
      isUnpaid: sql<boolean>`${orderIsUnpaid}`.as("is_unpaid"),
      itemCount: count(collection.id).as("item_count"),
      itemTotal: sql<number>`COALESCE(${sum(collection.price)}, 0)`.as("item_total"),
      shippingFee: order.shippingFee,
      taxes: order.taxes,
      duties: order.duties,
      tariffs: order.tariffs,
      miscFees: order.miscFees,
      total: orderTotal.as("total"),
      spend: orderSpend.as("spend"),
      unpaidCosts: orderUnpaidCosts.as("unpaid_costs"),
    })
    .from(order)
    .leftJoin(collection, eq(order.id, collection.orderId))
    .where(
      and(
        eq(order.userId, sql.placeholder("userId")),
        gte(order.releaseDate, sql.placeholder("startDate")),
        lte(order.releaseDate, sql.placeholder("endDate")),
      ),
    )
    .groupBy(order.id)
    .as("monthly_orders");
}

const collectionStatsRead = prepared("collection_stats", (tx) =>
  tx
    .select({
      totalItems: count(sql`CASE WHEN ${collection.status} = 'Owned' THEN 1 END`),
      totalSpent: sql<number>`COALESCE(${sum(paidItemPrice)}, 0)`.mapWith(Number),
    })
    .from(collection)
    .leftJoin(...itemOrderJoin)
    .where(eq(collection.userId, sql.placeholder("userId"))),
);

const categoriesOwnedRead = prepared("categories_owned", (tx) =>
  tx
    .select({
      name: sql<Category>`${item.category}::text`,
      count: count(),
      totalValue: sql<number>`COALESCE(${sum(paidItemPrice)}, 0)`.mapWith(Number),
    })
    .from(collection)
    .leftJoin(...itemOrderJoin)
    .innerJoin(item, eq(collection.itemId, item.id))
    .where(and(eq(collection.userId, sql.placeholder("userId")), eq(collection.status, "Owned")))
    .groupBy(item.category)
    .orderBy(desc(count()), asc(item.category)),
);

const ordersRead = prepared("orders_kanban", (tx) =>
  tx
    .select({
      orderId: order.id,
      title: order.title,
      shop: order.shop,
      status: order.status,
      paid: order.paid,
      releaseDate: order.releaseDate,
      orderDate: order.orderDate,
      paymentDate: order.paymentDate,
      shippingDate: order.shippingDate,
      collectionDate: order.collectionDate,
      itemImages: orderPreviewImagesSql,
      itemIds: orderPreviewItemIdsSql,
      total: orderTotal,
    })
    .from(order)
    .leftJoin(collection, and(eq(order.id, collection.orderId)))
    .where(
      and(
        eq(order.userId, sql.placeholder("userId")),
        or(
          and(
            gte(order.releaseDate, sql.placeholder("startDate")),
            lte(order.releaseDate, sql.placeholder("endDate")),
          ),
          and(
            gte(order.orderDate, sql.placeholder("startDate")),
            lte(order.orderDate, sql.placeholder("endDate")),
          ),
          and(
            gte(order.paymentDate, sql.placeholder("startDate")),
            lte(order.paymentDate, sql.placeholder("endDate")),
          ),
          and(
            gte(order.shippingDate, sql.placeholder("startDate")),
            lte(order.shippingDate, sql.placeholder("endDate")),
          ),
          and(
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
      order.paid,
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
      asc(order.id),
    )
    .limit(DASHBOARD_KANBAN_ORDER_LIMIT),
);

const ordersSummaryRead = prepared("orders_summary", (tx) =>
  tx
    .select({
      totalActiveOrderCount: sql<number>`COALESCE(${sum(
        sql`CASE WHEN ${order.status} != 'Owned'
              THEN 1 ELSE 0 END`,
      )}, 0)`.mapWith(Number),
      totalShippingAllTime:
        sql<number>`COALESCE(${sum(sql`CASE WHEN ${orderIsPaid} THEN ${order.shippingFee} ELSE 0 END`)}, 0)`.mapWith(
          Number,
        ),
      totalTaxesAllTime:
        sql<number>`COALESCE(${sum(sql`CASE WHEN ${orderIsPaid} THEN ${order.taxes} ELSE 0 END`)}, 0)`.mapWith(
          Number,
        ),
      totalDutiesAllTime:
        sql<number>`COALESCE(${sum(sql`CASE WHEN ${orderIsPaid} THEN ${order.duties} ELSE 0 END`)}, 0)`.mapWith(
          Number,
        ),
      totalTariffsAllTime:
        sql<number>`COALESCE(${sum(sql`CASE WHEN ${orderIsPaid} THEN ${order.tariffs} ELSE 0 END`)}, 0)`.mapWith(
          Number,
        ),
      totalMiscFeesAllTime:
        sql<number>`COALESCE(${sum(sql`CASE WHEN ${orderIsPaid} THEN ${order.miscFees} ELSE 0 END`)}, 0)`.mapWith(
          Number,
        ),
    })
    .from(order)
    .where(eq(order.userId, sql.placeholder("userId"))),
);

const unpaidSummaryRead = prepared("unpaid_summary", (tx) =>
  selectUnpaidCosts(tx, eq(order.userId, sql.placeholder("userId"))),
);

const monthlyOrdersRead = prepared("monthly_orders", (tx) =>
  tx
    .select({
      month: sql<number>`EXTRACT(MONTH FROM ${order.releaseDate})`.mapWith(Number),
      orderCount: count(),
    })
    .from(order)
    .where(
      and(
        eq(order.userId, sql.placeholder("userId")),
        gte(order.releaseDate, sql.placeholder("startOfYear")),
        lt(order.releaseDate, sql.placeholder("startOfNextYear")),
      ),
    )
    .groupBy(sql`EXTRACT(MONTH FROM ${order.releaseDate})`)
    .orderBy(sql`EXTRACT(MONTH FROM ${order.releaseDate})`),
);

const releaseCalendarRead = prepared("release_calendar", (tx) =>
  tx
    .select({
      releaseId: item_release.id,
      itemId: item.id,
      itemExternalId: item.externalId,
      title: item.title,
      image: itemImageSql().as("image"),
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
        exists(
          tx
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
    .orderBy(asc(item_release.date), asc(item.title), asc(item.id), asc(item_release.id)),
);

const monthlySummaryRead = prepared("monthly_summary", (tx) => {
  const orders = ordersReleasingInMonth(tx);
  return tx
    .select({
      orderCount: count(orders.orderId),
      unpaidOrderCount: sql<number>`COUNT(*) FILTER (WHERE ${orders.isUnpaid})`.mapWith(Number),
      itemCount: sql<number>`COALESCE(SUM(${orders.itemCount}), 0)`.mapWith(Number),
      items: sql<number>`COALESCE(SUM(${orders.itemTotal}), 0)`.mapWith(Number),
      shipping: sql<number>`COALESCE(SUM(${orders.shippingFee}), 0)`.mapWith(Number),
      taxes: sql<number>`COALESCE(SUM(${orders.taxes}), 0)`.mapWith(Number),
      duties: sql<number>`COALESCE(SUM(${orders.duties}), 0)`.mapWith(Number),
      tariffs: sql<number>`COALESCE(SUM(${orders.tariffs}), 0)`.mapWith(Number),
      miscFees: sql<number>`COALESCE(SUM(${orders.miscFees}), 0)`.mapWith(Number),
      paidAmount: sql<number>`COALESCE(SUM(${orders.spend}), 0)`.mapWith(Number),
      unpaidAmount: sql<number>`COALESCE(SUM(${orders.unpaidCosts}), 0)`.mapWith(Number),
    })
    .from(orders);
});

const monthlyShopBreakdownRead = prepared("monthly_shop_breakdown", (tx) => {
  const orders = ordersReleasingInMonth(tx);
  const totalAmount = sql<number>`COALESCE(SUM(${orders.total}), 0)`.mapWith(Number);
  return tx
    .select({
      shopName: orders.shop,
      orderCount: count(orders.orderId),
      totalAmount,
    })
    .from(orders)
    .groupBy(orders.shop)
    .orderBy(desc(totalAmount), asc(orders.shop));
});

const monthlyOrdersKanbanRead = prepared("monthly_orders_kanban", (tx) => {
  return tx
    .select({
      orderId: order.id,
      title: order.title,
      shop: order.shop,
      status: order.status,
      paid: order.paid,
      releaseDate: order.releaseDate,
      orderDate: order.orderDate,
      paymentDate: order.paymentDate,
      shippingDate: order.shippingDate,
      collectionDate: order.collectionDate,
      itemImages: orderPreviewImagesSql,
      itemIds: orderPreviewItemIdsSql,
      total: orderTotal,
    })
    .from(order)
    .leftJoin(collection, and(eq(order.id, collection.orderId)))
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
      order.paid,
      order.releaseDate,
      order.orderDate,
      order.paymentDate,
      order.shippingDate,
      order.collectionDate,
    )
    .orderBy(
      asc(sql`COALESCE(${order.collectionDate}, ${order.releaseDate})`),
      asc(order.createdAt),
      asc(order.id),
    )
    .limit(DASHBOARD_KANBAN_ORDER_LIMIT);
});

export const Dashboard = {
  overview: query(
    { action: "get_dashboard", failure: "Failed to get dashboard data" },
    async (scope) => {
      const userId = scope.viewer.userId;
      const now = new Date();
      const currentYear = now.getUTCFullYear();
      const currentMonthIndex = now.getUTCMonth();
      const overviewStartDate = toDateOnlyString(
        new Date(Date.UTC(currentYear, currentMonthIndex - 2, 1)),
      );
      const overviewEndDate = toDateOnlyString(
        new Date(Date.UTC(currentYear, currentMonthIndex + 3, 0)),
      );
      const startOfYear = `${currentYear}-01-01`;
      const startOfNextYear = `${currentYear + 1}-01-01`;

      const [
        collectionStatsRows,
        categoriesOwned,
        orders,
        ordersSummaryRows,
        unpaidSummaryRows,
        monthlyOrders,
      ] = await Promise.all([
        scope.read(collectionStatsRead, { userId }),

        scope.read(categoriesOwnedRead, { userId }),

        scope.read(ordersRead, {
          userId,
          startDate: overviewStartDate,
          endDate: overviewEndDate,
        }),

        scope.read(ordersSummaryRead, {
          userId,
        }),

        scope.read(unpaidSummaryRead, { userId }),

        scope.read(monthlyOrdersRead, {
          userId,
          startOfYear,
          startOfNextYear,
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
      const { unpaidOrderCount, unpaidCosts } = unpaidSummaryRows[0] ?? {
        unpaidOrderCount: 0,
        unpaidCosts: 0,
      };

      return Result.ok({
        collectionStats,
        categoriesOwned,
        orders,
        ordersSummary,
        unpaidOrderCount,
        unpaidCosts,
        monthlyOrders,
      });
    },
  ),

  releaseCalendar: query(
    { action: "get_release_calendar", failure: "Failed to get release calendar data" },
    async (scope, input: MonthQuery) => {
      scope.log.set({ query: { month: input.month, year: input.year } });
      const userId = scope.viewer.userId;
      const { start: startDate, end: endDate } = getDateOnlyMonthBounds(input.year, input.month);

      const releases = await scope.read(releaseCalendarRead, {
        userId,
        startDate,
        endDate,
      });

      return Result.ok({ releaseCalendar: { releases } });
    },
  ),

  monthly: query(
    { action: "get_monthly_dashboard", failure: "Failed to get monthly dashboard data" },
    async (scope, input: MonthQuery) => {
      scope.log.set({ query: { month: input.month, year: input.year } });
      const userId = scope.viewer.userId;
      const { start: startDate, end: endDate } = getDateOnlyMonthBounds(input.year, input.month);
      const params = { userId, startDate, endDate };

      const [monthlySummaryRows, shopBreakdownRows, orders] = await Promise.all([
        scope.read(monthlySummaryRead, params),
        scope.read(monthlyShopBreakdownRead, params),
        scope.read(monthlyOrdersKanbanRead, params),
      ]);

      const monthlySummary = monthlySummaryRows[0] ?? {
        itemCount: 0,
        orderCount: 0,
        unpaidOrderCount: 0,
        items: 0,
        shipping: 0,
        taxes: 0,
        duties: 0,
        tariffs: 0,
        miscFees: 0,
        paidAmount: 0,
        unpaidAmount: 0,
      };
      const { items, shipping, taxes, duties, tariffs, miscFees } = monthlySummary;

      return Result.ok({
        itemCount: monthlySummary.itemCount,
        orderCount: monthlySummary.orderCount,
        unpaidOrderCount: monthlySummary.unpaidOrderCount,
        paidAmount: monthlySummary.paidAmount,
        unpaidAmount: monthlySummary.unpaidAmount,
        shopBreakdown: shopBreakdownRows,
        costBreakdown: { items, shipping, taxes, duties, tariffs, miscFees },
        orders,
      });
    },
  ),
};
