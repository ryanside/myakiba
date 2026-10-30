import { eq, sql } from "drizzle-orm";
import { wishlistItem } from "@myakiba/db/schema/figure";
import type { Tx } from "@myakiba/db/tx";

export function lockWishlist(tx: Tx, userId: string) {
  return tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`wishlist:${userId}`}, 0))`,
  );
}

export async function appendToWishlist(
  tx: Tx,
  userId: string,
  itemIds: readonly string[],
): Promise<number> {
  if (itemIds.length === 0) return 0;
  await lockWishlist(tx, userId);

  const positionRows = await tx
    .select({ position: sql<number>`COALESCE(MAX(${wishlistItem.position}), -1)::integer` })
    .from(wishlistItem)
    .where(eq(wishlistItem.userId, userId));
  const maxPosition = positionRows[0]?.position ?? -1;

  const added = await tx
    .insert(wishlistItem)
    .values(itemIds.map((itemId, index) => ({ userId, itemId, position: maxPosition + index + 1 })))
    .onConflictDoNothing({ target: [wishlistItem.userId, wishlistItem.itemId] })
    .returning({ id: wishlistItem.id });
  return added.length;
}
