import type { ShippingMethod } from "@myakiba/contracts/shared/types";
import { db } from "@myakiba/db/client";
import { collection, item, order } from "@myakiba/db/schema/figure";
import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  sql,
  sum,
} from "drizzle-orm";
import type { ExpenseBucket, ExpenseFilters } from "../model";

export interface ItemTotalRow {
  readonly itemSpend: number;
  readonly itemCount: number;
}

export interface PaidItemTotalRow {
  readonly itemSpend: number;
  readonly paidItemCount: number;
}

export interface OrderTotalRow {
  readonly shippingSpend: number;
  readonly taxesSpend: number;
  readonly dutiesSpend: number;
  readonly tariffsSpend: number;
  readonly miscSpend: number;
  readonly orderItemSpend: number;
  readonly orderSpend: number;
  readonly paidOrderCount: number;
  readonly orderItemCount: number;
}

export interface ItemSeriesRow {
  readonly bucket: string;
  readonly itemSpend: number;
  readonly itemCount: number;
}

export interface OrderSeriesRow {
  readonly bucket: string;
  readonly shippingSpend: number;
  readonly taxesSpend: number;
  readonly dutiesSpend: number;
  readonly tariffsSpend: number;
  readonly miscSpend: number;
  readonly orderItemSpend: number;
  readonly orderSpend: number;
  readonly orderCount: number;
  readonly orderItemCount: number;
}

export interface ShippingSeriesRow {
  readonly bucket: string;
  readonly shippingMethod: ShippingMethod;
  readonly shippingSpend: number;
  readonly orderCount: number;
}

export interface BundleEfficiencyRow {
  readonly itemCount: number;
  readonly shippingMethod: ShippingMethod;
  readonly shippingFeeTotal: number;
  readonly orderCount: number;
}

export interface UnpaidOrderTotalRow {
  readonly items: number;
  readonly shipping: number;
  readonly taxes: number;
  readonly duties: number;
  readonly tariffs: number;
  readonly miscFees: number;
}

export interface UnpaidOrderPreviewRow {
  readonly orderId: string;
  readonly title: string;
  readonly shop: string;
  readonly expenseDate: string | null;
  readonly images: readonly string[];
  readonly itemSpend: number;
  readonly shipping: number;
  readonly taxes: number;
  readonly duties: number;
  readonly tariffs: number;
  readonly miscFees: number;
}

export const UNPAID_ORDER_PREVIEW = 6;

const EMPTY_UNPAID_TOTAL: UnpaidOrderTotalRow = {
  items: 0,
  shipping: 0,
  taxes: 0,
  duties: 0,
  tariffs: 0,
  miscFees: 0,
};

function orderAggregateFields(orderItems: ReturnType<typeof createOrderItemSpendByOrder>) {
  return {
    shippingSpend: sql<number>`COALESCE(${sum(order.shippingFee)}, 0)::double precision`,
    taxesSpend: sql<number>`COALESCE(${sum(order.taxes)}, 0)::double precision`,
    dutiesSpend: sql<number>`COALESCE(${sum(order.duties)}, 0)::double precision`,
    tariffsSpend: sql<number>`COALESCE(${sum(order.tariffs)}, 0)::double precision`,
    miscSpend: sql<number>`COALESCE(${sum(order.miscFees)}, 0)::double precision`,
    orderItemSpend: sql<number>`COALESCE(${sum(sql`COALESCE(${orderItems.itemSpend}, 0)`)}, 0)::double precision`,
    orderSpend: sql<number>`COALESCE(${sum(orderSpendSql(orderItems))}, 0)::double precision`,
    orderItemCount: sql<number>`COALESCE(${sum(sql`COALESCE(${orderItems.itemCount}, 0)`)}, 0)::integer`,
  };
}

export function getBucket(filters: ExpenseFilters): ExpenseBucket {
  if (!filters.dateStart || !filters.dateEnd) return "year";

  const start = new Date(`${filters.dateStart}T00:00:00.000Z`);
  const end = new Date(`${filters.dateEnd}T00:00:00.000Z`);
  const months =
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth();

  return months <= 24 ? "month" : "year";
}

