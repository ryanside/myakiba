import type { OrderStatus } from "@myakiba/contracts/shared/types";
import { DEFAULT_LIMIT } from "@myakiba/contracts/shared/constants";
import { db } from "@myakiba/db/client";
import { collection, item, order } from "@myakiba/db/schema/figure";
import { and, desc, eq, gte, ilike, inArray, isNull, lte, or, sql } from "drizzle-orm";
import {
  ACTUAL_STATUSES,
  ITEMS_PER_SHOP,
  TOP_DRIVERS,
  TOP_ORDERS_PER_SHOP,
  UNPAID_ORDER_PREVIEW,
  UNPAID_STATUSES,
  UNKNOWN_SHOP,
} from "./model";
import type {
  ExpenseFilters,
  ExpenseOrder,
  ExpenseShopsFilters,
  ExpenseShopsResponse,
  ExpenseTotals,
  ExpensesOverviewResponse,
  MonthlyExpenseTrendEntry,
  MoneyValue,
  OrderDetail,
  PagedRows,
  ShopAggregate,
  ShopExpansionItem,
  ShopExpansionResponse,
  ShopSpendRow,
  SpendQuery,
} from "./model";

function orderBase(q: SpendQuery) {
  const statusLiterals = sql.join(
    q.statuses.map((status) => sql`${status}`),
    sql`, `,
  );
  const orderStatusOk = sql<boolean>`${order.status} IN (${statusLiterals})`;
  const collectionStatusOk = sql<boolean>`${collection.status} IN (${statusLiterals})`;
  const itemSpend =
    sql<MoneyValue>`COALESCE(SUM(CASE WHEN ${collectionStatusOk} THEN ${collection.price} ELSE 0 END), 0)`.as(
      "itemSpend",
    );
  const itemCount =
    sql<number>`COUNT(CASE WHEN ${collectionStatusOk} THEN ${collection.id} END)`.as("itemCount");
  const shipping =
    sql<MoneyValue>`CASE WHEN ${orderStatusOk} THEN COALESCE(${order.shippingFee}, 0) ELSE 0 END`.as(
      "shipping",
    );
  const taxes =
    sql<MoneyValue>`CASE WHEN ${orderStatusOk} THEN COALESCE(${order.taxes}, 0) ELSE 0 END`.as(
      "taxes",
    );
  const duties =
    sql<MoneyValue>`CASE WHEN ${orderStatusOk} THEN COALESCE(${order.duties}, 0) ELSE 0 END`.as(
      "duties",
    );
  const tariffs =
    sql<MoneyValue>`CASE WHEN ${orderStatusOk} THEN COALESCE(${order.tariffs}, 0) ELSE 0 END`.as(
      "tariffs",
    );
  const miscFees =
    sql<MoneyValue>`CASE WHEN ${orderStatusOk} THEN COALESCE(${order.miscFees}, 0) ELSE 0 END`.as(
      "miscFees",
    );

  return db
    .select({
      orderId: order.id,
      shop: order.shop,
      month:
        sql<string>`COALESCE(to_char(COALESCE(${order.paymentDate}, ${order.orderDate}, ${order.releaseDate})::date, 'YYYY-MM'), 'Undated')`.as(
          "month",
        ),
      itemSpend,
      itemCount,
      shipping,
      taxes,
      duties,
      tariffs,
      miscFees,
    })
    .from(order)
    .leftJoin(collection, eq(order.id, collection.orderId))
    .where(
      and(
        eq(order.userId, q.userId),
        q.shops ? inArray(order.shop, q.shops) : undefined,
        q.dateStart
          ? gte(
              sql<
                string | Date | null
              >`COALESCE(${order.paymentDate}, ${order.orderDate}, ${order.releaseDate})`,
              q.dateStart,
            )
          : undefined,
        q.dateEnd
          ? lte(
              sql<
                string | Date | null
              >`COALESCE(${order.paymentDate}, ${order.orderDate}, ${order.releaseDate})`,
              q.dateEnd,
            )
          : undefined,
        or(inArray(order.status, q.statuses), inArray(collection.status, q.statuses)),
      ),
    )
    .groupBy(
      order.id,
      order.shop,
      order.paymentDate,
      order.orderDate,
      order.releaseDate,
      order.status,
      order.shippingFee,
      order.taxes,
      order.duties,
      order.tariffs,
      order.miscFees,
    )
    .as("order_expense_base");
}

