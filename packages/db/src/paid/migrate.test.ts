import { expect, test } from "bun:test";
import type { SQL } from "bun";
import { snapshot, testDatabases } from "../../test/database";
import { MAIN_SCHEMA } from "../../test/main-schema";
import { PUSH_TIMEOUT, dbPush } from "../../test/push";

const databases = testDatabases();

const ORDERS = `
INSERT INTO "order" (id, user_id, title, status, payment_date, shipping_fee) VALUES
  ('order-ordered', 'u1', 'Preorder', 'Ordered', NULL, 1000),
  ('order-ordered-dated', 'u1', 'Deposit sent', 'Ordered', '2026-03-01', 1100),
  ('order-paid', 'u1', 'Paid up front', 'Paid', '2026-02-01', 1200),
  ('order-shipped', 'u2', 'On the way', 'Shipped', NULL, 1300),
  ('order-owned', 'u2', 'Arrived', 'Owned', '2026-01-15', 1400);
`;

const COLLECTION = (u1Item: string, u2Item: string) => `
INSERT INTO collection (id, user_id, item_id, order_id, status, payment_date, price, tags) VALUES
  ('col-paid-order-ordered', 'u1', '${u1Item}', 'order-paid', 'Ordered', NULL, 100, '{}'),
  ('col-paid-order-paid', 'u1', '${u1Item}', 'order-paid', 'Paid', '2026-02-01', 200, '{}'),
  ('col-ordered-order-shipped', 'u1', '${u1Item}', 'order-ordered', 'Shipped', NULL, 300, '{}'),
  ('col-ordered-dated', 'u1', '${u1Item}', 'order-ordered-dated', 'Ordered', '2026-03-01', 400, '{}'),
  ('col-owned-order-owned', 'u2', '${u2Item}', 'order-owned', 'Owned', NULL, 500, '{}'),
  ('col-loose-owned', 'u2', '${u2Item}', NULL, 'Owned', NULL, 600, '{}'),
  ('col-loose-paid', 'u2', '${u2Item}', NULL, 'Paid', NULL, 700, '{}');
`;

const USERS = `
INSERT INTO "user" (id, name, email, email_verified, username) VALUES
  ('u1', 'User One', 'u1@example.com', true, 'user_one'),
  ('u2', 'User Two', 'u2@example.com', true, 'user_two');
`;

const AFTER_DB_PUSH_ORDERS = [
  { id: "order-ordered", status: "Ordered", paid: true },
  { id: "order-ordered-dated", status: "Ordered", paid: false },
  { id: "order-owned", status: "Owned", paid: true },
  { id: "order-paid", status: "Ordered", paid: false },
  { id: "order-shipped", status: "Shipped", paid: true },
];

const CONVERTED_COLLECTION = [
  { id: "col-loose-owned", status: "Owned" },
  { id: "col-loose-paid", status: "Ordered" },
  { id: "col-ordered-dated", status: "Ordered" },
  { id: "col-ordered-order-shipped", status: "Shipped" },
  { id: "col-owned-order-owned", status: "Owned" },
  { id: "col-paid-order-ordered", status: "Ordered" },
  { id: "col-paid-order-paid", status: "Ordered" },
];

const MIGRATED_REPORT =
  'Paid migration: {"status":"migrated","order":{"rows":5,"paid":3,"paidStatusToOrdered":1},"collection":{"rows":7,"paid":5,"paidStatusToOrdered":2}}';

const paidState = async (sql: SQL) => ({
  orders: [...(await sql`SELECT id, status, paid FROM "order" ORDER BY id`)],
  collection: [...(await sql`SELECT id, status FROM collection ORDER BY id`)],
});

const columnsBothMigrationsKeep = async (sql: SQL) => ({
  orders: [
    ...(await sql`SELECT to_jsonb(o) - '{status,paid,release_date_precision}'::text[] AS row FROM "order" o ORDER BY id`),
  ],
  collection: [
    ...(await sql`
      SELECT to_jsonb(c) - '{status,paid,item_id,release_id}'::text[] AS row
      FROM collection c ORDER BY id
    `),
  ],
});

const paidColumns = (sql: SQL) => sql`
  SELECT table_name FROM information_schema.columns
  WHERE table_schema = 'public' AND column_name = 'paid' ORDER BY table_name
`;

async function freshlyPushedCatalog() {
  const fresh = await databases.create();
  const pushed = await dbPush(fresh.url);
  expect(pushed.exitCode).toBe(0);
  return snapshot(fresh.sql);
}

