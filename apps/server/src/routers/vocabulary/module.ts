import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { collection, order } from "@myakiba/db/schema/figure";
import type { ShopTerm, VocabularyResponse } from "@myakiba/contracts/vocabulary/schema";
import { Result } from "better-result";
import { query } from "@/domain/kernel";

export const VOCABULARY_SHOP_LIMIT = 500;

type ShopUses = { readonly shop: string; readonly uses: number; readonly lastUsedAt: Date };

export const Vocabulary = {
  read: query(
    { action: "vocabulary.read", failure: "Failed to load your shops" },
    async (scope) => {
      const userId = scope.viewer.userId;
      const ownedUses = sql<number>`(COUNT(*) FILTER (WHERE ${collection.status} = 'Owned'))::integer`;
      const collectionRows = sql<number>`COUNT(*)`;
      const collectionLastUsedAt = sql<Date>`MAX(${collection.updatedAt})`.mapWith(
        collection.updatedAt,
      );
      const orderUses = sql<number>`COUNT(*)::integer`;
      const orderLastUsedAt = sql<Date>`MAX(${order.updatedAt})`.mapWith(order.updatedAt);

      const [collectionShops, orderShops] = await Promise.all([
        scope.tx
          .select({ shop: collection.shop, uses: ownedUses, lastUsedAt: collectionLastUsedAt })
          .from(collection)
          .where(and(eq(collection.userId, userId), ne(collection.shop, "")))
          .groupBy(collection.shop)
          .orderBy(desc(collectionRows), desc(collectionLastUsedAt), asc(collection.shop))
          .limit(VOCABULARY_SHOP_LIMIT),
        scope.tx
          .select({ shop: order.shop, uses: orderUses, lastUsedAt: orderLastUsedAt })
          .from(order)
          .where(and(eq(order.userId, userId), ne(order.shop, "")))
          .groupBy(order.shop)
          .orderBy(desc(orderUses), desc(orderLastUsedAt), asc(order.shop))
          .limit(VOCABULARY_SHOP_LIMIT),
      ]);

      const vocabulary: VocabularyResponse = { shops: mergeShopUses(collectionShops, orderShops) };
      return Result.ok(vocabulary);
    },
  ),
};

type MergedShop = Omit<ShopTerm, "lastUsedAt"> & { readonly lastUsedAt: Date };

/** Each kind of record keeps its own most-used shops, so busy Order shops never crowd out a Collection one. */
function mergeShopUses(
  collectionShops: readonly ShopUses[],
  orderShops: readonly ShopUses[],
): ShopTerm[] {
  const merged = new Map<string, MergedShop>();
  for (const row of collectionShops) {
    merged.set(row.shop, {
      value: row.shop,
      ownedUses: row.uses,
      orderUses: 0,
      lastUsedAt: row.lastUsedAt,
    });
  }
  for (const row of orderShops) {
    const known = merged.get(row.shop);
    merged.set(row.shop, {
      value: row.shop,
      ownedUses: known?.ownedUses ?? 0,
      orderUses: row.uses,
      lastUsedAt: known && known.lastUsedAt > row.lastUsedAt ? known.lastUsedAt : row.lastUsedAt,
    });
  }
  const total = (shop: MergedShop) => shop.ownedUses + shop.orderUses;
  return [...merged.values()]
    .toSorted(
      (a, b) =>
        total(b) - total(a) ||
        b.lastUsedAt.getTime() - a.lastUsedAt.getTime() ||
        Number(a.value > b.value) - Number(a.value < b.value),
    )
    .map((shop) => ({ ...shop, lastUsedAt: shop.lastUsedAt.toISOString() }));
}
