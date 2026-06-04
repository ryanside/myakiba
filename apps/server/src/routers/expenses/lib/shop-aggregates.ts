import { db } from "@myakiba/db/client";
import { collection, item, order } from "@myakiba/db/schema/figure";
import { and, count, desc, eq, ne, sql, sum } from "drizzle-orm";
import type { ExpenseFilters, ExpenseShopFilters, ShopFeeBreakdown, ShopSpendRow } from "../model";
import {
  collectionShopWhere,
  collectionWhere,
  createOrderItemSpendByOrder,
  dateRangeWhere,
  orderFeeSpendSql,
  orderSpendSql,
  paidOrderWhere,
  realizedOrderDateSql,
  toAverage,
} from "./expense-queries";

const EMPTY_FEE_BREAKDOWN: ShopFeeBreakdown = {
  shipping: 0,
  taxes: 0,
  duties: 0,
  tariffs: 0,
  miscFees: 0,
};

export type ShopSpendQueryRow = Awaited<ReturnType<typeof getShopSpendRows>>[number];

export function toShopSpendRow(row: ShopSpendQueryRow): ShopSpendRow {
  return {
    shop: row.shop,
    orderCount: row.orderCount,
    ownedItemCount: row.ownedItemCount,
    orderItemCount: row.orderItemCount,
    collectionItemSpend: row.collectionItemSpend,
    orderItemSpend: row.orderItemSpend,
    feeSpend: row.feeSpend,
    totalSpend: row.paidItemSpend + row.feeSpend,
    averageOrderSpend: toAverage(row.orderItemsOnOrdersSpend + row.feeSpend, row.orderCount),
    averageCollectionItemSpend: toAverage(row.collectionItemSpend, row.ownedItemCount),
    averageOrderItemSpend: toAverage(row.orderItemSpend, row.orderItemCount),
    averageFeeSpend: toAverage(row.feeSpend, row.orderCount),
  };
}

