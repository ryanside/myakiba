import type { SQL } from "drizzle-orm";
import { and, eq, ne, sql } from "drizzle-orm";
import { collection, item, wishlistItem } from "@myakiba/db/schema/figure";
import type { ReadTx } from "@myakiba/db/tx";

/** The viewer's badges for each `item` row a select reads: Collection Items owned, those not yet owned, and Wishlist. */
export function itemSummaryColumns(tx: ReadTx, userId: string) {
  const count = (status: SQL) =>
    tx
      .select({ count: sql`count(*)::integer` })
      .from(collection)
      .where(and(eq(collection.userId, userId), eq(collection.itemId, item.id), status));
  const wished = tx
    .select({ id: wishlistItem.id })
    .from(wishlistItem)
    .where(and(eq(wishlistItem.userId, userId), eq(wishlistItem.itemId, item.id)));
  return {
    collectionCount: sql<number>`(${count(eq(collection.status, "Owned"))})`.mapWith(Number),
    onOrderCount: sql<number>`(${count(ne(collection.status, "Owned"))})`.mapWith(Number),
    wishlisted: sql<boolean>`exists (${wished})`.mapWith(Boolean),
  };
}
