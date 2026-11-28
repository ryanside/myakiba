import type { Category, ShippingMethod } from "@myakiba/contracts/shared/types";
import type { ReleaseDate } from "@myakiba/contracts/shared/release-date";
import type { ReadTx } from "@myakiba/db/tx";
import { collection, item, order } from "@myakiba/db/schema/figure";
import { and, count, desc, eq, gte, inArray, isNotNull, lte, sql, sum } from "drizzle-orm";
import type { AnyColumn, SQL } from "drizzle-orm";
import {
  itemOrderJoin,
  orderFees,
  orderIsPaid,
  paidItemCount,
  paidItemPrice,
  selectUnpaidCosts,
} from "@/lib/order-money";
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
  readonly paidItemCount: number;
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
  readonly paidItemCount: number;
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

export interface UnpaidCostsRow {
  readonly unpaidOrderCount: number;
  readonly unpaidCosts: number;
}

export function getBucket(filters: ExpenseFilters): ExpenseBucket {
  if (!filters.dateStart || !filters.dateEnd) return "year";

  const start = new Date(`${filters.dateStart}T00:00:00.000Z`);
  const end = new Date(`${filters.dateEnd}T00:00:00.000Z`);
  const months =
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth();

  return months <= 24 ? "month" : "year";
}

function realizedOrderDateSql(): ReturnType<typeof sql> {
  return sql`COALESCE(${order.paymentDate}, ${order.collectionDate}, ${order.shippingDate}, ${order.orderDate}, ${order.releaseDate})`;
}

export function realizedOrderDateWithPrecisionSql() {
  const dated = sql`COALESCE(${order.paymentDate}, ${order.collectionDate}, ${order.shippingDate}, ${order.orderDate})`;
  return sql<ReleaseDate | null>`CASE
    WHEN ${dated} IS NOT NULL THEN jsonb_build_object('start', ${dated}, 'precision', 'day')
    WHEN ${order.releaseDate} IS NOT NULL
      THEN jsonb_build_object('start', ${order.releaseDate}, 'precision', ${order.releaseDatePrecision})
  END`;
}

function realizedItemDateSql(): ReturnType<typeof sql> {
  return sql`COALESCE(${collection.paymentDate}, ${collection.collectionDate}, ${collection.shippingDate}, ${collection.orderDate}, ${order.paymentDate}, ${order.collectionDate}, ${order.shippingDate}, ${order.orderDate}, ${order.releaseDate})`;
}

export async function getCollectionSummary(
  tx: ReadTx,
  userId: string,
  filters: ExpenseFilters,
): Promise<CollectionSummaryRow> {
  const [row] = await tx
    .select({
      spend: sql<number>`COALESCE(${sum(paidItemPrice)}, 0)::double precision`,
      itemCount: sql<number>`${count(collection.id)}::integer`,
      paidItemCount: sql<number>`${paidItemCount}::integer`,
      orderLinkedSpend: sql<number>`COALESCE(${sum(
        sql`CASE WHEN ${collection.orderId} IS NOT NULL THEN ${paidItemPrice} ELSE 0 END`,
      )}, 0)::double precision`,
      orderLinkedCount: sql<number>`COUNT(${collection.id}) FILTER (WHERE ${collection.orderId} IS NOT NULL)::integer`,
      standaloneSpend: sql<number>`COALESCE(${sum(
        sql`CASE WHEN ${collection.orderId} IS NULL THEN ${paidItemPrice} ELSE 0 END`,
      )}, 0)::double precision`,
      standaloneCount: sql<number>`COUNT(${collection.id}) FILTER (WHERE ${collection.orderId} IS NULL)::integer`,
      shopCount: sql<number>`COUNT(DISTINCT NULLIF(${collection.shop}, ''))::integer`,
    })
    .from(collection)
    .leftJoin(...itemOrderJoin)
    .where(collectionWhere(userId, filters, "total"));

  return (
    row ?? {
      spend: 0,
      itemCount: 0,
      paidItemCount: 0,
      orderLinkedSpend: 0,
      orderLinkedCount: 0,
      standaloneSpend: 0,
      standaloneCount: 0,
      shopCount: 0,
    }
  );
}

