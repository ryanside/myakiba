import type { Category, ShippingMethod } from "@myakiba/contracts/shared/types";
import { db } from "@myakiba/db/client";
import { collection, item, order } from "@myakiba/db/schema/figure";
import { and, count, desc, eq, gte, inArray, isNotNull, lte, ne, sql, sum } from "drizzle-orm";
import type { ExpenseBucket, ExpenseFilters } from "../model";

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

export interface CollectionSummaryRow {
  readonly spend: number;
  readonly itemCount: number;
  readonly orderLinkedSpend: number;
  readonly orderLinkedCount: number;
  readonly standaloneSpend: number;
  readonly standaloneCount: number;
  readonly shopCount: number;
}

export interface CollectionCategoryRow {
  readonly category: Category;
  readonly count: number;
  readonly spend: number;
}

export interface ShippingMethodTotalRow {
  readonly shippingMethod: ShippingMethod;
  readonly shippingSpend: number;
  readonly orderCount: number;
  readonly chargedOrderCount: number;
  readonly freeOrderCount: number;
}

export interface UnpaidOrderTotalRow {
  readonly orderCount: number;
  readonly items: number;
  readonly shipping: number;
  readonly taxes: number;
  readonly duties: number;
  readonly tariffs: number;
  readonly miscFees: number;
}

const EMPTY_UNPAID_TOTAL: UnpaidOrderTotalRow = {
  orderCount: 0,
  items: 0,
  shipping: 0,
  taxes: 0,
  duties: 0,
  tariffs: 0,
  miscFees: 0,
};

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

export async function getCollectionSummary(
  userId: string,
  filters: ExpenseFilters,
): Promise<CollectionSummaryRow> {
  const [row] = await db
    .select({
      spend: sql<number>`COALESCE(${sum(collection.price)}, 0)::double precision`,
      itemCount: sql<number>`${count(collection.id)}::integer`,
      orderLinkedSpend: sql<number>`COALESCE(${sum(
        sql`CASE WHEN ${collection.orderId} IS NOT NULL THEN ${collection.price} ELSE 0 END`,
      )}, 0)::double precision`,
      orderLinkedCount: sql<number>`COUNT(${collection.id}) FILTER (WHERE ${collection.orderId} IS NOT NULL)::integer`,
      standaloneSpend: sql<number>`COALESCE(${sum(
        sql`CASE WHEN ${collection.orderId} IS NULL THEN ${collection.price} ELSE 0 END`,
      )}, 0)::double precision`,
      standaloneCount: sql<number>`COUNT(${collection.id}) FILTER (WHERE ${collection.orderId} IS NULL)::integer`,
      shopCount: sql<number>`COUNT(DISTINCT NULLIF(${collection.shop}, ''))::integer`,
    })
    .from(collection)
    .leftJoin(order, eq(collection.orderId, order.id))
    .where(collectionWhere(userId, filters, "total"));

  return (
    row ?? {
      spend: 0,
      itemCount: 0,
      orderLinkedSpend: 0,
      orderLinkedCount: 0,
      standaloneSpend: 0,
      standaloneCount: 0,
      shopCount: 0,
    }
  );
}

export function getCollectionCategoryRows(
  userId: string,
  filters: ExpenseFilters,
): Promise<CollectionCategoryRow[]> {
  return db
    .select({
      category: sql<Category>`${item.category}::text`,
      count: sql<number>`${count(collection.id)}::integer`,
      spend: sql<number>`COALESCE(${sum(collection.price)}, 0)::double precision`,
    })
    .from(collection)
    .innerJoin(item, eq(collection.itemId, item.id))
    .leftJoin(order, eq(collection.orderId, order.id))
    .where(and(collectionWhere(userId, filters, "total"), isNotNull(item.category)))
    .groupBy(item.category)
    .orderBy(desc(count(collection.id)), item.category);
}

function bucketSql(
  dateSql: ReturnType<typeof sql>,
  bucket: ExpenseBucket,
): ReturnType<typeof sql<string>> {
  return bucket === "month"
    ? sql<string>`to_char(date_trunc('month', ${dateSql}), 'YYYY-MM')`
    : sql<string>`to_char(date_trunc('year', ${dateSql}), 'YYYY')`;
}

export function collectionWhere(
  userId: string,
  filters: ExpenseFilters,
  mode: "total" | "series",
): ReturnType<typeof and> {
  const dateSql = realizedItemDateSql();

  return and(
    eq(collection.userId, userId),
    eq(collection.status, "Owned"),
    filters.shop && filters.shop.length > 0 ? inArray(collection.shop, filters.shop) : undefined,
    mode === "series" ? isNotNull(dateSql) : undefined,
    filters.dateStart ? gte(dateSql, filters.dateStart) : undefined,
    filters.dateEnd ? lte(dateSql, filters.dateEnd) : undefined,
  );
}

export function orderWhere(
  userId: string,
  filters: ExpenseFilters,
  mode: "total" | "series",
): ReturnType<typeof and> {
  const dateSql = realizedOrderDateSql();

  return and(
    eq(order.userId, userId),
    ne(order.status, "Ordered"),
    filters.shop && filters.shop.length > 0 ? inArray(order.shop, filters.shop) : undefined,
    mode === "series" ? isNotNull(dateSql) : undefined,
    filters.dateStart ? gte(dateSql, filters.dateStart) : undefined,
    filters.dateEnd ? lte(dateSql, filters.dateEnd) : undefined,
  );
}