export async function getShopSpendRows(userId: string, filters: ExpenseShopFilters) {
  const orderItems = createOrderItemSpendByOrder(userId, filters);
  const offset = filters.offset ?? 0;
  const limit = filters.limit ?? 20;

  const collectionAgg = db.$with("collection_agg").as(
    db
      .select({
        shop: collection.shop,
        paidItemSpend: sql<number>`COALESCE(${sum(collection.price)}, 0)::double precision`.as(
          "paid_item_spend",
        ),
        collectionItemSpend: sql<number>`COALESCE(${sum(
          sql`CASE WHEN ${collection.status} = 'Owned' THEN ${collection.price} ELSE 0 END`,
        )}, 0)::double precision`.as("collection_item_spend"),
        ownedItemCount: sql<number>`COALESCE(${sum(
          sql`CASE WHEN ${collection.status} = 'Owned' THEN 1 ELSE 0 END`,
        )}, 0)::integer`.as("owned_item_count"),
      })
      .from(collection)
      .leftJoin(order, eq(collection.orderId, order.id))
      .where(collectionWhere(userId, filters, "paid", "total"))
      .groupBy(collection.shop),
  );

  const orderItemAgg = db.$with("order_item_agg").as(
    db
      .select({
        shop: collection.shop,
        orderItemSpend: sql<number>`COALESCE(${sum(collection.price)}, 0)::double precision`.as(
          "order_item_spend",
        ),
        orderItemCount: sql<number>`${count(collection.id)}::integer`.as("order_item_count"),
      })
      .from(collection)
      .innerJoin(order, eq(collection.orderId, order.id))
      .where(
        and(
          eq(collection.userId, userId),
          eq(order.userId, userId),
          ne(order.status, "Ordered"),
          collectionShopWhere(filters.shop),
          dateRangeWhere(realizedOrderDateSql(), filters),
        ),
      )
      .groupBy(collection.shop),
  );

  const orderAgg = db.$with("order_agg").as(
    db
      .select({
        shop: order.shop,
        orderCount: sql<number>`${count(order.id)}::integer`.as("order_count"),
        feeSpend: sql<number>`COALESCE(${sum(orderFeeSpendSql())}, 0)::double precision`.as(
          "fee_spend",
        ),
        orderItemsOnOrdersSpend: sql<number>`COALESCE(${sum(
          sql`COALESCE(${orderItems.itemSpend}, 0)`,
        )}, 0)::double precision`.as("order_items_on_orders_spend"),
      })
      .from(order)
      .leftJoin(orderItems, eq(order.id, orderItems.orderId))
      .where(paidOrderWhere(userId, filters))
      .groupBy(order.shop),
  );

  const allShops = db.$with("all_shops", {
    shop: sql<string>`shop`.as("shop"),
  }).as(sql`
    SELECT shop FROM collection_agg WHERE shop IS NOT NULL AND shop <> ''
    UNION
    SELECT shop FROM order_item_agg WHERE shop IS NOT NULL AND shop <> ''
    UNION
    SELECT shop FROM order_agg WHERE shop IS NOT NULL AND shop <> ''
  `);

  const rows = await db
    .with(collectionAgg, orderItemAgg, orderAgg, allShops)
    .select({
      shop: sql<string>`"all_shops"."shop"`,
      orderCount: sql<number>`COALESCE(${orderAgg.orderCount}, 0)::integer`,
      ownedItemCount: sql<number>`COALESCE(${collectionAgg.ownedItemCount}, 0)::integer`,
      orderItemCount: sql<number>`COALESCE(${orderItemAgg.orderItemCount}, 0)::integer`,
      paidItemSpend: sql<number>`COALESCE(${collectionAgg.paidItemSpend}, 0)::double precision`,
      collectionItemSpend: sql<number>`COALESCE(${collectionAgg.collectionItemSpend}, 0)::double precision`,
      orderItemSpend: sql<number>`COALESCE(${orderItemAgg.orderItemSpend}, 0)::double precision`,
      feeSpend: sql<number>`COALESCE(${orderAgg.feeSpend}, 0)::double precision`,
      orderItemsOnOrdersSpend: sql<number>`COALESCE(${orderAgg.orderItemsOnOrdersSpend}, 0)::double precision`,
      totalCount: sql<number>`COUNT(*) OVER()`,
    })
    .from(allShops)
    .leftJoin(collectionAgg, sql`"all_shops"."shop" = "collection_agg"."shop"`)
    .leftJoin(orderItemAgg, sql`"all_shops"."shop" = "order_item_agg"."shop"`)
    .leftJoin(orderAgg, sql`"all_shops"."shop" = "order_agg"."shop"`)
    .where(filters.search ? sql`"all_shops"."shop" ILIKE ${`%${filters.search}%`}` : undefined)
    .orderBy(
      desc(sql`COALESCE(${collectionAgg.paidItemSpend}, 0) + COALESCE(${orderAgg.feeSpend}, 0)`),
    )
    .limit(limit)
    .offset(offset);

  return rows;
}

export async function loadShopExpansion(userId: string, shop: string, filters: ExpenseFilters) {
  const scopedFilters: ExpenseFilters = { ...filters, shop: [shop] };
  const orderItems = createOrderItemSpendByOrder(userId, scopedFilters);

  const [feeBreakdownRows, topOrderRows, items] = await Promise.all([
    db
      .select({
        shipping: sql<number>`COALESCE(${sum(order.shippingFee)}, 0)::double precision`,
        taxes: sql<number>`COALESCE(${sum(order.taxes)}, 0)::double precision`,
        duties: sql<number>`COALESCE(${sum(order.duties)}, 0)::double precision`,
        tariffs: sql<number>`COALESCE(${sum(order.tariffs)}, 0)::double precision`,
        miscFees: sql<number>`COALESCE(${sum(order.miscFees)}, 0)::double precision`,
      })
      .from(order)
      .where(and(paidOrderWhere(userId, scopedFilters))),
    db
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
        itemCount: sql<number>`COALESCE(${orderItems.itemCount}, 0)::integer`,
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
      .where(and(paidOrderWhere(userId, scopedFilters)))
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
        orderItems.itemCount,
      )
      .orderBy(desc(orderSpendSql(orderItems)))
      .limit(5),
    db
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
      .where(and(collectionWhere(userId, scopedFilters, "owned", "total")))
      .orderBy(desc(collection.paymentDate), desc(collection.createdAt))
      .limit(6),
  ]);

  return {
    feeBreakdown: feeBreakdownRows[0] ?? EMPTY_FEE_BREAKDOWN,
    topOrders: topOrderRows.map((row) => ({
      ...row,
      images: row.images.slice(0, 4),
    })),
    items,
  };
}
