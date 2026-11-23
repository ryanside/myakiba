import { expect, test } from "bun:test";
import type { SQL } from "bun";
import { snapshot, testDatabases } from "../../test/database";
import { MAIN_SCHEMA } from "../../test/main-schema";
import { PUSH_TIMEOUT, dbPush } from "../../test/push";

const databases = testDatabases();

const ORDERS = `
INSERT INTO "order" (id, user_id, title, paid, shipping_fee) VALUES
  ('all-paid-flag-off', 'u1', 'All paid, flag off', false, 100),
  ('all-paid-flag-on', 'u1', 'All paid, flag on', true, 100),
  ('some-paid-flag-off', 'u1', 'Some paid, flag off', false, 100),
  ('some-paid-flag-on', 'u1', 'Some paid, flag on', true, 100),
  ('none-paid-flag-on', 'u1', 'None paid, flag on', true, 100),
  ('none-paid-flag-off', 'u1', 'None paid, flag off', false, 100),
  ('no-items-flag-on', 'u1', 'No items, flag on', true, 100),
  ('no-items-flag-off', 'u1', 'No items, flag off', false, 100);
`;

const COLLECTION = `
INSERT INTO collection (id, user_id, item_id, order_id, status, paid, price, tags) VALUES
  ('a1', 'u1', 'item-a', 'all-paid-flag-off', 'Ordered', true, 1000, '{}'),
  ('a2', 'u1', 'item-a', 'all-paid-flag-off', 'Owned', true, 1000, '{}'),
  ('b1', 'u1', 'item-a', 'all-paid-flag-on', 'Ordered', true, 1000, '{}'),
  ('b2', 'u1', 'item-a', 'all-paid-flag-on', 'Shipped', true, 1000, '{}'),
  ('c1', 'u1', 'item-a', 'some-paid-flag-off', 'Ordered', true, 1000, '{}'),
  ('c2', 'u1', 'item-a', 'some-paid-flag-off', 'Ordered', false, 1000, '{}'),
  ('d1', 'u1', 'item-a', 'some-paid-flag-on', 'Owned', false, 1000, '{}'),
  ('d2', 'u1', 'item-a', 'some-paid-flag-on', 'Owned', true, 1000, '{}'),
  ('e1', 'u1', 'item-a', 'none-paid-flag-on', 'Ordered', false, 1000, '{}'),
  ('f1', 'u1', 'item-a', 'none-paid-flag-off', 'Ordered', false, 1000, '{}'),
  ('loose', 'u1', 'item-a', NULL, 'Owned', false, 1000, '{}');
`;

const PAID_AFTER = [
  { id: "all-paid-flag-off", paid: true },
  { id: "all-paid-flag-on", paid: true },
  { id: "no-items-flag-off", paid: false },
  { id: "no-items-flag-on", paid: true },
  { id: "none-paid-flag-off", paid: false },
  { id: "none-paid-flag-on", paid: false },
  { id: "some-paid-flag-off", paid: false },
  { id: "some-paid-flag-on", paid: false },
];

const MIGRATED_REPORT =
  'Paid-on-Order migration: {"status":"migrated","ordersRead":8,"turnedPaid":1,"turnedUnpaid":2,"leftAlone":5}';

const orderPaid = async (sql: SQL) => [...(await sql`SELECT id, paid FROM "order" ORDER BY id`)];

const rowsApartFromPaid = async (sql: SQL) => ({
  orders: [...(await sql`SELECT to_jsonb(o) - 'paid' AS row FROM "order" o ORDER BY id`)],
  collection: [...(await sql`SELECT to_jsonb(c) - 'paid' AS row FROM collection c ORDER BY id`)],
});

const collectionPaidColumn = (sql: SQL) => sql`
  SELECT column_name FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'collection' AND column_name = 'paid'
`;

const catalog = async (sql: SQL) => {
  const { columns, indexes, constraints, triggers } = await snapshot(sql);
  return { columns, indexes, constraints, triggers };
};

async function freshlyPushed() {
  const database = await databases.create();
  const pushed = await dbPush(database.url);
  expect(pushed.exitCode).toBe(0);
  return database;
}

