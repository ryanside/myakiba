import { eq, inArray, sql } from "drizzle-orm";
import { Result } from "better-result";
import { item, wishlistItem } from "@myakiba/db/schema/figure";
import type { Tx } from "@myakiba/db/tx";
import { ItemNotFound } from "@/lib/errors/item-not-found";

export function lockWishlist(tx: Tx, userId: string) {
  return tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`wishlist:${userId}`}, 0))`,
  );
}

export async function appendToWishlist(
  tx: Tx,
  userId: string,
  itemIds: readonly string[],
): Promise<Result<number, ItemNotFound>> {
  if (itemIds.length === 0) return Result.ok(0);
  await lockWishlist(tx, userId);

  const [itemRows, positionRows] = await Promise.all([
    tx
      .select({ id: item.id })
      .from(item)
      .where(inArray(item.id, [...itemIds])),
    tx
      .select({ position: sql<number>`COALESCE(MAX(${wishlistItem.position}), -1)::integer` })
      .from(wishlistItem)
      .where(eq(wishlistItem.userId, userId)),
  ]);
  if (itemRows.length < new Set(itemIds).size) return Result.err(new ItemNotFound());
  const maxPosition = positionRows[0]?.position ?? -1;

  const added = await tx
    .insert(wishlistItem)
    .values(itemIds.map((itemId, index) => ({ userId, itemId, position: maxPosition + index + 1 })))
    .onConflictDoNothing({ target: [wishlistItem.userId, wishlistItem.itemId] })
    .returning({ id: wishlistItem.id });
  return Result.ok(added.length);
}