function toExpenseOrder(row: OrderDetail): ExpenseOrder {
  return {
    orderId: row.orderId,
    title: row.title,
    shop: row.shop.trim() === "" ? UNKNOWN_SHOP : row.shop,
    status: row.status,
    expenseDate: row.expenseDate,
    images: [...row.images],
    itemSpend: row.itemSpend,
    shipping: row.shipping,
    taxes: row.taxes,
    duties: row.duties,
    tariffs: row.tariffs,
    miscFees: row.miscFees,
    feeSpend: row.feeSpend,
    totalSpend: row.totalSpend,
  };
}

async function loadOrderDetails(q: SpendQuery, limit: number): Promise<PagedRows<OrderDetail>> {
  const statusLiterals = sql.join(
    q.statuses.map((status) => sql`${status}`),
    sql`, `,
  );
  const orderStatusOk = sql<boolean>`${order.status} IN (${statusLiterals})`;
  const collectionStatusOk = sql<boolean>`${collection.status} IN (${statusLiterals})`;
  const expenseDate = sql<
    string | Date | null
  >`COALESCE(${order.paymentDate}, ${order.orderDate}, ${order.releaseDate})`;
  const itemSpend = sql<MoneyValue>`COALESCE(SUM(CASE WHEN ${collectionStatusOk} THEN ${collection.price} ELSE 0 END), 0)`;
  const itemCount = sql<number>`COUNT(CASE WHEN ${collectionStatusOk} THEN ${collection.id} END)`;
  const shipping = sql<MoneyValue>`CASE WHEN ${orderStatusOk} THEN COALESCE(${order.shippingFee}, 0) ELSE 0 END`;
  const taxes = sql<MoneyValue>`CASE WHEN ${orderStatusOk} THEN COALESCE(${order.taxes}, 0) ELSE 0 END`;
  const duties = sql<MoneyValue>`CASE WHEN ${orderStatusOk} THEN COALESCE(${order.duties}, 0) ELSE 0 END`;
  const tariffs = sql<MoneyValue>`CASE WHEN ${orderStatusOk} THEN COALESCE(${order.tariffs}, 0) ELSE 0 END`;
  const miscFees = sql<MoneyValue>`CASE WHEN ${orderStatusOk} THEN COALESCE(${order.miscFees}, 0) ELSE 0 END`;
  const feeSpend = sql<MoneyValue>`${shipping} + ${taxes} + ${duties} + ${tariffs} + ${miscFees}`;
  const totalSpend = sql<MoneyValue>`${itemSpend} + ${feeSpend}`;

  const rows = await db
    .select({
      orderId: order.id,
      title: order.title,
      shop: order.shop,
      status: sql<OrderStatus>`${order.status}::text`,
      expenseDate,
      images: sql<string[]>`
        COALESCE(
          ARRAY_AGG(DISTINCT ${item.image}) FILTER (WHERE ${item.image} IS NOT NULL),
          ARRAY[]::text[]
        )
      `,
      itemSpend,
      itemCount,
      shipping,
      taxes,
      duties,
      tariffs,
      miscFees,
      feeSpend,
      totalSpend,
      totalCount: sql<number>`COUNT(*) OVER()`,
    })
    .from(order)
    .leftJoin(collection, eq(order.id, collection.orderId))
    .leftJoin(item, eq(collection.itemId, item.id))
    .where(
      and(
        eq(order.userId, q.userId),
        q.shops ? inArray(order.shop, q.shops) : undefined,
        q.dateStart ? gte(expenseDate, q.dateStart) : undefined,
        q.dateEnd ? lte(expenseDate, q.dateEnd) : undefined,
        or(inArray(order.status, q.statuses), inArray(collection.status, q.statuses)),
      ),
    )
    .groupBy(
      order.id,
      order.title,
      order.shop,
      order.status,
      order.paymentDate,
      order.orderDate,
      order.releaseDate,
      order.shippingFee,
      order.taxes,
      order.duties,
      order.tariffs,
      order.miscFees,
    )
    .orderBy(desc(totalSpend))
    .limit(limit);

  return {
    rows: rows.map((row) => ({
      orderId: row.orderId,
      title: row.title,
      shop: row.shop,
      status: row.status,
      expenseDate:
        typeof row.expenseDate === "string"
          ? row.expenseDate
          : (row.expenseDate?.toISOString().slice(0, 10) ?? null),
      images: row.images.slice(0, 4),
      itemSpend: Number(row.itemSpend),
      itemCount: Number(row.itemCount),
      shipping: Number(row.shipping),
      taxes: Number(row.taxes),
      duties: Number(row.duties),
      tariffs: Number(row.tariffs),
      miscFees: Number(row.miscFees),
      feeSpend: Number(row.feeSpend),
      totalSpend: Number(row.totalSpend),
      totalCount: Number(row.totalCount),
    })),
    total: rows[0]?.totalCount ?? 0,
  };
}

