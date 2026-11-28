import type { SQL } from "bun";

export type ReleasePrecisionReport =
  | { readonly status: "fresh-database" | "already-migrated" }
  | {
      readonly status: "migrated";
      readonly releases: PrecisionCounts;
      readonly orders: PrecisionCounts;
    };

type PrecisionCounts = { readonly day: number; readonly month: number; readonly year: number };

/**
 * MFC pages are not at hand, and the parser stored a month-only date as its 1st and a year-only date
 * as January 1, so a stored date says no more than this. It errs toward less: a real release on the
 * 1st reads as its month, and a month-only January release as its year, until an Item Refresh.
 */
const PRECISION_OF = (column: string) => `CASE
    WHEN extract(day FROM ${column}) <> 1 THEN 'day'
    WHEN extract(month FROM ${column}) <> 1 THEN 'month'
    ELSE 'year'
  END`;

const COUNTS = (table: string, column: string, dated: string) => `
  SELECT (count(*) FILTER (WHERE ${column} = 'day'))::int AS day,
    (count(*) FILTER (WHERE ${column} = 'month'))::int AS month,
    (count(*) FILTER (WHERE ${column} = 'year'))::int AS year
  FROM "${table}" WHERE ${dated} IS NOT NULL`;

export async function migrateReleasePrecision(sql: SQL): Promise<ReleasePrecisionReport> {
  const [state] = await sql<[{ hasReleases: boolean; hasPrecision: boolean }]>`
    SELECT to_regclass('public.item_release') IS NOT NULL AS "hasReleases",
      EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = to_regclass('public.item_release')
        AND attname = 'date_precision' AND NOT attisdropped) AS "hasPrecision"
  `;
  if (!state.hasReleases) return { status: "fresh-database" };
  if (state.hasPrecision) return { status: "already-migrated" };

  return sql.begin(async (tx) => {
    // The DDL drizzle-kit emits for the two columns and checks, so the push that follows finds them
    // as the schema declares them.
    await tx.unsafe(`ALTER TABLE "item_release" ADD COLUMN "date_precision" text`);
    await tx.unsafe(`UPDATE "item_release" SET date_precision = ${PRECISION_OF("date")}`);
    await tx.unsafe(`ALTER TABLE "item_release" ALTER COLUMN "date_precision" SET NOT NULL`);
    await tx.unsafe(`ALTER TABLE "item_release" ADD CONSTRAINT "item_release_date_precision_check"
      CHECK ("item_release"."date_precision" IN ('day', 'month', 'year'))`);

    await tx.unsafe(
      `ALTER TABLE "order" ADD COLUMN "release_date_precision" text DEFAULT 'day' NOT NULL`,
    );
    await tx.unsafe(`UPDATE "order" SET release_date_precision = ${PRECISION_OF("release_date")}
      WHERE release_date IS NOT NULL`);
    await tx.unsafe(`ALTER TABLE "order" ADD CONSTRAINT "order_release_date_precision_check"
      CHECK ("order"."release_date_precision" IN ('day', 'month', 'year'))`);

    const [releases] = await tx.unsafe<[PrecisionCounts]>(
      COUNTS("item_release", "date_precision", "date"),
    );
    const [orders] = await tx.unsafe<[PrecisionCounts]>(
      COUNTS("order", "release_date_precision", "release_date"),
    );
    return { status: "migrated", releases, orders };
  });
}
