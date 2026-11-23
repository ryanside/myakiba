import type { SQL } from "bun";

/**
 * Neither drizzle-kit push nor an older image's db-push writes column comments, so a rollback
 * that re-adds collection.paid keeps it.
 */
const ORDER_PAID_MARK = "Covers every Order Item and all Order Fees.";

export type OrderPaidReport =
  | { readonly status: "fresh-database" | "already-migrated" | "readded-column-dropped" }
  | {
      readonly status: "migrated";
      readonly ordersRead: number;
      readonly turnedPaid: number;
      readonly turnedUnpaid: number;
      readonly leftAlone: number;
    };

export async function markOrderPaid(sql: SQL): Promise<void> {
  await sql.unsafe(`COMMENT ON COLUMN "order"."paid" IS '${ORDER_PAID_MARK}'`);
}

async function itemPaidState(tx: SQL) {
  const [state] = await tx<[{ hasItemPaid: boolean; converted: boolean }]>`
    SELECT
      EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.collection'::regclass
        AND attname = 'paid' AND NOT attisdropped) AS "hasItemPaid",
      col_description('public.order'::regclass, (SELECT attnum FROM pg_attribute
        WHERE attrelid = 'public.order'::regclass AND attname = 'paid')) IS NOT DISTINCT FROM ${ORDER_PAID_MARK}
        AS converted
  `;
  return state;
}

export async function migrateOrderPaid(sql: SQL): Promise<OrderPaidReport> {
  return sql.begin(async (tx) => {
    const [{ hasCollection }] = await tx<[{ hasCollection: boolean }]>`
      SELECT to_regclass('public.collection') IS NOT NULL AS "hasCollection"
    `;
    if (!hasCollection) return { status: "fresh-database" };
    const unlocked = await itemPaidState(tx);
    if (!unlocked.hasItemPaid) return { status: "already-migrated" };

    // The order the app's own writes lock them in. Another db-push may have dropped the column
    // while this one waited, so look again under the locks.
    await tx`LOCK TABLE "order" IN EXCLUSIVE MODE`;
    await tx`LOCK TABLE collection IN ACCESS EXCLUSIVE MODE`;
    const { hasItemPaid, converted } = await itemPaidState(tx);
    if (!hasItemPaid) return { status: "already-migrated" };
    if (converted) {
      await tx`ALTER TABLE "collection" DROP COLUMN "paid"`;
      return { status: "readded-column-dropped" };
    }

    const [counts] = await tx<[{ ordersRead: number; turnedPaid: number; turnedUnpaid: number }]>`
      WITH by_items AS (
        SELECT order_id AS id, bool_and(paid) AS paid FROM collection
        WHERE order_id IS NOT NULL GROUP BY order_id
      ), turned AS (
        UPDATE "order" o SET paid = by_items.paid FROM by_items
        WHERE o.id = by_items.id AND o.paid <> by_items.paid
        RETURNING by_items.paid
      )
      SELECT (SELECT count(*) FROM "order")::int AS "ordersRead",
        (count(*) FILTER (WHERE paid))::int AS "turnedPaid",
        (count(*) FILTER (WHERE NOT paid))::int AS "turnedUnpaid"
      FROM turned
    `;
    await tx`ALTER TABLE "collection" DROP COLUMN "paid"`;
    await markOrderPaid(tx);
    return {
      status: "migrated",
      ...counts,
      leftAlone: counts.ordersRead - counts.turnedPaid - counts.turnedUnpaid,
    };
  });
}
