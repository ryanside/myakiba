import type { SQL } from "bun";

const TABLES = ["order", "collection"] as const;
type Table = (typeof TABLES)[number];

type TableReport = {
  readonly rows: number;
  readonly paid: number;
  readonly paidStatusToOrdered: number;
};

export type PaidMigrationReport =
  | { readonly status: "fresh-database" | "already-migrated" }
  | ({ readonly status: "migrated" } & { readonly [table in Table]: TableReport });

export async function migratePaid(sql: SQL): Promise<PaidMigrationReport> {
  const [state] = await sql<[{ hasOrder: boolean; hasPaid: boolean }]>`
    SELECT to_regclass('public.order') IS NOT NULL AS "hasOrder",
      EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = to_regclass('public.order')
        AND attname = 'paid' AND NOT attisdropped) AS "hasPaid"
  `;
  if (!state.hasOrder) return { status: "fresh-database" };
  if (state.hasPaid) return { status: "already-migrated" };

  return sql.begin(async (tx) => {
    const order = await migrateTable(tx, "order");
    const collection = await migrateTable(tx, "collection");
    return { status: "migrated", order, collection };
  });
}

async function migrateTable(tx: SQL, table: Table): Promise<TableReport> {
  // The same DDL drizzle-kit emits for `boolean("paid").notNull().default(false)`, so the push
  // that follows finds the column as the schema declares it.
  await tx.unsafe(`ALTER TABLE "${table}" ADD COLUMN "paid" boolean DEFAULT false NOT NULL`);
  await tx.unsafe(`UPDATE "${table}" SET paid = status <> 'Ordered'`);
  const [converted] = await tx.unsafe<[{ rows: number }]>(`
    WITH converted AS (
      UPDATE "${table}" SET status = 'Ordered' WHERE status = 'Paid' RETURNING 1
    )
    SELECT count(*)::int AS rows FROM converted
  `);
  const [unknown] = await tx.unsafe<[{ rows: number }]>(`
    SELECT count(*)::int AS rows FROM "${table}" WHERE status NOT IN ('Ordered', 'Shipped', 'Owned')
  `);
  if (unknown.rows > 0) {
    throw new Error(
      `Paid migration failed: ${table} has ${unknown.rows} rows with a status other than Ordered, Shipped or Owned`,
    );
  }
  const [counts] = await tx.unsafe<[{ rows: number; paid: number }]>(`
    SELECT count(*)::int AS rows, (count(*) FILTER (WHERE paid))::int AS paid FROM "${table}"
  `);
  return { ...counts, paidStatusToOrdered: converted.rows };
}