async function loadOrderTotals(q: SpendQuery): Promise<ExpenseTotals> {
  const base = orderBase(q);
  const [row] = await db
    .select({
      items: sql<MoneyValue>`COALESCE(SUM(${base.itemSpend}), 0)`,
      shipping: sql<MoneyValue>`COALESCE(SUM(${base.shipping}), 0)`,
      taxes: sql<MoneyValue>`COALESCE(SUM(${base.taxes}), 0)`,
      duties: sql<MoneyValue>`COALESCE(SUM(${base.duties}), 0)`,
      tariffs: sql<MoneyValue>`COALESCE(SUM(${base.tariffs}), 0)`,
      miscFees: sql<MoneyValue>`COALESCE(SUM(${base.miscFees}), 0)`,
      orderCount: sql<number>`COUNT(*)`,
      itemCount: sql<number>`COALESCE(SUM(${base.itemCount}), 0)`,
    })
    .from(base);

  return row
    ? {
        items: Number(row.items ?? 0),
        shipping: Number(row.shipping ?? 0),
        taxes: Number(row.taxes ?? 0),
        duties: Number(row.duties ?? 0),
        tariffs: Number(row.tariffs ?? 0),
        miscFees: Number(row.miscFees ?? 0),
        orderCount: Number(row.orderCount),
        itemCount: Number(row.itemCount),
      }
    : {
        items: 0,
        shipping: 0,
        taxes: 0,
        duties: 0,
        tariffs: 0,
        miscFees: 0,
        orderCount: 0,
        itemCount: 0,
      };
}

async function loadItemTotals(q: SpendQuery): Promise<ExpenseTotals> {
  const [row] = await db
    .select({
      items: sql<MoneyValue>`COALESCE(SUM(${collection.price}), 0)`,
      itemCount: sql<number>`COUNT(*)`,
    })
    .from(collection)
    .where(
      and(
        eq(collection.userId, q.userId),
        isNull(collection.orderId),
        inArray(collection.status, q.statuses),
        q.shops ? inArray(collection.shop, q.shops) : undefined,
        q.dateStart ? gte(collection.paymentDate, q.dateStart) : undefined,
        q.dateEnd ? lte(collection.paymentDate, q.dateEnd) : undefined,
      ),
    );

  return {
    items: Number(row?.items ?? 0),
    shipping: 0,
    taxes: 0,
    duties: 0,
    tariffs: 0,
    miscFees: 0,
    orderCount: 0,
    itemCount: Number(row?.itemCount ?? 0),
  };
}

async function loadShopItems(
  q: SpendQuery,
  dbShop: string,
): Promise<{ readonly rows: readonly ShopExpansionItem[]; readonly total: number }> {
  const rows = await db
    .select({
      collectionId: collection.id,
      itemId: item.id,
      externalId: item.externalId,
      title: item.title,
      image: item.image,
      totalCount: sql<number>`COUNT(*) OVER()`,
    })
    .from(collection)
    .innerJoin(item, eq(collection.itemId, item.id))
    .where(
      and(
        eq(collection.userId, q.userId),
        inArray(collection.status, q.statuses),
        eq(collection.shop, dbShop),
        q.dateStart ? gte(collection.paymentDate, q.dateStart) : undefined,
        q.dateEnd ? lte(collection.paymentDate, q.dateEnd) : undefined,
      ),
    )
    .orderBy(desc(collection.price))
    .limit(ITEMS_PER_SHOP);

  return {
    rows: rows.map((row) => ({
      collectionId: row.collectionId,
      itemId: row.itemId,
      externalId: row.externalId,
      title: row.title,
      image: row.image,
    })),
    total: rows[0]?.totalCount ?? 0,
  };
}