export function realizedOrderDateSql(): ReturnType<typeof sql> {
  return sql`COALESCE(${order.paymentDate}, ${order.collectionDate}, ${order.shippingDate}, ${order.orderDate}, ${order.releaseDate})`;
}

function realizedItemDateSql(): ReturnType<typeof sql> {
  return sql`COALESCE(${collection.paymentDate}, ${collection.collectionDate}, ${collection.shippingDate}, ${collection.orderDate}, ${order.paymentDate}, ${order.collectionDate}, ${order.shippingDate}, ${order.orderDate}, ${order.releaseDate})`;
}

function bucketSql(
  dateSql: ReturnType<typeof sql>,
  bucket: ExpenseBucket,
): ReturnType<typeof sql<string>> {
  return bucket === "month"
    ? sql<string>`to_char(date_trunc('month', ${dateSql}), 'YYYY-MM')`
    : sql<string>`to_char(date_trunc('year', ${dateSql}), 'YYYY')`;
}

export function orderFeeSpendSql(): ReturnType<typeof sql> {
  return sql`COALESCE(${order.shippingFee}, 0) + COALESCE(${order.taxes}, 0) + COALESCE(${order.duties}, 0) + COALESCE(${order.tariffs}, 0) + COALESCE(${order.miscFees}, 0)`;
}

export function orderSpendSql(
  orderItems: ReturnType<typeof createOrderItemSpendByOrder>,
): ReturnType<typeof sql> {
  return sql`COALESCE(${orderItems.itemSpend}, 0) + ${orderFeeSpendSql()}`;
}

export function feeSpend(
  row: Pick<
    OrderTotalRow,
    "shippingSpend" | "taxesSpend" | "dutiesSpend" | "tariffsSpend" | "miscSpend"
  >,
): number {
  return row.shippingSpend + row.taxesSpend + row.dutiesSpend + row.tariffsSpend + row.miscSpend;
}

export function toAverage(total: number, countValue: number): number {
  return countValue > 0 ? Math.round(total / countValue) : 0;
}

export function collectionShopWhere(
  shop: readonly string[] | undefined,
): ReturnType<typeof inArray> | undefined {
  return shop && shop.length > 0 ? inArray(collection.shop, shop) : undefined;
}

export function dateRangeWhere(
  dateSql: ReturnType<typeof sql>,
  filters: ExpenseFilters,
): ReturnType<typeof and> {
  return and(
    filters.dateStart ? gte(dateSql, filters.dateStart) : undefined,
    filters.dateEnd ? lte(dateSql, filters.dateEnd) : undefined,
  );
}

function aggregateDateCondition(
  dateSql: ReturnType<typeof sql>,
  filters: ExpenseFilters,
  mode: "total" | "series" | "nullDateTotal",
): ReturnType<typeof and> | ReturnType<typeof dateRangeWhere> {
  if (mode === "total") {
    return dateRangeWhere(dateSql, filters);
  }

  if (mode === "series") {
    return and(isNotNull(dateSql), dateRangeWhere(dateSql, filters));
  }

  return and(isNull(dateSql), dateRangeWhere(dateSql, filters));
}

export function collectionWhere(
  userId: string,
  filters: ExpenseFilters,
  scope: "paid" | "owned",
  mode: "total" | "series" | "nullDateTotal",
): ReturnType<typeof and> {
  const statusCondition =
    scope === "paid" ? ne(collection.status, "Ordered") : eq(collection.status, "Owned");
  const dateSql = realizedItemDateSql();
  const dateCondition = aggregateDateCondition(dateSql, filters, mode);

  return and(
    eq(collection.userId, userId),
    statusCondition,
    collectionShopWhere(filters.shop),
    dateCondition,
  );
}

function orderWhere(
  userId: string,
  filters: ExpenseFilters,
  mode: "total" | "series" | "nullDateTotal",
): ReturnType<typeof and> {
  const dateSql = realizedOrderDateSql();
  const dateCondition = aggregateDateCondition(dateSql, filters, mode);

  return and(
    eq(order.userId, userId),
    ne(order.status, "Ordered"),
    filters.shop && filters.shop.length > 0 ? inArray(order.shop, filters.shop) : undefined,
    dateCondition,
  );
}

export function paidOrderWhere(userId: string, filters: ExpenseFilters): ReturnType<typeof and> {
  return orderWhere(userId, filters, "total");
}