export function getCollectionCategoryRows(
  tx: ReadTx,
  userId: string,
  filters: ExpenseFilters,
): Promise<CollectionCategoryRow[]> {
  return tx
    .select({
      category: sql<Category>`${item.category}::text`,
      count: sql<number>`${count(collection.id)}::integer`,
      spend: sql<number>`COALESCE(${sum(paidItemPrice)}, 0)::double precision`,
    })
    .from(collection)
    .innerJoin(item, eq(collection.itemId, item.id))
    .leftJoin(...itemOrderJoin)
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

function matchingOrderWhere(
  userId: string,
  filters: ExpenseFilters,
  mode: "total" | "series",
): ReturnType<typeof and> {
  const dateSql = realizedOrderDateSql();

  return and(
    eq(order.userId, userId),
    shopWhere(filters.shop),
    mode === "series" ? isNotNull(dateSql) : undefined,
    filters.dateStart ? gte(dateSql, filters.dateStart) : undefined,
    filters.dateEnd ? lte(dateSql, filters.dateEnd) : undefined,
  );
}

function shopWhere(shop: ExpenseFilters["shop"]): ReturnType<typeof inArray> | undefined {
  return shop && shop.length > 0 ? inArray(order.shop, shop) : undefined;
}

export function paidOrderWhere(
  userId: string,
  filters: ExpenseFilters,
  mode: "total" | "series",
): ReturnType<typeof and> {
  return and(matchingOrderWhere(userId, filters, mode), orderIsPaid);
}

export function createOrderItemSpendByOrder(tx: ReadTx, userId: string, filters: ExpenseFilters) {
  return tx
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
      and(eq(collection.userId, userId), matchingOrderWhere(userId, filters, "total"), orderIsPaid),
    )
    .groupBy(collection.orderId)
    .as("order_items");
}

function feeSpend(fee: SQL | AnyColumn): SQL<number> {
  return sql<number>`COALESCE(SUM(${fee}) FILTER (WHERE ${orderIsPaid}), 0)::double precision`;
}

export function orderSpendSums(orderItems: ReturnType<typeof createOrderItemSpendByOrder>) {
  const orderItemSpend = sql<number>`COALESCE(${sum(sql`COALESCE(${orderItems.itemSpend}, 0)`)}, 0)::double precision`;
  const fees = feeSpend(orderFees);
  return {
    orderItemSpend,
    orderItemCount: sql<number>`COALESCE(${sum(sql`COALESCE(${orderItems.itemCount}, 0)`)}, 0)::integer`,
    fees,
    orderSpend: sql<number>`${orderItemSpend} + ${fees}`,
    paidOrderCount: sql<number>`(COUNT(*) FILTER (WHERE ${orderIsPaid}))::integer`,
  };
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
  tx: ReadTx,
  userId: string,
  filters: ExpenseFilters,
  bucket: ExpenseBucket,
): Promise<ItemSeriesRow[]> {
  const itemSpend = sql<number>`COALESCE(${sum(paidItemPrice)}, 0)::double precision`;
  const itemBucket = bucketSql(realizedItemDateSql(), bucket);
  return tx
    .select({
      bucket: itemBucket,
      itemSpend,
      paidItemCount: sql<number>`${paidItemCount}::integer`,
    })
    .from(collection)
    .leftJoin(...itemOrderJoin)
    .where(collectionWhere(userId, filters, "series"))
    .groupBy(itemBucket)
    .orderBy(itemBucket);
}

