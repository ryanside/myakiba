import { db } from "@myakiba/db/client";
import { collection, item, order } from "@myakiba/db/schema/figure";
import { count, desc, eq, sql, sum } from "drizzle-orm";
import type {
  ExpenseFilters,
  ExpenseShopFilters,
  ExpenseShopsResponse,
  ShopExpansionResponse,
} from "../model";
import { EXPENSE_NAMED_SHOP_ID_PREFIX, EXPENSE_UNASSIGNED_SHOP_ID } from "../model";
import {
  collectionWhere,
  createOrderItemSpendByOrder,
  getShippingMethodTotals,
  orderWhere,
  realizedOrderDateSql,
} from "./expense-queries";

const EMPTY_FEE_BREAKDOWN = {
  shipping: 0,
  taxes: 0,
  duties: 0,
  tariffs: 0,
  miscFees: 0,
} as const;

function shopId(shop: string): string {
  return shop === "" ? EXPENSE_UNASSIGNED_SHOP_ID : `${EXPENSE_NAMED_SHOP_ID_PREFIX}${shop}`;
}

function rawShop(id: string): string {
  if (id === EXPENSE_UNASSIGNED_SHOP_ID) return "";
  return id.slice(EXPENSE_NAMED_SHOP_ID_PREFIX.length);
}

export async function getScopedShopRows(
  userId: string,
  filters: ExpenseShopFilters,
): Promise<ExpenseShopsResponse> {
  switch (filters.scope) {
    case "collection":
      return getCollectionShopRows(userId, filters);
    case "orders":
      return getOrdersShopRows(userId, filters);
    case "shipping":
      return getShippingShopRows(userId, filters);
  }
}

async function getCollectionShopRows(
  userId: string,
  filters: ExpenseShopFilters,
): Promise<ExpenseShopsResponse> {
  const scopedFilters: ExpenseFilters = {
    dateStart: filters.dateStart,
    dateEnd: filters.dateEnd,
    shop: filters.shop,
  };
  const grouped = db.$with("shop_agg").as(
    db
      .select({
        shop: collection.shop,
        spend: sql<number>`COALESCE(${sum(collection.price)}, 0)::double precision`.as("spend"),
        itemCount: sql<number>`${count(collection.id)}::integer`.as("item_count"),
      })
      .from(collection)
      .leftJoin(order, eq(collection.orderId, order.id))
      .where(collectionWhere(userId, scopedFilters, "total"))
      .groupBy(collection.shop),
  );
  const scopedShops = db.$with("scoped_shops").as(
    db
      .with(grouped)
      .select({
        shop: grouped.shop,
        spend: grouped.spend,
        itemCount: grouped.itemCount,
        totalScopedSpend: sql<number>`SUM(${grouped.spend}) OVER()::double precision`.as(
          "total_scoped_spend",
        ),
      })
      .from(grouped),
  );
  const rows = await db
    .with(grouped, scopedShops)
    .select({
      shop: scopedShops.shop,
      spend: scopedShops.spend,
      itemCount: scopedShops.itemCount,
      totalScopedSpend: scopedShops.totalScopedSpend,
      totalCount: sql<number>`COUNT(*) OVER()::integer`,
    })
    .from(scopedShops)
    .where(
      filters.search
        ? sql`COALESCE(NULLIF("scoped_shops"."shop", ''), 'Unassigned') ILIKE ${`%${filters.search}%`}`
        : undefined,
    )
    .orderBy(
      desc(sql`CASE WHEN ${scopedShops.spend} > 0 THEN 1 ELSE 0 END`),
      desc(scopedShops.spend),
      scopedShops.shop,
    )
    .limit(filters.limit ?? 10)
    .offset(filters.offset ?? 0);

  return {
    rows: rows.map((row) => ({
      scope: "collection",
      id: shopId(row.shop),
      shop: row.shop,
      spend: row.spend,
      share: row.totalScopedSpend > 0 ? (row.spend / row.totalScopedSpend) * 100 : 0,
      itemCount: row.itemCount,
      averageItemCost: row.itemCount > 0 ? Math.round(row.spend / row.itemCount) : 0,
    })),
    totalCount: rows[0]?.totalCount ?? 0,
  };
}