function unpaidOrderWhere(userId: string, filters: ExpenseFilters): ReturnType<typeof and> {
  const dateSql = realizedOrderDateSql();

  return and(
    eq(order.userId, userId),
    eq(order.status, "Ordered"),
    filters.shop && filters.shop.length > 0 ? inArray(order.shop, filters.shop) : undefined,
    filters.dateStart ? gte(dateSql, filters.dateStart) : undefined,
    filters.dateEnd ? lte(dateSql, filters.dateEnd) : undefined,
  );
}

function createUnpaidOrderItemSpendByOrder(userId: string) {
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
  const dateSql = realizedOrderDateSql();

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
        filters.dateStart ? gte(dateSql, filters.dateStart) : undefined,
        filters.dateEnd ? lte(dateSql, filters.dateEnd) : undefined,
      ),
    )
    .groupBy(collection.orderId)
    .as("order_items");
}

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

export function getOwnedItemSeries(
  userId: string,
  filters: ExpenseFilters,
  bucket: ExpenseBucket,
): Promise<ItemSeriesRow[]> {
  const itemSpend = sql<number>`COALESCE(${sum(collection.price)}, 0)::double precision`;
  const itemBucket = bucketSql(realizedItemDateSql(), bucket);
  return db
    .select({
      bucket: itemBucket,
      itemSpend,
      itemCount: count(),
    })
    .from(collection)
    .leftJoin(order, eq(collection.orderId, order.id))
    .where(collectionWhere(userId, filters, "series"))
    .groupBy(itemBucket)
    .orderBy(itemBucket);
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

  if (bucket) {
    const orderBucket = bucketSql(realizedOrderDateSql(), bucket);

    return db
      .select({
        bucket: orderBucket,
        shippingSpend: sql<number>`COALESCE(${sum(order.shippingFee)}, 0)::double precision`,
        taxesSpend: sql<number>`COALESCE(${sum(order.taxes)}, 0)::double precision`,
        dutiesSpend: sql<number>`COALESCE(${sum(order.duties)}, 0)::double precision`,
        tariffsSpend: sql<number>`COALESCE(${sum(order.tariffs)}, 0)::double precision`,
        miscSpend: sql<number>`COALESCE(${sum(order.miscFees)}, 0)::double precision`,
        orderItemSpend: sql<number>`COALESCE(${sum(sql`COALESCE(${orderItems.itemSpend}, 0)`)}, 0)::double precision`,
        orderSpend: sql<number>`COALESCE(${sum(
          sql`COALESCE(${orderItems.itemSpend}, 0) + COALESCE(${order.shippingFee}, 0) + COALESCE(${order.taxes}, 0) + COALESCE(${order.duties}, 0) + COALESCE(${order.tariffs}, 0) + COALESCE(${order.miscFees}, 0)`,
        )}, 0)::double precision`,
        orderItemCount: sql<number>`COALESCE(${sum(sql`COALESCE(${orderItems.itemCount}, 0)`)}, 0)::integer`,
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
      shippingSpend: sql<number>`COALESCE(${sum(order.shippingFee)}, 0)::double precision`,
      taxesSpend: sql<number>`COALESCE(${sum(order.taxes)}, 0)::double precision`,
      dutiesSpend: sql<number>`COALESCE(${sum(order.duties)}, 0)::double precision`,
      tariffsSpend: sql<number>`COALESCE(${sum(order.tariffs)}, 0)::double precision`,
      miscSpend: sql<number>`COALESCE(${sum(order.miscFees)}, 0)::double precision`,
      orderItemSpend: sql<number>`COALESCE(${sum(sql`COALESCE(${orderItems.itemSpend}, 0)`)}, 0)::double precision`,
      orderSpend: sql<number>`COALESCE(${sum(
        sql`COALESCE(${orderItems.itemSpend}, 0) + COALESCE(${order.shippingFee}, 0) + COALESCE(${order.taxes}, 0) + COALESCE(${order.duties}, 0) + COALESCE(${order.tariffs}, 0) + COALESCE(${order.miscFees}, 0)`,
      )}, 0)::double precision`,
      orderItemCount: sql<number>`COALESCE(${sum(sql`COALESCE(${orderItems.itemCount}, 0)`)}, 0)::integer`,
      paidOrderCount: count(),
    })
    .from(order)
    .leftJoin(orderItems, eq(order.id, orderItems.orderId))
    .where(orderWhere(userId, filters, "total"));
}

export async function getUnpaidOrderAggregates(
  userId: string,
  filters: ExpenseFilters,
): Promise<UnpaidOrderTotalRow> {
  const orderItems = createUnpaidOrderItemSpendByOrder(userId);

  const [row] = await db
    .select({
      orderCount: count(),
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
        orderCount: Number(row.orderCount),
        items: Number(row.items),
        shipping: Number(row.shipping),
        taxes: Number(row.taxes),
        duties: Number(row.duties),
        tariffs: Number(row.tariffs),
        miscFees: Number(row.miscFees),
      }
    : EMPTY_UNPAID_TOTAL;
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

export function getShippingMethodTotals(
  userId: string,
  filters: ExpenseFilters,
): Promise<ShippingMethodTotalRow[]> {
  return db
    .select({
      shippingMethod: order.shippingMethod,
      shippingSpend: sql<number>`COALESCE(${sum(order.shippingFee)}, 0)::double precision`,
      orderCount: sql<number>`${count(order.id)}::integer`,
      chargedOrderCount: sql<number>`COUNT(${order.id}) FILTER (WHERE ${order.shippingFee} > 0)::integer`,
      freeOrderCount: sql<number>`COUNT(${order.id}) FILTER (WHERE ${order.shippingFee} = 0)::integer`,
    })
    .from(order)
    .where(orderWhere(userId, filters, "total"))
    .groupBy(order.shippingMethod)
    .orderBy(order.shippingMethod);
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
      .where(orderWhere(userId, filters, "total"))
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
