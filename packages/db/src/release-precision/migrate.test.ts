import { expect, test } from "bun:test";
import type { SQL } from "bun";
import { snapshot, testDatabases } from "../../test/database";
import { PUSH_TIMEOUT, dbPush } from "../../test/push";

const databases = testDatabases();

const RELEASES = [
  { id: "00000000-0000-4000-8000-000000000001", date: "2026-06-18", precision: "day" },
  { id: "00000000-0000-4000-8000-000000000002", date: "2026-06-01", precision: "month" },
  { id: "00000000-0000-4000-8000-000000000003", date: "2026-01-01", precision: "year" },
  { id: "00000000-0000-4000-8000-000000000004", date: "2025-12-31", precision: "day" },
] as const;

const ORDERS = [
  { id: "order-day", releaseDate: "2026-06-18", precision: "day" },
  { id: "order-month", releaseDate: "2026-06-01", precision: "month" },
  { id: "order-undated", releaseDate: null, precision: "day" },
  { id: "order-year", releaseDate: "2026-01-01", precision: "year" },
] as const;

const MIGRATED_REPORT =
  'Release date precision migration: {"status":"migrated","releases":{"day":2,"month":1,"year":1},"orders":{"day":1,"month":1,"year":1}}';

/** A database pushed from main's schema, which has no precision columns. */
async function databaseOnMain() {
  const database = await databases.create();
  const pushed = await dbPush(database.url);
  expect(pushed.exitCode).toBe(0);
  const { sql } = database;
  await sql`ALTER TABLE item_release DROP COLUMN date_precision`;
  await sql`ALTER TABLE "order" DROP COLUMN release_date_precision`;
  await sql`
    INSERT INTO "user" (id, name, email, email_verified, username)
    VALUES ('u1', 'User One', 'u1@example.com', true, 'user_one')
  `;
  await sql`INSERT INTO item (id, owner_id, external_id, title) VALUES ('item-a', 'u1', 1001, 'Item A')`;
  for (const release of RELEASES) {
    await sql`INSERT INTO item_release (id, item_id, date) VALUES (${release.id}, 'item-a', ${release.date})`;
  }
  for (const order of ORDERS) {
    await sql`
      INSERT INTO "order" (id, user_id, title, release_date)
      VALUES (${order.id}, 'u1', ${order.id}, ${order.releaseDate})
    `;
  }
  return database;
}

const precisions = async (sql: SQL) => ({
  releases: [
    ...(await sql`SELECT id, to_char(date, 'YYYY-MM-DD') AS date, date_precision AS precision
      FROM item_release ORDER BY id`),
  ],
  orders: [
    ...(await sql`SELECT id, to_char(release_date, 'YYYY-MM-DD') AS "releaseDate",
      release_date_precision AS precision FROM "order" ORDER BY id`),
  ],
});

const untouchedColumns = async (sql: SQL) => ({
  releases: [
    ...(await sql`SELECT to_jsonb(r) - 'date_precision' AS row FROM item_release r ORDER BY id`),
  ],
  orders: [
    ...(await sql`SELECT to_jsonb(o) - 'release_date_precision' AS row FROM "order" o ORDER BY id`),
  ],
});

test(
  "db-push from main's shape gives every Item Release and Order Release Date a precision by the backfill rule, with no prompt and no lost row; a second run changes nothing",
  async () => {
    const fresh = await databases.create();
    const freshPush = await dbPush(fresh.url);
    expect(freshPush.exitCode).toBe(0);
    const freshCatalog = await snapshot(fresh.sql);

    const { sql, url } = await databaseOnMain();
    const before = await untouchedColumns(sql);

    const first = await dbPush(url);
    expect(first.exitCode).toBe(0);
    expect(first.output).toContain(MIGRATED_REPORT);
    expect(first.output).not.toContain("date_precision");
    expect(await precisions(sql)).toEqual({
      releases: RELEASES.map(({ id, date, precision }) => ({ id, date, precision })),
      orders: ORDERS.map(({ id, releaseDate, precision }) => ({ id, releaseDate, precision })),
    });
    expect(await untouchedColumns(sql)).toEqual(before);
    const pushed = await snapshot(sql);
    expect(pushed.columns).toEqual(freshCatalog.columns);
    expect(pushed.constraints).toEqual(freshCatalog.constraints);

    const second = await dbPush(url);
    expect(second.exitCode).toBe(0);
    expect(second.output).toContain(
      'Release date precision migration: {"status":"already-migrated"}',
    );
    expect(await snapshot(sql)).toEqual(pushed);
  },
  PUSH_TIMEOUT * 4,
);

test(
  "a failing backfill rolls the step back, and db-push stops before the push",
  async () => {
    const { sql, url } = await databaseOnMain();
    // The step adds this column after it has changed item_release, so its ADD COLUMN fails there.
    await sql`ALTER TABLE "order" ADD COLUMN release_date_precision text`;
    const before = await snapshot(sql);

    const failed = await dbPush(url);
    expect(failed.exitCode).toBe(1);
    expect(failed.output).toContain("RELEASE DATE PRECISION MIGRATION FAILED.");
    expect(failed.output).not.toContain("Changes applied");
    expect(await snapshot(sql)).toEqual(before);
  },
  PUSH_TIMEOUT * 2,
);