async function loadTotals(q: SpendQuery): Promise<ExpenseTotals> {
  const [orderTotals, itemTotals] = await Promise.all([loadOrderTotals(q), loadItemTotals(q)]);
  return {
    items: orderTotals.items + itemTotals.items,
    shipping: orderTotals.shipping + itemTotals.shipping,
    taxes: orderTotals.taxes + itemTotals.taxes,
    duties: orderTotals.duties + itemTotals.duties,
    tariffs: orderTotals.tariffs + itemTotals.tariffs,
    miscFees: orderTotals.miscFees + itemTotals.miscFees,
    orderCount: orderTotals.orderCount + itemTotals.orderCount,
    itemCount: orderTotals.itemCount + itemTotals.itemCount,
  };
}

async function loadMonthlyTrend(q: SpendQuery): Promise<readonly MonthlyExpenseTrendEntry[]> {
  const base = orderBase(q);
  const [orderRows, itemRows] = await Promise.all([
    db
      .select({
        month: base.month,
        itemSpend: sql<MoneyValue>`COALESCE(SUM(${base.itemSpend}), 0)`,
        feeSpend: sql<MoneyValue>`COALESCE(SUM(${base.shipping} + ${base.taxes} + ${base.duties} + ${base.tariffs} + ${base.miscFees}), 0)`,
        totalSpend: sql<MoneyValue>`COALESCE(SUM(${base.itemSpend} + ${base.shipping} + ${base.taxes} + ${base.duties} + ${base.tariffs} + ${base.miscFees}), 0)`,
        orderCount: sql<number>`COUNT(*)`,
      })
      .from(base)
      .groupBy(base.month),
    db
      .select({
        month:
          sql<string>`COALESCE(to_char(${collection.paymentDate}::date, 'YYYY-MM'), 'Undated')`.as(
            "month",
          ),
        itemSpend: sql<MoneyValue>`COALESCE(SUM(${collection.price}), 0)`,
        feeSpend: sql<MoneyValue>`0`,
        totalSpend: sql<MoneyValue>`COALESCE(SUM(${collection.price}), 0)`,
        orderCount: sql<number>`0`,
      })
      .from(collection)
      .where(
        and(
          eq(collection.userId, q.userId),
          isNull(collection.orderId),
          inArray(collection.status, q.statuses),
          q.shops ? inArray(collection.shop, q.shops) : undefined,
          q.dateStart ? gte(collection.paymentDate, q.dateStart) : undefined,
          q.dateEnd ? lte(collection.paymentDate, q.dateEnd) : undefined,
        ),
      )
      .groupBy(
        sql<string>`COALESCE(to_char(${collection.paymentDate}::date, 'YYYY-MM'), 'Undated')`,
      ),
  ]);

  const byMonth = new Map<string, MonthlyExpenseTrendEntry>();
  for (const row of [...orderRows, ...itemRows].map((mappedRow) => ({
    month: mappedRow.month,
    itemSpend: Number(mappedRow.itemSpend ?? 0),
    feeSpend: Number(mappedRow.feeSpend ?? 0),
    totalSpend: Number(mappedRow.totalSpend ?? 0),
    orderCount: Number(mappedRow.orderCount),
  }))) {
    const current = byMonth.get(row.month) ?? {
      month: row.month,
      itemSpend: 0,
      feeSpend: 0,
      totalSpend: 0,
      orderCount: 0,
    };
    byMonth.set(row.month, {
      month: row.month,
      itemSpend: current.itemSpend + row.itemSpend,
      feeSpend: current.feeSpend + row.feeSpend,
      totalSpend: current.totalSpend + row.totalSpend,
      orderCount: current.orderCount + row.orderCount,
    });
  }

  return [...byMonth.values()].toSorted((a, b) => {
    if (a.month === "Undated") return 1;
    if (b.month === "Undated") return -1;
    return a.month.localeCompare(b.month);
  });
}

