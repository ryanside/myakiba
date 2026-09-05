import { db } from "@myakiba/db/client";
import { item, item_release, wishlistEntry } from "@myakiba/db/schema/figure";
import type { PositionOrderInput } from "@myakiba/contracts/shared/position-order";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { planPositionOrderMove, POSITION_UPDATE_CHUNK_SIZE } from "@/lib/position-order";

class WishlistService {
  async getEntries(userId: string, limit: number, offset: number) {
    const latestRelease = db
      .select({
        date: item_release.date,
        price: item_release.price,
        priceCurrency: item_release.priceCurrency,
      })
      .from(item_release)
      .where(eq(item_release.itemId, item.id))
      .orderBy(desc(item_release.date), desc(item_release.createdAt), desc(item_release.id))
      .limit(1)
      .as("wishlist_latest_release");

    const [rows, countRows] = await Promise.all([
      db
        .select({
          id: wishlistEntry.id,
          itemId: item.id,
          itemExternalId: item.externalId,
          title: item.title,
          image: item.image,
          category: item.category,
          position: wishlistEntry.position,
          createdAt: wishlistEntry.createdAt,
          releaseDate: latestRelease.date,
          releasePrice: latestRelease.price,
          releasePriceCurrency: latestRelease.priceCurrency,
        })
        .from(wishlistEntry)
        .innerJoin(item, eq(wishlistEntry.itemId, item.id))
        .leftJoinLateral(latestRelease, sql`TRUE`)
        .where(eq(wishlistEntry.userId, userId))
        .orderBy(asc(wishlistEntry.position), asc(wishlistEntry.createdAt), asc(wishlistEntry.id))
        .limit(limit)
        .offset(offset),
      db
        .select({ totalCount: sql<number>`COUNT(*)::integer` })
        .from(wishlistEntry)
        .where(eq(wishlistEntry.userId, userId)),
    ]);

    return {
      items: rows.map((row) => ({
        id: row.id,
        itemId: row.itemId,
        itemExternalId: row.itemExternalId,
        title: row.title,
        image: row.image,
        category: row.category,
        position: row.position,
        createdAt: row.createdAt,
        latestRelease: row.releaseDate
          ? {
              date: row.releaseDate,
              price: row.releasePrice,
              priceCurrency: row.releasePriceCurrency,
            }
          : null,
      })),
      totalCount: countRows[0]?.totalCount ?? 0,
      limit,
      offset,
    };
  }

  async addEntry(userId: string, itemId: string) {
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`wishlist:${userId}`}, 0))`,
      );

      const [itemRows, positionRows] = await Promise.all([
        tx.select({ id: item.id }).from(item).where(eq(item.id, itemId)).limit(1),
        tx
          .select({ position: sql<number>`COALESCE(MAX(${wishlistEntry.position}), -1)::integer` })
          .from(wishlistEntry)
          .where(eq(wishlistEntry.userId, userId)),
      ]);

      if (itemRows.length === 0) return { kind: "not_found" } as const;

      const added = await tx
        .insert(wishlistEntry)
        .values({
          userId,
          itemId,
          position: (positionRows[0]?.position ?? -1) + 1,
        })
        .onConflictDoNothing({ target: [wishlistEntry.userId, wishlistEntry.itemId] })
        .returning({ id: wishlistEntry.id });

      return { kind: "added", addedCount: added.length } as const;
    });
  }

  async removeEntry(userId: string, itemId: string) {
    const removed = await db
      .delete(wishlistEntry)
      .where(and(eq(wishlistEntry.userId, userId), eq(wishlistEntry.itemId, itemId)))
      .returning({ id: wishlistEntry.id });

    return { removedCount: removed.length };
  }

  async moveEntries(userId: string, { movedIds, anchorId, placement }: PositionOrderInput) {
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`wishlist:${userId}`}, 0))`,
      );

      const currentEntries = await tx
        .select({ id: wishlistEntry.id, position: wishlistEntry.position })
        .from(wishlistEntry)
        .where(eq(wishlistEntry.userId, userId))
        .orderBy(asc(wishlistEntry.position), asc(wishlistEntry.createdAt), asc(wishlistEntry.id))
        .for("update");

      const plan = planPositionOrderMove(currentEntries, movedIds, anchorId, placement);
      if (plan.kind === "not_found") return { kind: "not_found" } as const;

      for (let index = 0; index < plan.updates.length; index += POSITION_UPDATE_CHUNK_SIZE) {
        const updates = plan.updates.slice(index, index + POSITION_UPDATE_CHUNK_SIZE);
        const positionCases = updates.map(
          (update) => sql`WHEN ${update.id} THEN ${update.position}`,
        );
        // oxlint-disable-next-line no-await-in-loop -- Keep chunked updates sequential within one transaction.
        await tx
          .update(wishlistEntry)
          .set({
            position: sql<number>`CASE ${wishlistEntry.id} ${sql.join(positionCases, sql.raw(" "))} ELSE ${wishlistEntry.position} END`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(wishlistEntry.userId, userId),
              inArray(
                wishlistEntry.id,
                updates.map((row) => row.id),
              ),
            ),
          );
      }

      return { kind: "moved", moved: plan.moved } as const;
    });
  }
}

export default new WishlistService();
