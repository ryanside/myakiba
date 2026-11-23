import { eq, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { collection, order } from "@myakiba/db/schema/figure";
import type { ReadTx } from "@myakiba/db/tx";

export const orderIsUnpaid = sql`NOT ${order.paid}`;
export const orderIsPaid = sql`${order.paid}`;

/**
 * Each Collection Item's Order, joined once. Every query that reads `itemIsPaid`, `paidItemPrice`
 * or `paidItemCount` joins it with `.leftJoin(...itemOrderJoin)`. A left join on the Order's
 * primary key adds no rows.
 */
export const itemOrderJoin = [order, eq(collection.orderId, order.id)] as const;

/** A Collection Item outside an Order counts as paid; an Order Item counts as its Order's Paid. */
export const itemIsPaid = sql`(${collection.orderId} IS NULL OR ${order.paid})`;

export const paidItemPrice = sql<number>`CASE WHEN ${itemIsPaid} THEN ${collection.price} ELSE 0 END`;

export const paidItemCount = sql<number>`COUNT(${collection.id}) FILTER (WHERE ${itemIsPaid})`;

export const orderFees = sql<number>`(${order.shippingFee} + ${order.taxes} + ${order.duties} + ${order.tariffs} + ${order.miscFees})`;

export const orderTotal = sql<number>`COALESCE(SUM(${collection.price}), 0) + ${orderFees}`.mapWith(
  Number,
);
export const orderSpend = sql<number>`CASE WHEN ${orderIsPaid} THEN ${orderTotal} ELSE 0 END`;
export const orderUnpaidCosts = sql<number>`CASE WHEN ${orderIsUnpaid} THEN ${orderTotal} ELSE 0 END`;

export const orderPaidItemCount = sql<number>`CASE WHEN ${orderIsPaid} THEN COUNT(${collection.id}) ELSE 0 END`;

export function selectUnpaidCosts(tx: ReadTx, where: SQL | undefined) {
  const byOrder = tx
    .select({
      isUnpaid: sql<boolean>`${orderIsUnpaid}`.as("is_unpaid"),
      unpaidCosts: orderUnpaidCosts.as("unpaid_costs"),
    })
    .from(order)
    .leftJoin(collection, eq(order.id, collection.orderId))
    .where(where)
    .groupBy(order.id)
    .as("unpaid_by_order");

  return tx
    .select({
      unpaidOrderCount: sql<number>`COUNT(*) FILTER (WHERE ${byOrder.isUnpaid})`.mapWith(Number),
      unpaidCosts: sql<number>`COALESCE(SUM(${byOrder.unpaidCosts}), 0)`.mapWith(Number),
    })
    .from(byOrder);
}