async function loadShopAggregates(
  q: SpendQuery,
  search?: string,
): Promise<readonly ShopAggregate[]> {
  const base = orderBase(q);
  const searchFilter = search ? ilike(order.shop, `%${search}%`) : undefined;
  const itemSearchFilter = search ? ilike(collection.shop, `%${search}%`) : undefined;
  const [orderRows, itemRows] = await Promise.all([
    db
      .select({
        shop: base.shop,
        orderCount: sql<number>`COUNT(*)`,
        itemCount: sql<number>`COALESCE(SUM(${base.itemCount}), 0)`,
        itemSpend: sql<MoneyValue>`COALESCE(SUM(${base.itemSpend}), 0)`,
        feeSpend: sql<MoneyValue>`COALESCE(SUM(${base.shipping} + ${base.taxes} + ${base.duties} + ${base.tariffs} + ${base.miscFees}), 0)`,
      })
      .from(base)
      .where(searchFilter)
      .groupBy(base.shop),
    db
      .select({
        shop: collection.shop,
        orderCount: sql<number>`0`,
        itemCount: sql<number>`COUNT(*)`,
        itemSpend: sql<MoneyValue>`COALESCE(SUM(${collection.price}), 0)`,
        feeSpend: sql<MoneyValue>`0`,
      })
      .from(collection)
      .where(
        and(
          eq(collection.userId, q.userId),
          isNull(collection.orderId),
          inArray(collection.status, q.statuses),
          q.shops ? inArray(collection.shop, q.shops) : undefined,
          q.dateStart ? gte(collection.paymentDate, q.dateStart) : undefined,
          q.dateEnd ? lte(collection.paymentDate, q.dateEnd) : undefined,
          itemSearchFilter,
        ),
      )
      .groupBy(collection.shop),
  ]);

  const byShop = new Map<string, ShopAggregate>();
  for (const row of [...orderRows, ...itemRows].map((mappedRow) => ({
    shop: mappedRow.shop,
    orderCount: Number(mappedRow.orderCount),
    itemCount: Number(mappedRow.itemCount),
    itemSpend: Number(mappedRow.itemSpend ?? 0),
    feeSpend: Number(mappedRow.feeSpend ?? 0),
  }))) {
    const shop = row.shop.trim() === "" ? UNKNOWN_SHOP : row.shop;
    const current = byShop.get(shop) ?? {
      shop,
      orderCount: 0,
      itemCount: 0,
      itemSpend: 0,
      feeSpend: 0,
    };
    byShop.set(shop, {
      shop,
      orderCount: current.orderCount + row.orderCount,
      itemCount: current.itemCount + row.itemCount,
      itemSpend: current.itemSpend + row.itemSpend,
      feeSpend: current.feeSpend + row.feeSpend,
    });
  }
  return [...byShop.values()];
}

async function loadShopOptions(userId: string): Promise<readonly string[]> {
  const rows = await db
    .selectDistinct({ shop: order.shop })
    .from(order)
    .where(eq(order.userId, userId));
  const collectionRows = await db
    .selectDistinct({ shop: collection.shop })
    .from(collection)
    .where(eq(collection.userId, userId));

  const shops = new Set<string>();
  for (const row of [...rows, ...collectionRows]) {
    if (row.shop.trim() !== "") shops.add(row.shop);
  }
  return [...shops].toSorted((a, b) => a.localeCompare(b));
}

