import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { collection, item, order } from "@myakiba/db/schema/figure";
import type { ShopTerm, VocabularyResponse } from "@myakiba/contracts/vocabulary/schema";
import { Result } from "better-result";
import { query } from "@/domain/kernel";

export const VOCABULARY_LIMIT = 500;

type CollectionShop = {
  readonly shop: string;
  readonly uses: number;
  readonly ownedUses: number;
  readonly lastUsedAt: Date;
};
type OrderShop = { readonly shop: string; readonly uses: number; readonly lastUsedAt: Date };

export const Vocabulary = {
  read: query(
    { action: "vocabulary.read", failure: "Failed to load your suggestions" },
    async (scope) => {
      const userId = scope.viewer.userId;
      const ownedUses = sql<number>`(COUNT(*) FILTER (WHERE ${collection.status} = 'Owned'))::integer`;
      const collectionUses = sql<number>`COUNT(*)::integer`;
      const collectionLastUsedAt = sql<Date>`MAX(${collection.updatedAt})`.mapWith(
        collection.updatedAt,
      );
      const orderUses = sql<number>`COUNT(*)::integer`;
      const orderLastUsedAt = sql<Date>`MAX(${order.updatedAt})`.mapWith(order.updatedAt);

      const taggedItems = scope.tx
        .select({
          id: collection.id,
          status: collection.status,
          updatedAt: collection.updatedAt,
          tag: sql<string>`unnest(${collection.tags})`.as("tag"),
        })
        .from(collection)
        .where(eq(collection.userId, userId))
        .as("tagged_items");
      const tagUses = sql<number>`COUNT(DISTINCT ${taggedItems.id})::integer`;
      const tagOwnedUses = sql<number>`(COUNT(DISTINCT ${taggedItems.id}) FILTER (WHERE ${taggedItems.status} = 'Owned'))::integer`;
      const tagLastUsedAt = sql<Date>`MAX(${taggedItems.updatedAt})`.mapWith(collection.updatedAt);
      const scaleOwnedUses = sql<number>`COUNT(*)::integer`;

      const [collectionShops, orderShops, tags, scales] = await Promise.all([
        scope.tx
          .select({
            shop: collection.shop,
            uses: collectionUses,
            ownedUses,
            lastUsedAt: collectionLastUsedAt,
          })
          .from(collection)
          .where(and(eq(collection.userId, userId), ne(collection.shop, "")))
          .groupBy(collection.shop)
          .orderBy(desc(collectionUses), desc(collectionLastUsedAt), asc(collection.shop))
          .limit(VOCABULARY_LIMIT),
        scope.tx
          .select({ shop: order.shop, uses: orderUses, lastUsedAt: orderLastUsedAt })
          .from(order)
          .where(and(eq(order.userId, userId), ne(order.shop, "")))
          .groupBy(order.shop)
          .orderBy(desc(orderUses), desc(orderLastUsedAt), asc(order.shop))
          .limit(VOCABULARY_LIMIT),
        scope.tx
          .select({
            value: taggedItems.tag,
            uses: tagUses,
            ownedUses: tagOwnedUses,
            lastUsedAt: tagLastUsedAt,
          })
          .from(taggedItems)
          .where(sql`btrim(${taggedItems.tag}) <> ''`)
          .groupBy(taggedItems.tag)
          .orderBy(desc(tagUses), desc(tagLastUsedAt), asc(taggedItems.tag))
          .limit(VOCABULARY_LIMIT),
        scope.tx
          .select({ value: item.scale, ownedUses: scaleOwnedUses })
          .from(collection)
          .innerJoin(item, eq(item.id, collection.itemId))
          .where(and(eq(collection.userId, userId), eq(collection.status, "Owned")))
          .groupBy(item.scale)
          .orderBy(desc(scaleOwnedUses), asc(item.scale))
          .limit(VOCABULARY_LIMIT),
      ]);

      const vocabulary: VocabularyResponse = {
        shops: mergeShopUses(collectionShops, orderShops),
        tags: tags.map((tag) => ({ ...tag, lastUsedAt: tag.lastUsedAt.toISOString() })),
        scales,
      };
      return Result.ok(vocabulary);
    },
  ),
};

type MergedShop = Omit<ShopTerm, "lastUsedAt"> & { readonly lastUsedAt: Date };

/** Each kind of record keeps its own most-used shops, so busy Order shops never crowd out a Collection one. */
function mergeShopUses(
  collectionShops: readonly CollectionShop[],
  orderShops: readonly OrderShop[],
): ShopTerm[] {
  const merged = new Map<string, MergedShop>();
  for (const row of collectionShops) {
    merged.set(row.shop, {
      value: row.shop,
      uses: row.uses,
      ownedUses: row.ownedUses,
      orderUses: 0,
      lastUsedAt: row.lastUsedAt,
    });
  }
  for (const row of orderShops) {
    const known = merged.get(row.shop);
    merged.set(row.shop, {
      value: row.shop,
      uses: (known?.uses ?? 0) + row.uses,
      ownedUses: known?.ownedUses ?? 0,
      orderUses: row.uses,
      lastUsedAt: known && known.lastUsedAt > row.lastUsedAt ? known.lastUsedAt : row.lastUsedAt,
    });
  }
  return [...merged.values()]
    .toSorted(
      (a, b) =>
        b.uses - a.uses ||
        b.lastUsedAt.getTime() - a.lastUsedAt.getTime() ||
        Number(a.value > b.value) - Number(a.value < b.value),
    )
    .map((shop) => ({ ...shop, lastUsedAt: shop.lastUsedAt.toISOString() }));
}
