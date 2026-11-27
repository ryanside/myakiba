import type { ReadTx } from "@myakiba/db/tx";
import { collection, item, order } from "@myakiba/db/schema/figure";
import { asc, count, desc, eq, sql, sum } from "drizzle-orm";
import { orderPreviewImagesSql } from "@/lib/order-preview";
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
  orderSpendSums,
  paidOrderWhere,
  realizedOrderDateSql,
} from "./expense-queries";
import {
  itemOrderJoin,
  orderFees,
  orderIsPaid,
  paidItemCount,
  paidItemPrice,
} from "@/lib/order-money";
import { itemImageSql } from "@/lib/item-image-url";

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
  tx: ReadTx,
  userId: string,
  filters: ExpenseShopFilters,
): Promise<ExpenseShopsResponse> {
  switch (filters.scope) {
    case "collection":
      return getCollectionShopRows(tx, userId, filters);
    case "orders":
      return getOrdersShopRows(tx, userId, filters);
    case "shipping":
      return getShippingShopRows(tx, userId, filters);
  }
}

async function getCollectionShopRows(
  tx: ReadTx,
  userId: string,
  filters: ExpenseShopFilters,
): Promise<ExpenseShopsResponse> {
  const spend = sql<number>`COALESCE(${sum(paidItemPrice)}, 0)::double precision`;
  const rows = await tx
    .select({
      shop: collection.shop,
      spend,
      itemCount: sql<number>`${count(collection.id)}::integer`,
      paidItemCount: sql<number>`${paidItemCount}::integer`,
    })
    .from(collection)
    .leftJoin(...itemOrderJoin)
    .where(collectionWhere(userId, filters, "total"))
    .groupBy(collection.shop)
    .orderBy(desc(spend), asc(collection.shop));
  const shareOf = shareOfSpend(rows);

  return {
    items: rows.map((row) => ({
      scope: "collection",
      id: shopId(row.shop),
      shop: row.shop,
      spend: row.spend,
      share: shareOf(row.spend),
      itemCount: row.itemCount,
      averageItemCost: row.paidItemCount > 0 ? Math.round(row.spend / row.paidItemCount) : 0,
    })),
  };
}

async function getOrdersShopRows(
  tx: ReadTx,
  userId: string,
  filters: ExpenseShopFilters,
): Promise<ExpenseShopsResponse> {
  const orderItems = createOrderItemSpendByOrder(tx, userId, filters);
  const sums = orderSpendSums(orderItems);
  const rows = await tx
    .select({
      shop: order.shop,
      spend: sums.orderSpend,
      orderCount: sums.paidOrderCount,
      orderItemCount: sums.orderItemCount,
      fees: sums.fees,
    })
    .from(order)
    .leftJoin(orderItems, eq(order.id, orderItems.orderId))
    .where(paidOrderWhere(userId, filters, "total"))
    .groupBy(order.shop)
    .orderBy(desc(sums.orderSpend), asc(order.shop));
  const shareOf = shareOfSpend(rows);

  return {
    items: rows.map((row) => ({
      scope: "orders",
      id: shopId(row.shop),
      shop: row.shop,
      spend: row.spend,
      share: shareOf(row.spend),
      orderCount: row.orderCount,
      averageOrder: row.orderCount > 0 ? Math.round(row.spend / row.orderCount) : 0,
      orderItemCount: row.orderItemCount,
      fees: row.fees,
    })),
  };
}

async function getShippingShopRows(
  tx: ReadTx,
  userId: string,
  filters: ExpenseShopFilters,
): Promise<ExpenseShopsResponse> {
  const spend = sql<number>`COALESCE(${sum(order.shippingFee)}, 0)::double precision`;
  const rows = await tx
    .select({
      shop: order.shop,
      spend,
      orderCount: sql<number>`${count(order.id)}::integer`,
    })
    .from(order)
    .where(paidOrderWhere(userId, filters, "total"))
    .groupBy(order.shop)
    .orderBy(desc(spend), asc(order.shop));
  const shareOf = shareOfSpend(rows);

  return {
    items: rows.map((row) => ({
      scope: "shipping",
      id: shopId(row.shop),
      shop: row.shop,
      spend: row.spend,
      share: shareOf(row.spend),
      orderCount: row.orderCount,
      averageShipping: row.orderCount > 0 ? Math.round(row.spend / row.orderCount) : 0,
    })),
  };
}

