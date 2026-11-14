import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { unionAll } from "drizzle-orm/pg-core";
import { collection, order } from "@myakiba/db/schema/figure";
import type { VocabularyResponse } from "@myakiba/contracts/vocabulary/schema";
import { Result } from "better-result";
import { query } from "@/domain/kernel";

export const VOCABULARY_SHOP_LIMIT = 500;

export const Vocabulary = {
  read: query(
    { action: "vocabulary.read", failure: "Failed to load your shops" },
    async (scope) => {
      const userId = scope.viewer.userId;
      const uses = scope.tx.$with("shop_uses").as(
        unionAll(
          scope.tx
            .select({
              shop: collection.shop,
              collectionUses: sql<number>`1`.as("collection_uses"),
              orderUses: sql<number>`0`.as("order_uses"),
              usedAt: sql<Date>`${collection.updatedAt}`.as("used_at"),
            })
            .from(collection)
            .where(and(eq(collection.userId, userId), ne(collection.shop, ""))),
          scope.tx
            .select({
              shop: order.shop,
              collectionUses: sql<number>`0`.as("collection_uses"),
              orderUses: sql<number>`1`.as("order_uses"),
              usedAt: sql<Date>`${order.updatedAt}`.as("used_at"),
            })
            .from(order)
            .where(and(eq(order.userId, userId), ne(order.shop, ""))),
        ),
      );
      const collectionUses = sql<number>`SUM(${uses.collectionUses})::integer`;
      const orderUses = sql<number>`SUM(${uses.orderUses})::integer`;
      const lastUsedAt = sql<Date>`MAX(${uses.usedAt})`.mapWith(collection.updatedAt);

      const rows = await scope.tx
        .with(uses)
        .select({ value: uses.shop, collectionUses, orderUses, lastUsedAt })
        .from(uses)
        .groupBy(uses.shop)
        .orderBy(
          desc(sql`SUM(${uses.collectionUses} + ${uses.orderUses})`),
          desc(sql`MAX(${uses.usedAt})`),
          asc(uses.shop),
        )
        .limit(VOCABULARY_SHOP_LIMIT);

      const vocabulary: VocabularyResponse = {
        shops: rows.map((row) => ({ ...row, lastUsedAt: row.lastUsedAt.toISOString() })),
      };
      return Result.ok(vocabulary);
    },
  ),
};
