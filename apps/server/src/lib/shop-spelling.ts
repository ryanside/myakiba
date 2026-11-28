import { and, eq, ne, not, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { collection, order } from "@myakiba/db/schema/figure";
import type { Tx } from "@myakiba/db/tx";
import { shopKey } from "@myakiba/utils/shop-key";

/** Rows a save rewrites itself, so their spellings do not count as existing ones. */
type Rewritten = { readonly orders?: SQL; readonly collectionItems?: SQL };

type Spelling = { shop: string; uses: number; lastUsedAt: Date };

const uses = sql<number>`COUNT(*)::integer`;
const notRewritten = (rows: SQL | undefined) => rows && not(sql`COALESCE(${rows}, FALSE)`);

/**
 * Returns a function that turns each typed Shop into the viewer's existing spelling of it, the one
 * on the most Orders and Collection Items, then the one used last, then the first in code-point
 * order. A Shop with no existing spelling stays as typed.
 */
export async function shopSpellings(
  tx: Tx,
  userId: string,
  typed: readonly string[],
  rewritten: Rewritten = {},
): Promise<(shop: string) => string> {
  const keys = new Set(typed.map(shopKey).filter((key) => key !== ""));
  if (keys.size === 0) return (shop) => shop;

  const lastUsedAt = (updatedAt: typeof order.updatedAt | typeof collection.updatedAt) =>
    sql<Date>`MAX(${updatedAt})`.mapWith(updatedAt);
  const [orderShops, collectionShops] = await Promise.all([
    tx
      .select({ shop: order.shop, uses, lastUsedAt: lastUsedAt(order.updatedAt) })
      .from(order)
      .where(and(eq(order.userId, userId), ne(order.shop, ""), notRewritten(rewritten.orders)))
      .groupBy(order.shop),
    tx
      .select({ shop: collection.shop, uses, lastUsedAt: lastUsedAt(collection.updatedAt) })
      .from(collection)
      .where(
        and(
          eq(collection.userId, userId),
          ne(collection.shop, ""),
          notRewritten(rewritten.collectionItems),
        ),
      )
      .groupBy(collection.shop),
  ]);

  const spellings = new Map<string, Spelling>();
  for (const row of [...orderShops, ...collectionShops]) {
    if (!keys.has(shopKey(row.shop))) continue;
    const known = spellings.get(row.shop);
    spellings.set(row.shop, {
      shop: row.shop,
      uses: (known?.uses ?? 0) + row.uses,
      lastUsedAt: known && known.lastUsedAt > row.lastUsedAt ? known.lastUsedAt : row.lastUsedAt,
    });
  }
  const winners = new Map<string, string>();
  const ranked = [...spellings.values()].toSorted(
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
