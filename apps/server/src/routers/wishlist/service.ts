import { db } from "@myakiba/db/client";
import { item, item_release, wishlistItem } from "@myakiba/db/schema/figure";
import type { PositionOrderInput } from "@myakiba/contracts/shared/position-order";
import { and, asc, desc, eq, gt, inArray, lte, sql } from "drizzle-orm";
import { planPositionOrderMove, POSITION_UPDATE_CHUNK_SIZE } from "@/lib/position-order";
import type { WishlistPageQuery } from "./model";

class WishlistService {
  async getItems(userId: string, { limit, offset, releaseStatus, today }: WishlistPageQuery) {
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

    const releaseFilter = {
      all: undefined,
      upcoming: gt(latestRelease.date, today),
      available: lte(latestRelease.date, today),
    }[releaseStatus];
    const conditions = and(eq(wishlistItem.userId, userId), releaseFilter);

    const [rows, countRows] = await Promise.all([
      db
        .select({
          id: wishlistItem.id,
          itemId: wishlistItem.itemId,
          itemExternalId: item.externalId,
          title: item.title,
          image: item.image,
          category: item.category,
          position: wishlistItem.position,
          createdAt: wishlistItem.createdAt,
          releaseDate: latestRelease.date,
          releasePrice: latestRelease.price,
          releasePriceCurrency: latestRelease.priceCurrency,
        })
        .from(wishlistItem)
        .innerJoin(item, eq(wishlistItem.itemId, item.id))
        .leftJoinLateral(latestRelease, sql`TRUE`)
        .where(conditions)
        .orderBy(asc(wishlistItem.position), asc(wishlistItem.createdAt), asc(wishlistItem.id))
        .limit(limit)
        .offset(offset),
      db
        .select({ totalCount: sql<number>`COUNT(*)::integer` })
        .from(wishlistItem)
        .innerJoin(item, eq(wishlistItem.itemId, item.id))
        .leftJoinLateral(latestRelease, sql`TRUE`)
        .where(conditions),
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

  async addItem(userId: string, itemId: string) {
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`wishlist:${userId}`}, 0))`,
      );

      const [itemRows, positionRows] = await Promise.all([
        tx.select({ id: item.id }).from(item).where(eq(item.id, itemId)).limit(1),
        tx
          .select({ position: sql<number>`COALESCE(MAX(${wishlistItem.position}), -1)::integer` })
          .from(wishlistItem)
          .where(eq(wishlistItem.userId, userId)),
      ]);

      if (itemRows.length === 0) return { kind: "not_found" } as const;

      const added = await tx
        .insert(wishlistItem)
        .values({
          userId,
          itemId,
          position: (positionRows[0]?.position ?? -1) + 1,
        })
        .onConflictDoNothing({ target: [wishlistItem.userId, wishlistItem.itemId] })
        .returning({ id: wishlistItem.id });

      return { kind: "added", addedCount: added.length } as const;
    });
  }

  async removeItem(userId: string, itemId: string) {
    const removed = await db
      .delete(wishlistItem)
      .where(and(eq(wishlistItem.userId, userId), eq(wishlistItem.itemId, itemId)))
      .returning({ id: wishlistItem.id });

    return { removedCount: removed.length };
  }

  async moveItems(userId: string, { movedIds, anchorId, placement }: PositionOrderInput) {
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`wishlist:${userId}`}, 0))`,
      );

      const currentItems = await tx
        .select({ id: wishlistItem.id, position: wishlistItem.position })
        .from(wishlistItem)
        .where(eq(wishlistItem.userId, userId))
        .orderBy(asc(wishlistItem.position), asc(wishlistItem.createdAt), asc(wishlistItem.id))
        .for("update");

      const plan = planPositionOrderMove(currentItems, movedIds, anchorId, placement);
      if (plan.kind === "not_found") return { kind: "not_found" } as const;

      for (let index = 0; index < plan.updates.length; index += POSITION_UPDATE_CHUNK_SIZE) {
        const updates = plan.updates.slice(index, index + POSITION_UPDATE_CHUNK_SIZE);
        const positionCases = updates.map(
          (update) => sql`WHEN ${update.id} THEN ${update.position}`,
        );
        // oxlint-disable-next-line no-await-in-loop -- Keep chunked updates sequential within one transaction.
        await tx
          .update(wishlistItem)
          .set({
            position: sql<number>`CASE ${wishlistItem.id} ${sql.join(positionCases, sql.raw(" "))} ELSE ${wishlistItem.position} END`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(wishlistItem.userId, userId),
              inArray(
                wishlistItem.id,
                updates.map((row) => row.id),
              ),
            ),
          );
      }

      return { kind: "moved" } as const;
    });
  }
}

export default new WishlistService();