/** A database as main's db-push leaves it: an item Paid column and no mark, holding every case. */
async function databaseAsMainLeavesIt() {
  const database = await freshlyPushed();
  await database.sql`ALTER TABLE collection ADD COLUMN IF NOT EXISTS "paid" boolean DEFAULT false NOT NULL`;
  await database.sql`COMMENT ON COLUMN "order"."paid" IS NULL`;
  await database.sql`
    INSERT INTO "user" (id, name, email, email_verified, username)
    VALUES ('u1', 'User One', 'u1@example.com', true, 'user_one')
  `;
  await database.sql`
    INSERT INTO item (id, owner_id, external_id, source, title)
    VALUES ('item-a', 'u1', 1001, 'mfc', 'Item A')
  `;
  await database.sql.unsafe(ORDERS);
  await database.sql.unsafe(COLLECTION);
  return database;
}

test(
  "db-push from main's shape sets each Order's Paid from its items, keeps an Order with no items as it was, prints only counts, and drops the item Paid column so push finds today's schema",
  async () => {
    const fresh = await freshlyPushed();
    const freshCatalog = await catalog(fresh.sql);

    const { sql, url } = await databaseAsMainLeavesIt();
    const before = await rowsApartFromPaid(sql);

    const pushed = await dbPush(url);
    expect(pushed.exitCode).toBe(0);
    expect(pushed.output).toContain(MIGRATED_REPORT);
    expect(pushed.output).not.toMatch(/ALTER TABLE "collection"[^\n]*"paid"/);
    expect(await orderPaid(sql)).toEqual(PAID_AFTER);
    expect(await rowsApartFromPaid(sql)).toEqual(before);
    expect([...(await collectionPaidColumn(sql))]).toEqual([]);
    expect(await catalog(sql)).toEqual(freshCatalog);
  },
  PUSH_TIMEOUT * 3,
);

test(
  "a second db-push changes nothing, so a Paid set on an Order after the first run stays",
  async () => {
    const { sql, url } = await databaseAsMainLeavesIt();
    const first = await dbPush(url);
    expect(first.exitCode).toBe(0);
    expect(first.output).toContain(MIGRATED_REPORT);

    await sql`UPDATE "order" SET paid = false WHERE id = 'all-paid-flag-on'`;
    await sql`UPDATE "order" SET paid = true WHERE id = 'none-paid-flag-off'`;
    const changedByUser = await snapshot(sql);

    const second = await dbPush(url);
    expect(second.exitCode).toBe(0);
    expect(second.output).toContain('Paid-on-Order migration: {"status":"already-migrated"}');
    expect(await snapshot(sql)).toEqual(changedByUser);
  },
  PUSH_TIMEOUT * 3,
);

const MAIN_ITEM_PAID = `ALTER TABLE collection ADD COLUMN "paid" boolean DEFAULT false NOT NULL`;

test(
  "after a rollback's push re-adds the item Paid column as all false, db-push only drops it, so Paid set on Orders since stays",
  async () => {
    const { sql, url } = await databaseAsMainLeavesIt();
    const first = await dbPush(url);
    expect(first.exitCode).toBe(0);
    expect(first.output).toContain(MIGRATED_REPORT);

    await sql.unsafe(MAIN_ITEM_PAID);
    await sql`UPDATE "order" SET paid = true WHERE id = 'none-paid-flag-off'`;
    await sql`UPDATE "order" SET paid = false WHERE id = 'all-paid-flag-on'`;
    const setByHand = await orderPaid(sql);

    const again = await dbPush(url);
    expect(again.exitCode).toBe(0);
    expect(again.output).toContain('Paid-on-Order migration: {"status":"readded-column-dropped"}');
    expect(await orderPaid(sql)).toEqual(setByHand);
    expect([...(await collectionPaidColumn(sql))]).toEqual([]);
  },
  PUSH_TIMEOUT * 3,
);