function shareOfSpend(rows: readonly { readonly spend: number }[]): (spend: number) => number {
  const total = rows.reduce((spent, row) => spent + row.spend, 0);
  return (spend) => (total > 0 ? (spend / total) * 100 : 0);
}

export async function loadScopedShopExpansion(
  tx: ReadTx,
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
        items: await loadCollectionItems(tx, userId, scopedFilters),
      };
    case "orders": {
      const [feeBreakdown, topOrders] = await Promise.all([
        loadFeeBreakdown(tx, userId, scopedFilters),
        loadTopOrders(tx, userId, scopedFilters, "orders"),
      ]);
      return { scope: "orders", feeBreakdown, topOrders };
    }
    case "shipping": {
      const [methodRows, topOrders] = await Promise.all([
        getShippingMethodTotals(tx, userId, scopedFilters),
        loadTopOrders(tx, userId, scopedFilters, "shipping"),
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

function loadCollectionItems(tx: ReadTx, userId: string, filters: ExpenseFilters) {
  return tx
    .select({
      collectionId: collection.id,
      itemId: item.id,
      externalId: item.externalId,
      title: item.title,
      image: itemImageSql().as("image"),
    })
    .from(collection)
    .innerJoin(item, eq(collection.itemId, item.id))
    .leftJoin(...itemOrderJoin)
    .where(collectionWhere(userId, filters, "total"))
    .orderBy(desc(collection.paymentDate), desc(collection.createdAt), desc(collection.id))
    .limit(6);
}

async function loadFeeBreakdown(tx: ReadTx, userId: string, filters: ExpenseFilters) {
  const [row] = await tx
    .select({
      shipping: sql<number>`COALESCE(${sum(order.shippingFee)}, 0)::double precision`,
      taxes: sql<number>`COALESCE(${sum(order.taxes)}, 0)::double precision`,
      duties: sql<number>`COALESCE(${sum(order.duties)}, 0)::double precision`,
      tariffs: sql<number>`COALESCE(${sum(order.tariffs)}, 0)::double precision`,
      miscFees: sql<number>`COALESCE(${sum(order.miscFees)}, 0)::double precision`,
    })
    .from(order)
    .where(paidOrderWhere(userId, filters, "total"));

  return row ?? EMPTY_FEE_BREAKDOWN;
}

async function loadTopOrders(
  tx: ReadTx,
  userId: string,
  filters: ExpenseFilters,
  scope: "orders" | "shipping",
) {
  const orderItems = createOrderItemSpendByOrder(tx, userId, filters);
  const orderFeeSpend = sql<number>`(CASE WHEN ${orderIsPaid} THEN ${orderFees} ELSE 0 END)::double precision`;
  const rows = await tx
    .select({
      orderId: order.id,
      title: order.title,
      shop: order.shop,
      expenseDate: sql<string | null>`${realizedOrderDateSql()}`,
      images: orderPreviewImagesSql,
      itemSpend: sql<number>`COALESCE(${orderItems.itemSpend}, 0)::double precision`,
      feeSpend: orderFeeSpend,
    })
    .from(order)
    .leftJoin(orderItems, eq(order.id, orderItems.orderId))
    .leftJoin(collection, eq(order.id, collection.orderId))
    .where(paidOrderWhere(userId, filters, "total"))
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
          : sql`COALESCE(${orderItems.itemSpend}, 0) + ${orderFeeSpend}`,
      ),
      asc(sql`LOWER(${order.title})`),
      asc(order.title),
      asc(order.id),
    )
    .limit(5);

  return rows.map(({ itemSpend, ...row }) => ({
    ...row,
    images: row.images.slice(0, 4),
    totalSpend: itemSpend + row.feeSpend,
  }));
}