async function getOrdersShopRows(
  userId: string,
  filters: ExpenseShopFilters,
): Promise<ExpenseShopsResponse> {
  const scopedFilters: ExpenseFilters = {
    dateStart: filters.dateStart,
    dateEnd: filters.dateEnd,
    shop: filters.shop,
  };
  const orderItems = createOrderItemSpendByOrder(userId, scopedFilters);
  const grouped = db.$with("shop_agg").as(
    db
      .select({
        shop: order.shop,
        spend: sql<number>`COALESCE(${sum(
          sql`COALESCE(${orderItems.itemSpend}, 0) + COALESCE(${order.shippingFee}, 0) + COALESCE(${order.taxes}, 0) + COALESCE(${order.duties}, 0) + COALESCE(${order.tariffs}, 0) + COALESCE(${order.miscFees}, 0)`,
        )}, 0)::double precision`.as("spend"),
        orderCount: sql<number>`${count(order.id)}::integer`.as("order_count"),
        orderItemCount: sql<number>`COALESCE(${sum(
          sql`COALESCE(${orderItems.itemCount}, 0)`,
        )}, 0)::integer`.as("order_item_count"),
        fees: sql<number>`COALESCE(${sum(
          sql`COALESCE(${order.shippingFee}, 0) + COALESCE(${order.taxes}, 0) + COALESCE(${order.duties}, 0) + COALESCE(${order.tariffs}, 0) + COALESCE(${order.miscFees}, 0)`,
        )}, 0)::double precision`.as("fees"),
      })
      .from(order)
      .leftJoin(orderItems, eq(order.id, orderItems.orderId))
      .where(orderWhere(userId, scopedFilters, "total"))
      .groupBy(order.shop),
  );
  const scopedShops = db.$with("scoped_shops").as(
    db
      .with(grouped)
      .select({
        shop: grouped.shop,
        spend: grouped.spend,
        orderCount: grouped.orderCount,
        orderItemCount: grouped.orderItemCount,
        fees: grouped.fees,
        totalScopedSpend: sql<number>`SUM(${grouped.spend}) OVER()::double precision`.as(
          "total_scoped_spend",
        ),
      })
      .from(grouped),
  );
  const rows = await db
    .with(orderItems, grouped, scopedShops)
    .select({
      shop: scopedShops.shop,
      spend: scopedShops.spend,
      orderCount: scopedShops.orderCount,
      orderItemCount: scopedShops.orderItemCount,
      fees: scopedShops.fees,
      totalScopedSpend: scopedShops.totalScopedSpend,
      totalCount: sql<number>`COUNT(*) OVER()::integer`,
    })
    .from(scopedShops)
    .where(
      filters.search
        ? sql`COALESCE(NULLIF("scoped_shops"."shop", ''), 'Unassigned') ILIKE ${`%${filters.search}%`}`
        : undefined,
    )
    .orderBy(
      desc(sql`CASE WHEN ${scopedShops.spend} > 0 THEN 1 ELSE 0 END`),
      desc(scopedShops.spend),
      scopedShops.shop,
    )
    .limit(filters.limit ?? 10)
    .offset(filters.offset ?? 0);

  return {
    rows: rows.map((row) => ({
      scope: "orders",
      id: shopId(row.shop),
      shop: row.shop,
      spend: row.spend,
      share: row.totalScopedSpend > 0 ? (row.spend / row.totalScopedSpend) * 100 : 0,
      orderCount: row.orderCount,
      averageOrder: row.orderCount > 0 ? Math.round(row.spend / row.orderCount) : 0,
      orderItemCount: row.orderItemCount,
      fees: row.fees,
    })),
    totalCount: rows[0]?.totalCount ?? 0,
  };
}

async function getShippingShopRows(
  userId: string,
  filters: ExpenseShopFilters,
): Promise<ExpenseShopsResponse> {
  const scopedFilters: ExpenseFilters = {
    dateStart: filters.dateStart,
    dateEnd: filters.dateEnd,
    shop: filters.shop,
  };
  const grouped = db.$with("shop_agg").as(
    db
      .select({
        shop: order.shop,
        spend: sql<number>`COALESCE(${sum(order.shippingFee)}, 0)::double precision`.as("spend"),
        orderCount: sql<number>`${count(order.id)}::integer`.as("order_count"),
      })
      .from(order)
      .where(orderWhere(userId, scopedFilters, "total"))
      .groupBy(order.shop),
  );
  const scopedShops = db.$with("scoped_shops").as(
    db
      .with(grouped)
      .select({
        shop: grouped.shop,
        spend: grouped.spend,
        orderCount: grouped.orderCount,
        totalScopedSpend: sql<number>`SUM(${grouped.spend}) OVER()::double precision`.as(
          "total_scoped_spend",
        ),
      })
      .from(grouped),
  );
  const rows = await db
    .with(grouped, scopedShops)
    .select({
      shop: scopedShops.shop,
      spend: scopedShops.spend,
      orderCount: scopedShops.orderCount,
      totalScopedSpend: scopedShops.totalScopedSpend,
      totalCount: sql<number>`COUNT(*) OVER()::integer`,
    })
    .from(scopedShops)
    .where(
      filters.search
        ? sql`COALESCE(NULLIF("scoped_shops"."shop", ''), 'Unassigned') ILIKE ${`%${filters.search}%`}`
        : undefined,
    )
    .orderBy(
      desc(sql`CASE WHEN ${scopedShops.spend} > 0 THEN 1 ELSE 0 END`),
      desc(scopedShops.spend),
      scopedShops.shop,
    )
    .limit(filters.limit ?? 10)
    .offset(filters.offset ?? 0);

  return {
    rows: rows.map((row) => ({
      scope: "shipping",
      id: shopId(row.shop),
      shop: row.shop,
      spend: row.spend,
      share: row.totalScopedSpend > 0 ? (row.spend / row.totalScopedSpend) * 100 : 0,
      orderCount: row.orderCount,
      averageShipping: row.orderCount > 0 ? Math.round(row.spend / row.orderCount) : 0,
    })),
    totalCount: rows[0]?.totalCount ?? 0,
  };
}