async function baseSchemaDatabase() {
  const database = await databases.create();
  const pushed = await dbPush(database.url);
  expect(pushed.exitCode).toBe(0);
  await database.sql`ALTER TABLE "order" DROP COLUMN paid`;
  await database.sql`ALTER TABLE collection DROP COLUMN IF EXISTS paid`;
  await database.sql.unsafe(USERS);
  await database.sql`
    INSERT INTO item (id, owner_id, external_id, source, title) VALUES
      ('item-a', 'u1', 1001, 'mfc', 'Item A'),
      ('item-b', 'u2', NULL, 'custom', 'Item B')
  `;
  await database.sql.unsafe(ORDERS);
  return database;
}

test(
  "db-push converts every Order and Collection Item of a database in main's shape to a paid flag and three statuses, with no prompt and no lost row; a second run changes nothing",
  async () => {
    const freshCatalog = await freshlyPushedCatalog();

    const template = await databases.legacyTemplate(async (sql) => {
      await sql.unsafe(USERS);
      await sql`
        INSERT INTO item (id, external_id, source, title) VALUES
          ('item-a', 1001, 'mfc', 'Item A'),
          ('item-b', NULL, 'custom', 'Item B')
      `;
      await sql.unsafe(ORDERS);
      await sql.unsafe(COLLECTION("item-a", "item-b"));
    }, MAIN_SCHEMA);
    const { sql, url } = await databases.create(template);
    const before = await columnsBothMigrationsKeep(sql);

    const first = await dbPush(url);
    expect(first.exitCode).toBe(0);
    expect(first.output).toContain('Item ownership migration: {"status":"migrated"');
    expect(first.output).toContain(MIGRATED_REPORT);
    expect(first.output).not.toContain('ADD COLUMN "paid"');
    expect(await paidState(sql)).toEqual({
      orders: AFTER_DB_PUSH_ORDERS,
      collection: CONVERTED_COLLECTION,
    });
    expect(await columnsBothMigrationsKeep(sql)).toEqual(before);
    const pushed = await snapshot(sql);
    expect(pushed.columns).toEqual(freshCatalog.columns);

    const second = await dbPush(url);
    expect(second.exitCode).toBe(0);
    expect(second.output).toContain('Paid migration: {"status":"already-migrated"}');
    expect(await snapshot(sql)).toEqual(pushed);
  },
  PUSH_TIMEOUT * 3,
);

test(
  "db-push converts a database whose Item ownership is already migrated, and push then finds the paid columns as the schema declares them",
  async () => {
    const freshCatalog = await freshlyPushedCatalog();

    const { sql, url } = await baseSchemaDatabase();
    await sql.unsafe(COLLECTION("item-a", "item-b"));
    const before = await columnsBothMigrationsKeep(sql);

    const first = await dbPush(url);
    expect(first.exitCode).toBe(0);
    expect(first.output).toContain('Item ownership migration: {"status":"already-migrated"}');
    expect(first.output).toContain(MIGRATED_REPORT);
    expect(first.output).not.toContain('ADD COLUMN "paid"');
    expect(await paidState(sql)).toEqual({
      orders: AFTER_DB_PUSH_ORDERS,
      collection: CONVERTED_COLLECTION,
    });
    expect(await columnsBothMigrationsKeep(sql)).toEqual(before);
    const pushed = await snapshot(sql);
    expect(pushed.columns).toEqual(freshCatalog.columns);

    const second = await dbPush(url);
    expect(second.exitCode).toBe(0);
    expect(second.output).toContain('Paid migration: {"status":"already-migrated"}');
    expect(await snapshot(sql)).toEqual(pushed);
  },
  PUSH_TIMEOUT * 4,
);

test(
  "a row with a status outside Ordered, Shipped and Owned rolls the step back, and db-push stops before the push",
  async () => {
    const { sql, url } = await baseSchemaDatabase();
    await sql.unsafe(COLLECTION("item-a", "item-b"));
    await sql`UPDATE collection SET status = 'Cancelled' WHERE id = 'col-loose-owned'`;
    const before = await snapshot(sql);

    const failed = await dbPush(url);
    expect(failed.exitCode).toBe(1);
    expect(failed.output).toContain("collection has 1 rows with a status other than");
    expect(failed.output).toContain("PAID MIGRATION FAILED.");
    expect(failed.output).not.toContain("Changes applied");
    expect(await paidColumns(sql)).toEqual([]);
    expect(await snapshot(sql)).toEqual(before);
  },
  PUSH_TIMEOUT * 2,
);