export function unpaidOrderWhere(userId: string, filters: ExpenseFilters): ReturnType<typeof and> {
  const dateSql = realizedOrderDateSql();

  return and(
    eq(order.userId, userId),
    eq(order.status, "Ordered"),
    filters.shop && filters.shop.length > 0 ? inArray(order.shop, filters.shop) : undefined,
    dateRangeWhere(dateSql, filters),
  );
}

export function createUnpaidOrderItemSpendByOrder(userId: string) {
  return db
    .select({
      orderId: collection.orderId,
      itemSpend: sql<number>`COALESCE(${sum(collection.price)}, 0)::double precision`.as(
        "itemSpend",
      ),
      itemCount: count(collection.id).as("itemCount"),
    })
    .from(collection)
    .where(and(eq(collection.userId, userId), eq(collection.status, "Ordered")))
    .groupBy(collection.orderId)
    .as("unpaid_order_items");
}

export function createOrderItemSpendByOrder(userId: string, filters: ExpenseFilters) {
  return db
    .select({
      orderId: collection.orderId,
      itemSpend: sql<number>`COALESCE(${sum(collection.price)}, 0)::double precision`.as(
        "itemSpend",
      ),
      itemCount: count(collection.id).as("itemCount"),
    })
    .from(collection)
    .innerJoin(order, eq(collection.orderId, order.id))
    .where(
      and(
        eq(collection.userId, userId),
        eq(order.userId, userId),
        ne(order.status, "Ordered"),
        filters.shop && filters.shop.length > 0 ? inArray(order.shop, filters.shop) : undefined,
        dateRangeWhere(realizedOrderDateSql(), filters),
      ),
    )
    .groupBy(collection.orderId)
    .as("order_items");
}

export const EMPTY_PAID_ITEM_TOTAL = { itemSpend: 0, paidItemCount: 0 } as const;
export const EMPTY_OWNED_ITEM_TOTAL = { itemSpend: 0, itemCount: 0 } as const;
export const EMPTY_ORDER_TOTAL = {
  shippingSpend: 0,
  taxesSpend: 0,
  dutiesSpend: 0,
  tariffsSpend: 0,
  miscSpend: 0,
  orderItemSpend: 0,
  orderSpend: 0,
  paidOrderCount: 0,
  orderItemCount: 0,
} as const;

export async function loadNullDateExpenseFacts(userId: string, filters: ExpenseFilters) {
  const orderItems = createOrderItemSpendByOrder(userId, filters);
  const itemSpend = sql<number>`COALESCE(${sum(collection.price)}, 0)::double precision`;
  const orderFields = orderAggregateFields(orderItems);

  const [paidItemTotals, ownedItemTotals, orderTotals] = await Promise.all([
    db
      .select({
        itemSpend,
        paidItemCount: count(),
      })
      .from(collection)
      .leftJoin(order, eq(collection.orderId, order.id))
      .where(collectionWhere(userId, filters, "paid", "nullDateTotal")),
    db
      .select({
        itemSpend,
        itemCount: count(),
      })
      .from(collection)
      .leftJoin(order, eq(collection.orderId, order.id))
      .where(collectionWhere(userId, filters, "owned", "nullDateTotal")),
    db
      .select({
        ...orderFields,
        paidOrderCount: count(),
      })
      .from(order)
      .leftJoin(orderItems, eq(order.id, orderItems.orderId))
      .where(orderWhere(userId, filters, "nullDateTotal")),
  ]);

  return {
    paidItemTotal: paidItemTotals[0] ?? EMPTY_PAID_ITEM_TOTAL,
    ownedItemTotal: ownedItemTotals[0] ?? EMPTY_OWNED_ITEM_TOTAL,
    orderTotal: orderTotals[0] ?? EMPTY_ORDER_TOTAL,
  };
}