test(
  "a brand-new database is marked by its first db-push, so a rollback's item Paid column is only dropped",
  async () => {
    const { sql, url } = await databases.create();
    const first = await dbPush(url);
    expect(first.exitCode).toBe(0);
    expect(first.output).toContain('Paid-on-Order migration: {"status":"fresh-database"}');

    await sql`
      INSERT INTO "user" (id, name, email, email_verified, username)
      VALUES ('u1', 'User One', 'u1@example.com', true, 'user_one')
    `;
    await sql`
      INSERT INTO item (id, owner_id, external_id, source, title)
      VALUES ('item-a', 'u1', 1001, 'mfc', 'Item A')
    `;
    await sql`INSERT INTO "order" (id, user_id, title, paid) VALUES ('paid-order', 'u1', 'Paid', true)`;
    await sql`
      INSERT INTO collection (id, user_id, item_id, order_id, status, price, tags)
      VALUES ('in-paid-order', 'u1', 'item-a', 'paid-order', 'Ordered', 1000, '{}')
    `;
    await sql.unsafe(MAIN_ITEM_PAID);

    const again = await dbPush(url);
    expect(again.exitCode).toBe(0);
    expect(again.output).toContain('Paid-on-Order migration: {"status":"readded-column-dropped"}');
    expect(await orderPaid(sql)).toEqual([{ id: "paid-order", paid: true }]);
    expect([...(await collectionPaidColumn(sql))]).toEqual([]);
  },
  PUSH_TIMEOUT * 2,
);

test(
  "db-push from the shape before the paid columns runs both Paid steps in one go, setting each Order's Paid from what its items' statuses made them",
  async () => {
    const template = await databases.legacyTemplate(async (sql) => {
      await sql`
        INSERT INTO "user" (id, name, email, email_verified, username)
        VALUES ('u1', 'User One', 'u1@example.com', true, 'user_one')
      `;
      await sql`INSERT INTO item (id, external_id, source, title) VALUES ('item-a', 1001, 'mfc', 'Item A')`;
      await sql`
        INSERT INTO "order" (id, user_id, title, status) VALUES
          ('items-sent', 'u1', 'Items sent', 'Ordered'),
          ('one-item-waiting', 'u1', 'One item waiting', 'Owned'),
          ('empty', 'u1', 'Empty', 'Ordered')
      `;
      await sql`
        INSERT INTO collection (id, user_id, item_id, order_id, status, price, tags) VALUES
          ('sent-1', 'u1', 'item-a', 'items-sent', 'Shipped', 100, '{}'),
          ('sent-2', 'u1', 'item-a', 'items-sent', 'Paid', 100, '{}'),
          ('waiting-1', 'u1', 'item-a', 'one-item-waiting', 'Ordered', 100, '{}'),
          ('waiting-2', 'u1', 'item-a', 'one-item-waiting', 'Owned', 100, '{}')
      `;
    }, MAIN_SCHEMA);
    const { sql, url } = await databases.create(template);

    const pushed = await dbPush(url);
    expect(pushed.exitCode).toBe(0);
    expect(pushed.output).toContain('Paid migration: {"status":"migrated"');
    expect(pushed.output).toContain(
      'Paid-on-Order migration: {"status":"migrated","ordersRead":3,"turnedPaid":1,"turnedUnpaid":1,"leftAlone":1}',
    );
    expect(await orderPaid(sql)).toEqual([
      { id: "empty", paid: false },
      { id: "items-sent", paid: true },
      { id: "one-item-waiting", paid: false },
    ]);
    expect([...(await collectionPaidColumn(sql))]).toEqual([]);
  },
  PUSH_TIMEOUT * 2,
);

test(
  "db-push on a brand-new database has nothing to convert and never makes an item Paid column",
  async () => {
    const { sql, url } = await databases.create();

    const pushed = await dbPush(url);
    expect(pushed.exitCode).toBe(0);
    expect(pushed.output).toContain('Paid-on-Order migration: {"status":"fresh-database"}');
    expect([...(await collectionPaidColumn(sql))]).toEqual([]);
  },
  PUSH_TIMEOUT,
);

test(
  "a failed step rolls back, keeps the item Paid column, and db-push stops before the push",
  async () => {
    const { sql, url } = await databaseAsMainLeavesIt();
    await sql.unsafe(`
      CREATE FUNCTION refuse_paid() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'refused'; END $$;
      CREATE TRIGGER refuse_paid BEFORE UPDATE OF paid ON "order"
        FOR EACH ROW EXECUTE FUNCTION refuse_paid();
    `);
    const before = await snapshot(sql);

    const failed = await dbPush(url);
    expect(failed.exitCode).toBe(1);
    expect(failed.output).toContain("PAID-ON-ORDER MIGRATION FAILED.");
    expect(failed.output).not.toContain("Changes applied");
    expect([...(await collectionPaidColumn(sql))]).toEqual([{ column_name: "paid" }]);
    expect(await snapshot(sql)).toEqual(before);
  },
  PUSH_TIMEOUT * 2,
);