class ExpensesService {
  async getExpensesOverview(
    userId: string,
    filters: ExpenseFilters,
  ): Promise<ExpensesOverviewResponse> {
    const q: SpendQuery = {
      userId,
      dateStart: filters.dateStart,
      dateEnd: filters.dateEnd,
      statuses: filters.status && filters.status.length > 0 ? filters.status : ACTUAL_STATUSES,
      shops: filters.shop && filters.shop.length > 0 ? filters.shop : undefined,
    };

    const unpaidQ: SpendQuery = {
      userId,
      dateStart: filters.dateStart,
      dateEnd: filters.dateEnd,
      statuses: UNPAID_STATUSES,
      shops: filters.shop && filters.shop.length > 0 ? filters.shop : undefined,
    };

    const [totals, unpaidTotals, unpaidOrders, shops, monthlyTrend, topDrivers, shopOptions] =
      await Promise.all([
        loadTotals(q),
        loadTotals(unpaidQ),
        loadOrderDetails(unpaidQ, UNPAID_ORDER_PREVIEW),
        loadShopAggregates(q),
        loadMonthlyTrend(q),
        loadOrderDetails(q, TOP_DRIVERS),
        loadShopOptions(userId),
      ]);

    const feeSpend =
      totals.shipping + totals.taxes + totals.duties + totals.tariffs + totals.miscFees;
    const totalSpend = totals.items + feeSpend;

    return {
      summary: {
        totalSpend,
        itemSpend: totals.items,
        feeSpend,
        orderCount: totals.orderCount,
        itemCount: totals.itemCount,
        avgOrder: totals.orderCount > 0 ? Math.round(totalSpend / totals.orderCount) : 0,
        avgItem: totals.itemCount > 0 ? Math.round(totals.items / totals.itemCount) : 0,
        avgFee: totals.orderCount > 0 ? Math.round(feeSpend / totals.orderCount) : 0,
      },
      unpaidBreakdown: {
        items: unpaidTotals.items,
        shipping: unpaidTotals.shipping,
        taxes: unpaidTotals.taxes,
        duties: unpaidTotals.duties,
        tariffs: unpaidTotals.tariffs,
        miscFees: unpaidTotals.miscFees,
      },
      unpaidOrders: unpaidOrders.rows.map(toExpenseOrder),
      unpaidOrderCount: unpaidOrders.total,
      uniqueShopCount: shops.length,
      costBreakdown: {
        items: totals.items,
        shipping: totals.shipping,
        taxes: totals.taxes,
        duties: totals.duties,
        tariffs: totals.tariffs,
        miscFees: totals.miscFees,
      },
      monthlyTrend: [...monthlyTrend],
      topDrivers: topDrivers.rows.map(toExpenseOrder),
      filterOptions: { shopOptions: [...shopOptions] },
    };
  }

  async getShopsBreakdown(
    userId: string,
    filters: ExpenseShopsFilters,
  ): Promise<ExpenseShopsResponse> {
    const q: SpendQuery = {
      userId,
      dateStart: filters.dateStart,
      dateEnd: filters.dateEnd,
      statuses: filters.status && filters.status.length > 0 ? filters.status : ACTUAL_STATUSES,
      shops: filters.shop && filters.shop.length > 0 ? filters.shop : undefined,
    };
    const search = filters.search?.trim();
    const limit = filters.limit ?? DEFAULT_LIMIT;
    const offset = filters.offset ?? 0;

    const shops = await loadShopAggregates(q, search);
    const rows: readonly ShopSpendRow[] = shops
      .map((agg): ShopSpendRow => {
        const totalSpend = agg.itemSpend + agg.feeSpend;
        return {
          shop: agg.shop,
          orderCount: agg.orderCount,
          itemCount: agg.itemCount,
          itemSpend: agg.itemSpend,
          feeSpend: agg.feeSpend,
          totalSpend,
          avgOrder: agg.orderCount > 0 ? Math.round(totalSpend / agg.orderCount) : 0,
        };
      })
      .toSorted((a, b) => b.totalSpend - a.totalSpend);

    const totalSpend = rows.reduce((sum, row) => sum + row.totalSpend, 0);
    const orderCount = rows.reduce((sum, row) => sum + row.orderCount, 0);

    return {
      kpis: {
        uniqueShops: rows.length,
        orderCount,
        totalSpend,
        avgPerShop: rows.length > 0 ? Math.round(totalSpend / rows.length) : 0,
      },
      rows: rows.slice(offset, offset + limit),
      totalCount: rows.length,
    };
  }

  async getShopExpansion(
    userId: string,
    shopName: string,
    filters: Pick<ExpenseShopsFilters, "dateStart" | "dateEnd" | "status">,
  ): Promise<ShopExpansionResponse> {
    const dbShop = shopName === UNKNOWN_SHOP ? "" : shopName;
    const q: SpendQuery = {
      userId,
      dateStart: filters.dateStart,
      dateEnd: filters.dateEnd,
      statuses: filters.status && filters.status.length > 0 ? filters.status : ACTUAL_STATUSES,
      shops: [dbShop],
    };

    const [totals, orders, items] = await Promise.all([
      loadOrderTotals(q),
      loadOrderDetails(q, TOP_ORDERS_PER_SHOP),
      loadShopItems(q, dbShop),
    ]);

    return {
      feeBreakdown: {
        shipping: totals.shipping,
        taxes: totals.taxes,
        duties: totals.duties,
        tariffs: totals.tariffs,
        miscFees: totals.miscFees,
      },
      topOrders: orders.rows.map(toExpenseOrder),
      totalOrders: orders.total,
      items: [...items.rows],
      totalItems: items.total,
    };
  }
}

export default new ExpensesService();