export function getPaidItemAggregates(
  userId: string,
  filters: ExpenseFilters,
): Promise<PaidItemTotalRow[]>;
export function getPaidItemAggregates(
  userId: string,
  filters: ExpenseFilters,
  options: { readonly bucket: ExpenseBucket },
): Promise<ItemSeriesRow[]>;
export function getPaidItemAggregates(
  userId: string,
  filters: ExpenseFilters,
  options?: { readonly bucket?: ExpenseBucket },
): Promise<PaidItemTotalRow[] | ItemSeriesRow[]> {
  const bucket = options?.bucket;
  const itemSpend = sql<number>`COALESCE(${sum(collection.price)}, 0)::double precision`;

  if (bucket) {
    const itemBucket = bucketSql(realizedItemDateSql(), bucket);

    return db
      .select({
        bucket: itemBucket,
        itemSpend,
        itemCount: count(),
      })
      .from(collection)
      .leftJoin(order, eq(collection.orderId, order.id))
      .where(collectionWhere(userId, filters, "paid", "series"))
      .groupBy(itemBucket)
      .orderBy(itemBucket);
  }

  return db
    .select({
      itemSpend,
      paidItemCount: count(),
    })
    .from(collection)
    .leftJoin(order, eq(collection.orderId, order.id))
    .where(collectionWhere(userId, filters, "paid", "total"));
}

export function getOwnedItemAggregates(
  userId: string,
  filters: ExpenseFilters,
): Promise<ItemTotalRow[]>;
export function getOwnedItemAggregates(
  userId: string,
  filters: ExpenseFilters,
  options: { readonly bucket: ExpenseBucket },
): Promise<ItemSeriesRow[]>;
export function getOwnedItemAggregates(
  userId: string,
  filters: ExpenseFilters,
  options?: { readonly bucket?: ExpenseBucket },
): Promise<ItemTotalRow[] | ItemSeriesRow[]> {
  const bucket = options?.bucket;
  const itemSpend = sql<number>`COALESCE(${sum(collection.price)}, 0)::double precision`;

  if (bucket) {
    const itemBucket = bucketSql(realizedItemDateSql(), bucket);

    return db
      .select({
        bucket: itemBucket,
        itemSpend,
        itemCount: count(),
      })
      .from(collection)
      .leftJoin(order, eq(collection.orderId, order.id))
      .where(collectionWhere(userId, filters, "owned", "series"))
      .groupBy(itemBucket)
      .orderBy(itemBucket);
  }

  return db
    .select({
      itemSpend,
      itemCount: count(),
    })
    .from(collection)
    .leftJoin(order, eq(collection.orderId, order.id))
    .where(collectionWhere(userId, filters, "owned", "total"));
}

export function getOrderAggregates(
  userId: string,
  filters: ExpenseFilters,
): Promise<OrderTotalRow[]>;
export function getOrderAggregates(
  userId: string,
  filters: ExpenseFilters,
  options: { readonly bucket: ExpenseBucket },
): Promise<OrderSeriesRow[]>;
export function getOrderAggregates(
  userId: string,
  filters: ExpenseFilters,
  options?: { readonly bucket?: ExpenseBucket },
): Promise<OrderTotalRow[] | OrderSeriesRow[]> {
  const orderItems = createOrderItemSpendByOrder(userId, filters);
  const bucket = options?.bucket;
  const orderFields = orderAggregateFields(orderItems);

  if (bucket) {
    const orderBucket = bucketSql(realizedOrderDateSql(), bucket);

    return db
      .select({
        bucket: orderBucket,
        ...orderFields,
        orderCount: count(),
      })
      .from(order)
      .leftJoin(orderItems, eq(order.id, orderItems.orderId))
      .where(orderWhere(userId, filters, "series"))
      .groupBy(orderBucket)
      .orderBy(orderBucket);
  }

  return db
    .select({
      ...orderFields,
      paidOrderCount: count(),
    })
    .from(order)
    .leftJoin(orderItems, eq(order.id, orderItems.orderId))
    .where(paidOrderWhere(userId, filters));
}

