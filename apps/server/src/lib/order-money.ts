import { eq, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { collection, order } from "@myakiba/db/schema/figure";
import type { ReadTx } from "@myakiba/db/tx";

/*
 * An Order's money is one line per Order Item price and one line for its Order Fees. Exactly one
 * status decides whether a line is Spend or Unpaid Costs: an Order Item's own status for its
 * price, the Order's status for its fees. So Spend plus Unpaid Costs is always the Order Total.
 */

const itemIsUnpaid = sql`${collection.status} = 'Ordered'`;
export const itemIsPaid = sql`${collection.status} <> 'Ordered'`;

/** Owns the Order's fees, and makes it an Unpaid Order or a Paid Order. */
export const orderIsUnpaid = sql`${order.status} = 'Ordered'`;
export const orderIsPaid = sql`${order.status} <> 'Ordered'`;

export const orderFees = sql<number>`(${order.shippingFee} + ${order.taxes} + ${order.duties} + ${order.tariffs} + ${order.miscFees})`;

// The three below aggregate one Order's Order Items, so their query groups by the Order and
// left-joins `collection` on it.
export const orderTotal = sql<number>`COALESCE(SUM(${collection.price}), 0) + ${orderFees}`;
export const orderSpend = sql<number>`COALESCE(SUM(${collection.price}) FILTER (WHERE ${itemIsPaid}), 0) + CASE WHEN ${orderIsPaid} THEN ${orderFees} ELSE 0 END`;
export const orderUnpaidCosts = sql<number>`COALESCE(SUM(${collection.price}) FILTER (WHERE ${itemIsUnpaid}), 0) + CASE WHEN ${orderIsUnpaid} THEN ${orderFees} ELSE 0 END`;

/** Unpaid Costs and the Unpaid Order count over the Orders `where` keeps, at any date. */
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
