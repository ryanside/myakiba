import { and, eq, ne, not, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { unionAll } from "drizzle-orm/pg-core";
import { collection, order } from "@myakiba/db/schema/figure";
import type { Tx } from "@myakiba/db/tx";
import { shopKey } from "@myakiba/utils/shop-key";

type Rewritten = { readonly orders?: SQL; readonly collectionItems?: SQL };

const notRewritten = (rows: SQL | undefined) => rows && not(sql`COALESCE(${rows}, FALSE)`);

/** Maps each typed Shop to the viewer's existing spelling of it; a Shop with none stays as typed. */
export async function shopSpellings(
  tx: Tx,
  userId: string,
  typed: readonly string[],
  rewritten: Rewritten = {},
): Promise<(shop: string) => string> {
  const keys = new Set(typed.map(shopKey).filter((key) => key !== ""));
  if (keys.size === 0) return (shop) => shop;

  const saved = unionAll(
    tx
      .select({ shop: order.shop, usedAt: order.updatedAt })
      .from(order)
      .where(and(eq(order.userId, userId), ne(order.shop, ""), notRewritten(rewritten.orders))),
    tx
      .select({ shop: collection.shop, usedAt: collection.updatedAt })
      .from(collection)
      .where(
        and(
          eq(collection.userId, userId),
          ne(collection.shop, ""),
          notRewritten(rewritten.collectionItems),
        ),
      ),
  ).as("saved");
  const rows = await tx
    .select({
      shop: saved.shop,
      uses: sql<number>`COUNT(*)::integer`,
      lastUsedAt: sql<Date>`MAX(${saved.usedAt})`.mapWith(order.updatedAt),
    })
    .from(saved)
    .groupBy(saved.shop);

  const winners = new Map<string, string>();
  const ranked = rows
    .filter((row) => keys.has(shopKey(row.shop)))
    .toSorted(
      (a, b) =>
        b.uses - a.uses ||
        b.lastUsedAt.getTime() - a.lastUsedAt.getTime() ||
        Number(a.shop > b.shop) - Number(a.shop < b.shop),
    );
  for (const { shop } of ranked) {
    const key = shopKey(shop);
    if (!winners.has(key)) winners.set(key, shop);
  }
  return (shop) => winners.get(shopKey(shop)) ?? shop;
}