export async function loadScopedShopExpansion(
  userId: string,
  shopIdValue: string,
  filters: ExpenseShopFilters,
): Promise<ShopExpansionResponse> {
  const shop = rawShop(shopIdValue);
  const scopedFilters: ExpenseFilters = {
    dateStart: filters.dateStart,
    dateEnd: filters.dateEnd,
    shop: [shop],
  };

  switch (filters.scope) {
    case "collection":
      return {
        scope: "collection",
        items: await loadCollectionItems(userId, scopedFilters),
      };
    case "orders": {
      const [feeBreakdown, topOrders] = await Promise.all([
        loadFeeBreakdown(userId, scopedFilters),
        loadTopOrders(userId, scopedFilters, "orders"),
      ]);
      return { scope: "orders", feeBreakdown, topOrders };
    }
    case "shipping": {
      const [methodRows, topOrders] = await Promise.all([
        getShippingMethodTotals(userId, scopedFilters),
        loadTopOrders(userId, scopedFilters, "shipping"),
      ]);
      return {
        scope: "shipping",
        methods: methodRows
          .filter((row) => row.shippingSpend > 0)
          .toSorted((left, right) => right.shippingSpend - left.shippingSpend)
          .map((row) => ({
            method: row.shippingMethod,
            spend: row.shippingSpend,
            orderCount: row.orderCount,
          })),
        topOrders,
      };
    }
  }
}

function loadCollectionItems(userId: string, filters: ExpenseFilters) {
  return db
    .select({
      collectionId: collection.id,
      itemId: item.id,
      externalId: item.externalId,
      title: item.title,
      image: item.image,
    })
    .from(collection)
    .innerJoin(item, eq(collection.itemId, item.id))
    .leftJoin(order, eq(collection.orderId, order.id))
    .where(collectionWhere(userId, filters, "total"))
    .orderBy(desc(collection.paymentDate), desc(collection.createdAt))
    .limit(6);
}

async function loadFeeBreakdown(userId: string, filters: ExpenseFilters) {
  const [row] = await db
    .select({
      shipping: sql<number>`COALESCE(${sum(order.shippingFee)}, 0)::double precision`,
      taxes: sql<number>`COALESCE(${sum(order.taxes)}, 0)::double precision`,
      duties: sql<number>`COALESCE(${sum(order.duties)}, 0)::double precision`,
      tariffs: sql<number>`COALESCE(${sum(order.tariffs)}, 0)::double precision`,
      miscFees: sql<number>`COALESCE(${sum(order.miscFees)}, 0)::double precision`,
    })
    .from(order)
    .where(orderWhere(userId, filters, "total"));

  return row ?? EMPTY_FEE_BREAKDOWN;
}

async function loadTopOrders(
  userId: string,
  filters: ExpenseFilters,
  scope: "orders" | "shipping",
) {
  const orderItems = createOrderItemSpendByOrder(userId, filters);
  const rows = await db
    .select({
      orderId: order.id,
      title: order.title,
      shop: order.shop,
      expenseDate: sql<string | null>`${realizedOrderDateSql()}`,
      images: sql<string[]>`
        COALESCE(
          ARRAY_AGG(DISTINCT ${item.image}) FILTER (WHERE ${item.image} IS NOT NULL),
          ARRAY[]::text[]
        )
      `,
      itemSpend: sql<number>`COALESCE(${orderItems.itemSpend}, 0)::double precision`,
      shipping: order.shippingFee,
      taxes: order.taxes,
      duties: order.duties,
      tariffs: order.tariffs,
      miscFees: order.miscFees,
    })
    .from(order)
    .leftJoin(orderItems, eq(order.id, orderItems.orderId))
    .leftJoin(collection, eq(order.id, collection.orderId))
    .leftJoin(item, eq(collection.itemId, item.id))
    .where(orderWhere(userId, filters, "total"))
    .groupBy(
      order.id,
      order.title,
      order.shop,
      order.paymentDate,
      order.collectionDate,
      order.shippingDate,
      order.orderDate,
      order.releaseDate,
      order.shippingFee,
      order.taxes,
      order.duties,
      order.tariffs,
      order.miscFees,
      orderItems.itemSpend,
    )
    .orderBy(
      desc(
        scope === "shipping"
          ? order.shippingFee
          : sql`COALESCE(${orderItems.itemSpend}, 0) + COALESCE(${order.shippingFee}, 0) + COALESCE(${order.taxes}, 0) + COALESCE(${order.duties}, 0) + COALESCE(${order.tariffs}, 0) + COALESCE(${order.miscFees}, 0)`,
      ),
    )
    .limit(5);

  return rows.map(({ itemSpend, shipping, taxes, duties, tariffs, miscFees, ...row }) => {
    const feeSpend = shipping + taxes + duties + tariffs + miscFees;
    return {
      ...row,
      images: row.images.slice(0, 4),
      feeSpend,
      totalSpend: itemSpend + feeSpend,
    };
  });
}