export function getOrderAggregates(
  tx: ReadTx,
  userId: string,
  filters: ExpenseFilters,
): Promise<OrderTotalRow[]>;
export function getOrderAggregates(
  tx: ReadTx,
  userId: string,
  filters: ExpenseFilters,
  options: { readonly bucket: ExpenseBucket },
): Promise<OrderSeriesRow[]>;
export function getOrderAggregates(
  tx: ReadTx,
  userId: string,
  filters: ExpenseFilters,
  options?: { readonly bucket?: ExpenseBucket },
): Promise<OrderTotalRow[] | OrderSeriesRow[]> {
  const orderItems = createOrderItemSpendByOrder(tx, userId, filters);
  const { orderItemSpend, orderItemCount, orderSpend, paidOrderCount } = orderSpendSums(orderItems);
  const spend = {
    shippingSpend: feeSpend(order.shippingFee),
    taxesSpend: feeSpend(order.taxes),
    dutiesSpend: feeSpend(order.duties),
    tariffsSpend: feeSpend(order.tariffs),
    miscSpend: feeSpend(order.miscFees),
    orderItemSpend,
    orderSpend,
    orderItemCount,
  };
  const bucket = options?.bucket;

  if (bucket) {
    const orderBucket = bucketSql(realizedOrderDateSql(), bucket);

    return tx
      .select({ bucket: orderBucket, ...spend, orderCount: paidOrderCount })
      .from(order)
      .leftJoin(orderItems, eq(order.id, orderItems.orderId))
      .where(paidOrderWhere(userId, filters, "series"))
      .groupBy(orderBucket)
      .orderBy(orderBucket);
  }

  return tx
    .select({ ...spend, paidOrderCount })
    .from(order)
    .leftJoin(orderItems, eq(order.id, orderItems.orderId))
    .where(paidOrderWhere(userId, filters, "total"));
}

export async function getUnpaidCosts(
  tx: ReadTx,
  userId: string,
  shop: ExpenseFilters["shop"],
): Promise<UnpaidCostsRow> {
  const [row] = await selectUnpaidCosts(tx, and(eq(order.userId, userId), shopWhere(shop)));
  return row ?? { unpaidOrderCount: 0, unpaidCosts: 0 };
}

export function getShippingSeries(
  tx: ReadTx,
  userId: string,
  filters: ExpenseFilters,
  bucket: ExpenseBucket,
): Promise<ShippingSeriesRow[]> {
  const orderBucket = bucketSql(realizedOrderDateSql(), bucket);

  return tx
    .select({
      bucket: orderBucket,
      shippingMethod: order.shippingMethod,
      shippingSpend: sql<number>`COALESCE(${sum(order.shippingFee)}, 0)::double precision`,
      orderCount: count(),
    })
    .from(order)
    .where(paidOrderWhere(userId, filters, "series"))
    .groupBy(orderBucket, order.shippingMethod)
    .orderBy(orderBucket, order.shippingMethod);
}

export function getShippingMethodTotals(
  tx: ReadTx,
  userId: string,
  filters: ExpenseFilters,
): Promise<ShippingMethodTotalRow[]> {
  return tx
    .select({
      shippingMethod: order.shippingMethod,
      shippingSpend: sql<number>`COALESCE(${sum(order.shippingFee)}, 0)::double precision`,
      orderCount: sql<number>`${count(order.id)}::integer`,
      chargedOrderCount: sql<number>`COUNT(${order.id}) FILTER (WHERE ${order.shippingFee} > 0)::integer`,
      freeOrderCount: sql<number>`COUNT(${order.id}) FILTER (WHERE ${order.shippingFee} = 0)::integer`,
    })
    .from(order)
    .where(paidOrderWhere(userId, filters, "total"))
    .groupBy(order.shippingMethod)
    .orderBy(order.shippingMethod);
}

export function getBundleEfficiencyRows(
  tx: ReadTx,
  userId: string,
  filters: ExpenseFilters,
): Promise<BundleEfficiencyRow[]> {
  const orderBundles = tx.$with("order_bundles").as(
    tx
      .select({
        itemCount: sql<number>`${count(collection.id)}::integer`.as("item_count"),
        shippingMethod: order.shippingMethod,
        shippingFee: order.shippingFee,
      })
      .from(order)
      .leftJoin(collection, eq(order.id, collection.orderId))
      .where(paidOrderWhere(userId, filters, "total"))
      .groupBy(order.id, order.shippingMethod, order.shippingFee),
  );

  return tx
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