export async function getUnpaidOrderAggregates(
  userId: string,
  filters: ExpenseFilters,
): Promise<UnpaidOrderTotalRow> {
  const orderItems = createUnpaidOrderItemSpendByOrder(userId);

  const [row] = await db
    .select({
      items: sql<number>`COALESCE(${sum(sql`COALESCE(${orderItems.itemSpend}, 0)`)}, 0)::double precision`,
      shipping: sql<number>`COALESCE(${sum(order.shippingFee)}, 0)::double precision`,
      taxes: sql<number>`COALESCE(${sum(order.taxes)}, 0)::double precision`,
      duties: sql<number>`COALESCE(${sum(order.duties)}, 0)::double precision`,
      tariffs: sql<number>`COALESCE(${sum(order.tariffs)}, 0)::double precision`,
      miscFees: sql<number>`COALESCE(${sum(order.miscFees)}, 0)::double precision`,
    })
    .from(order)
    .leftJoin(orderItems, eq(order.id, orderItems.orderId))
    .where(unpaidOrderWhere(userId, filters));

  return row
    ? {
        items: Number(row.items),
        shipping: Number(row.shipping),
        taxes: Number(row.taxes),
        duties: Number(row.duties),
        tariffs: Number(row.tariffs),
        miscFees: Number(row.miscFees),
      }
    : EMPTY_UNPAID_TOTAL;
}

export async function getUnpaidOrderPreview(
  userId: string,
  filters: ExpenseFilters,
  limit: number,
): Promise<{ readonly rows: readonly UnpaidOrderPreviewRow[]; readonly totalCount: number }> {
  const orderItems = createUnpaidOrderItemSpendByOrder(userId);

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
      totalCount: sql<number>`COUNT(*) OVER()::integer`,
    })
    .from(order)
    .leftJoin(orderItems, eq(order.id, orderItems.orderId))
    .leftJoin(collection, eq(order.id, collection.orderId))
    .leftJoin(item, eq(collection.itemId, item.id))
    .where(unpaidOrderWhere(userId, filters))
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
    .orderBy(desc(sql`COALESCE(${orderItems.itemSpend}, 0) + ${orderFeeSpendSql()}`))
    .limit(limit);

  return {
    rows: rows.map((row) => ({
      orderId: row.orderId,
      title: row.title,
      shop: row.shop,
      expenseDate: row.expenseDate,
      images: row.images.slice(0, 4),
      itemSpend: Number(row.itemSpend),
      shipping: Number(row.shipping ?? 0),
      taxes: Number(row.taxes ?? 0),
      duties: Number(row.duties ?? 0),
      tariffs: Number(row.tariffs ?? 0),
      miscFees: Number(row.miscFees ?? 0),
    })),
    totalCount: rows[0]?.totalCount ?? 0,
  };
}

export function getShippingSeries(
  userId: string,
  filters: ExpenseFilters,
  bucket: ExpenseBucket,
): Promise<ShippingSeriesRow[]> {
  const orderBucket = bucketSql(realizedOrderDateSql(), bucket);

  return db
    .select({
      bucket: orderBucket,
      shippingMethod: order.shippingMethod,
      shippingSpend: sql<number>`COALESCE(${sum(order.shippingFee)}, 0)::double precision`,
      orderCount: count(),
    })
    .from(order)
    .where(orderWhere(userId, filters, "series"))
    .groupBy(orderBucket, order.shippingMethod)
    .orderBy(orderBucket, order.shippingMethod);
}

export function getBundleEfficiencyRows(
  userId: string,
  filters: ExpenseFilters,
): Promise<BundleEfficiencyRow[]> {
  const orderBundles = db.$with("order_bundles").as(
    db
      .select({
        itemCount: sql<number>`${count(collection.id)}::integer`.as("item_count"),
        shippingMethod: order.shippingMethod,
        shippingFee: order.shippingFee,
      })
      .from(order)
      .leftJoin(collection, eq(order.id, collection.orderId))
      .where(paidOrderWhere(userId, filters))
      .groupBy(order.id, order.shippingMethod, order.shippingFee),
  );

  return db
    .with(orderBundles)
    .select({
      itemCount: sql<number>`"order_bundles"."item_count"`,
      shippingMethod: sql<ShippingMethod>`"order_bundles"."shipping_method"`,
      shippingFeeTotal: sql<number>`COALESCE(${sum(sql`"order_bundles"."shipping_fee"`)}, 0)::double precision`,
      orderCount: sql<number>`${count()}::integer`,
    })
    .from(orderBundles)
    .groupBy(sql`"order_bundles"."item_count"`, sql`"order_bundles"."shipping_method"`)
    .orderBy(sql`"order_bundles"."item_count"`, sql`"order_bundles"."shipping_method"`);
}
