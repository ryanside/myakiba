import { eq, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { collection, order } from "@myakiba/db/schema/figure";
import type { ReadTx } from "@myakiba/db/tx";

const itemIsUnpaid = sql`${collection.status} = 'Ordered'`;
export const itemIsPaid = sql`${collection.status} <> 'Ordered'`;

export const orderIsUnpaid = sql`${order.status} = 'Ordered'`;
export const orderIsPaid = sql`${order.status} <> 'Ordered'`;

export const orderFees = sql<number>`(${order.shippingFee} + ${order.taxes} + ${order.duties} + ${order.tariffs} + ${order.miscFees})`;

export const orderTotal = sql<number>`COALESCE(SUM(${collection.price}), 0) + ${orderFees}`;
export const orderSpend = sql<number>`COALESCE(SUM(${collection.price}) FILTER (WHERE ${itemIsPaid}), 0) + CASE WHEN ${orderIsPaid} THEN ${orderFees} ELSE 0 END`;
export const orderUnpaidCosts = sql<number>`COALESCE(SUM(${collection.price}) FILTER (WHERE ${itemIsUnpaid}), 0) + CASE WHEN ${orderIsUnpaid} THEN ${orderFees} ELSE 0 END`;

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
