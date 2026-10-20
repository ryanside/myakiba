import { and, asc, desc, eq, gt, inArray, lte, sql } from "drizzle-orm";
import { item, item_release, wishlistItem } from "@myakiba/db/schema/figure";
import type { Tx } from "@myakiba/db/tx";
import type { PositionOrderInput } from "@myakiba/contracts/shared/position-order";
import { planPositionOrderMove, POSITION_UPDATE_CHUNK_SIZE } from "@/lib/position-order";
import { command, fail, ok, query } from "@/domain/kernel";
import type { WishlistPageQuery } from "./model";

function lockWishlist(tx: Tx, userId: string) {
  return tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`wishlist:${userId}`}, 0))`,
  );
}

export const Wishlist = {
  list: query(
    { action: "wishlist.list", failure: "Failed to load Wishlist" },
    async (scope, { limit, offset, releaseStatus, today }: WishlistPageQuery) => {
      const latestRelease = scope.tx
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
      const conditions = and(eq(wishlistItem.userId, scope.viewer.userId), releaseFilter);

      const [rows, countRows] = await Promise.all([
        scope.tx
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
        scope.tx
          .select({ totalCount: sql<number>`COUNT(*)::integer` })
          .from(wishlistItem)
          .innerJoin(item, eq(wishlistItem.itemId, item.id))
          .leftJoinLateral(latestRelease, sql`TRUE`)
          .where(conditions),
      ]);
      const totalCount = countRows[0]?.totalCount ?? 0;

      scope.log.set({ result: { count: rows.length, totalCount } });
      return ok({
        items: rows.map((row) => ({
          id: row.id,
          itemId: row.itemId,
          itemExternalId: row.itemExternalId,
          title: row.title,
          image: row.image,
          category: row.category,
          position: row.position,
          createdAt: row.createdAt.toISOString(),
          latestRelease: row.releaseDate
            ? {
                date: row.releaseDate,
                price: row.releasePrice,
                priceCurrency: row.releasePriceCurrency,
              }
            : null,
        })),
        totalCount,
        limit,
        offset,
      });
    },
  ),

  move: command(
    { action: "wishlist.order.move", failure: "Failed to save Wishlist order" },
    async (scope, { movedIds, anchorId, placement }: PositionOrderInput) => {
      const userId = scope.viewer.userId;
      scope.log.set({ itemCount: movedIds.length });
      await lockWishlist(scope.tx, userId);

      const currentItems = await scope.tx
        .select({ id: wishlistItem.id, position: wishlistItem.position })
        .from(wishlistItem)
        .where(eq(wishlistItem.userId, userId))
        .orderBy(asc(wishlistItem.position), asc(wishlistItem.createdAt), asc(wishlistItem.id))
        .for("update");

      const plan = planPositionOrderMove(currentItems, movedIds, anchorId, placement);
      if (plan.kind === "not_found") return fail("not_found", "Wishlist Item not found");

      for (let index = 0; index < plan.updates.length; index += POSITION_UPDATE_CHUNK_SIZE) {
        const updates = plan.updates.slice(index, index + POSITION_UPDATE_CHUNK_SIZE);
        const positionCases = updates.map(
          (update) => sql`WHEN ${update.id} THEN ${update.position}`,
        );
        await scope.tx
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

      return ok("Wishlist order saved");
    },
  ),

  add: command(
    { action: "wishlist.items.add", failure: "Failed to add to Wishlist" },
    async (scope, input: { readonly itemId: string }) => {
      const userId = scope.viewer.userId;
      scope.log.set({ item: { id: input.itemId } });
      await lockWishlist(scope.tx, userId);

      const [itemRows, positionRows] = await Promise.all([
        scope.tx.select({ id: item.id }).from(item).where(eq(item.id, input.itemId)).limit(1),
        scope.tx
          .select({ position: sql<number>`COALESCE(MAX(${wishlistItem.position}), -1)::integer` })
          .from(wishlistItem)
          .where(eq(wishlistItem.userId, userId)),
      ]);
      if (itemRows.length === 0) return fail("not_found", "Item not found");

      const added = await scope.tx
        .insert(wishlistItem)
        .values({ userId, itemId: input.itemId, position: (positionRows[0]?.position ?? -1) + 1 })
        .onConflictDoNothing({ target: [wishlistItem.userId, wishlistItem.itemId] })
        .returning({ id: wishlistItem.id });

      scope.log.set({ addedCount: added.length });
      return ok({ addedCount: added.length });
    },
  ),

  remove: command(
    { action: "wishlist.items.remove", failure: "Failed to remove from Wishlist" },
    async (scope, input: { readonly itemId: string }) => {
      scope.log.set({ item: { id: input.itemId } });
      const removed = await scope.tx
        .delete(wishlistItem)
        .where(
          and(eq(wishlistItem.userId, scope.viewer.userId), eq(wishlistItem.itemId, input.itemId)),
        )
        .returning({ id: wishlistItem.id });

      scope.log.set({ removedCount: removed.length });
      return ok({ removedCount: removed.length });
    },
  ),
};
