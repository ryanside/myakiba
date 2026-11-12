import { beforeAll, describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { snapshot, testDatabases } from "../../test/database";
import { MIGRATION_STEPS, migrateItemOwnership, verifyItemOwnership } from "./migrate";
import { seedScaledSharedItems, seedSharedItems } from "./seed";

const databases = testDatabases();
let seeded: string;
let cleanRun: Awaited<ReturnType<typeof snapshot>>;

// The migration deletes the originals it copies, so each database keeps them aside to compare with.
async function seedWithOriginals(sql: SQL) {
  await seedSharedItems(sql);
  await sql.unsafe(`
    CREATE SCHEMA original;
    CREATE TABLE original.item AS TABLE item;
    CREATE TABLE original.item_release AS TABLE item_release;
    CREATE TABLE original.entry AS TABLE entry;
    CREATE TABLE original.entry_to_item AS TABLE entry_to_item;
  `);
}

beforeAll(async () => {
  seeded = await databases.legacyTemplate(seedWithOriginals);
  const { sql } = await databases.create(seeded);
  await migrateItemOwnership(sql);
  cleanRun = await snapshot(sql);
});

async function migrated() {
  const database = await databases.create(seeded);
  const report = await migrateItemOwnership(database.sql);
  return { ...database, report };
}

const COPIES = `SELECT c.id, c.owner_id, o.id AS original FROM item c
  JOIN original.item o ON to_jsonb(o) - 'id' = to_jsonb(c) - 'id' - 'owner_id'`;

const PAIRS = `(VALUES ('u1', 'item-a'), ('u1', 'item-b'), ('u2', 'item-a'), ('u2', 'item-e'),
  ('u3', 'item-a')) p (owner_id, item_id)`;

async function rows(sql: SQL, query: string) {
  return [...(await sql.unsafe(query))];
}

test("reports one copy per user and referenced Item, with its releases, Item Entries and links", async () => {
  const { report } = await migrated();
  expect(report).toEqual({
    status: "migrated",
    attempts: 1,
    pairs: 5,
    copied: { items: 5, entries: 10, links: 11, releases: 12 },
    foreignReleasesCleared: 1,
    otherUsersListTargets: 0,
    repointed: { collection: 5, wishlistItem: 2, listMemberItem: 2, listMemberOwner: 5 },
    deleted: { items: 6, entries: 6, links: 6, releases: 7 },
    milliseconds: expect.any(Number),
  });
});

test("deletes every Item, Item Entry, link and release without an owner, unreferenced Items included", async () => {
  const { sql } = await migrated();
  const ownerless = `SELECT 'item' AS kind, id FROM item WHERE owner_id IS NULL
    UNION ALL SELECT 'entry', id FROM entry WHERE owner_id IS NULL
    UNION ALL SELECT 'link', entry_id || ' ' || item_id FROM entry_to_item WHERE owner_id IS NULL
    UNION ALL SELECT 'release', r.id::text FROM item_release r JOIN item i ON i.id = r.item_id
      WHERE i.owner_id IS NULL`;
  expect(await rows(sql, ownerless)).toEqual([]);
  expect(
    await rows(sql, "SELECT owner_id, count(*)::int AS items FROM item GROUP BY 1 ORDER BY 1"),
  ).toEqual([
    { owner_id: "u1", items: 2 },
    { owner_id: "u2", items: 2 },
    { owner_id: "u3", items: 1 },
  ]);
  expect(await rows(sql, "SELECT id FROM item WHERE id LIKE 'item-%'")).toEqual([]);
});

test("gives each user one copy of every Item they referenced, equal to it down to the picture", async () => {
  const { sql } = await migrated();
  expect(await rows(sql, `SELECT owner_id, original FROM (${COPIES}) c ORDER BY 1, 2`)).toEqual([
    { owner_id: "u1", original: "item-a" },
    { owner_id: "u1", original: "item-b" },
    { owner_id: "u2", original: "item-a" },
    { owner_id: "u2", original: "item-e" },
    { owner_id: "u3", original: "item-a" },
  ]);
  expect(await verifyItemOwnership(sql)).toEqual([]);
});

test("re-points every reference to its user's copy of the Item it pointed at", async () => {
  const { sql } = await migrated();
  const references = await rows(
    sql,
    `WITH copy AS (${COPIES})
    SELECT 'collection' AS kind, r.id, r.user_id AS referrer, copy.owner_id AS owner, copy.original
      FROM collection r JOIN copy ON copy.id = r.item_id
    UNION ALL SELECT 'list member', r.id, r.user_id, copy.owner_id, copy.original
      FROM list_member r JOIN copy ON copy.id = r.item_id
    UNION ALL SELECT 'wishlist', r.id, r.user_id, copy.owner_id, copy.original
      FROM wishlist_item r JOIN copy ON copy.id = r.item_id
    ORDER BY 1, 2`,
  );
  const reference = (kind: string, id: string, user: string, original: string) => ({
    kind,
    id,
    referrer: user,
    owner: user,
    original,
  });
  expect(references).toEqual([
    reference("collection", "col-1", "u1", "item-a"),
    reference("collection", "col-2", "u1", "item-a"),
    reference("collection", "col-3", "u3", "item-a"),
    reference("collection", "col-4", "u3", "item-a"),
    reference("collection", "col-5", "u2", "item-e"),
    reference("list member", "member-1", "u1", "item-b"),
    reference("list member", "member-4", "u2", "item-a"),
    reference("wishlist", "wish-1", "u2", "item-a"),
    reference("wishlist", "wish-2", "u3", "item-a"),
  ]);
  expect(
    await rows(
      sql,
      "SELECT id, user_id, collection_id, order_id FROM list_member WHERE item_id IS NULL ORDER BY id",
    ),
  ).toEqual([
    { id: "member-2", user_id: "u1", collection_id: "col-1", order_id: null },
    { id: "member-3", user_id: "u1", collection_id: null, order_id: "order-1" },
    { id: "member-5", user_id: "u3", collection_id: "col-3", order_id: null },
  ]);
});

test("changes nothing else in the reference tables, updated_at included", async () => {
  const { sql: before } = await databases.create(seeded);
  const { sql: after } = await migrated();
  const unchanged = `SELECT to_jsonb(c) - 'item_id' - 'release_id' AS row FROM collection c
    UNION ALL SELECT to_jsonb(w) - 'item_id' FROM wishlist_item w
    UNION ALL SELECT to_jsonb(m) - 'item_id' - 'user_id' FROM list_member m
    ORDER BY 1`;
  const seededRows = await rows(before, unchanged);
  expect(seededRows).toHaveLength(12);
  expect(await rows(after, unchanged)).toEqual(seededRows);
});

test("moves each Selected Item Release to its copy, and clears and counts a release of another Item", async () => {
  const { sql, report } = await migrated();
  const selected = await rows(
    sql,
    `SELECT c.id, c.release_id IS NULL AS cleared, o.id AS original FROM collection c
    LEFT JOIN item_release r ON r.id = c.release_id AND r.item_id = c.item_id
    LEFT JOIN original.item_release o
      ON to_jsonb(o) - 'id' - 'item_id' = to_jsonb(r) - 'id' - 'item_id'
    ORDER BY c.id`,
  );
  expect(selected).toEqual([
    { id: "col-1", cleared: false, original: "a0000000-0000-4000-8000-000000000001" },
    { id: "col-2", cleared: true, original: null },
    { id: "col-3", cleared: false, original: "a0000000-0000-4000-8000-000000000002" },
    { id: "col-4", cleared: true, original: null },
    { id: "col-5", cleared: false, original: "e0000000-0000-4000-8000-000000000001" },
  ]);
  expect(report).toMatchObject({ foreignReleasesCleared: 1 });
});

test("counts List Members whose Collection Item or Order belongs to another user than the List", async () => {
  const { sql } = await databases.create(seeded);
  await sql.unsafe(`
    INSERT INTO list_member (id, list_id, item_id, collection_id, order_id, position, created_at) VALUES
      ('member-x', 'list-2', NULL, 'col-1', NULL, 1, '2026-02-09 10:00'),
      ('member-y', 'list-2', NULL, NULL, 'order-1', 2, '2026-02-09 10:00');
  `);
  expect(await migrateItemOwnership(sql)).toMatchObject({
    status: "migrated",
    otherUsersListTargets: 2,
  });
});

test("gives every copied release a version 8 UUID, which the contracts' z.uuid() accepts", async () => {
  const { sql } = await migrated();
  const ids = await rows(sql, "SELECT id FROM item_release");
  expect(ids).toHaveLength(12);
  for (const { id } of ids) {
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
  }
});

test("copies each user's Item Entries once, with every link and its roles and material percentage", async () => {
  const { sql } = await migrated();
  const link = `e.name, e.category, e.source, e.external_id, l.role, l.roles, l.source_label,
    l.material_percentage`;
  const owned = await rows(
    sql,
    `SELECT l.owner_id, copy.original AS item, ${link} FROM entry_to_item l
    JOIN (${COPIES}) copy ON copy.id = l.item_id JOIN entry e ON e.id = l.entry_id
    ORDER BY 1, 2, 3`,
  );
  const expected = await rows(
    sql,
    `SELECT p.owner_id, p.item_id AS item, ${link} FROM ${PAIRS}
    JOIN original.entry_to_item l ON l.item_id = p.item_id JOIN original.entry e ON e.id = l.entry_id
    ORDER BY 1, 2, 3`,
  );
  expect(expected).toHaveLength(11);
  expect(owned).toEqual(expected);
  expect(
    await rows(sql, "SELECT owner_id, count(*)::int AS entries FROM entry GROUP BY 1 ORDER BY 1"),
  ).toEqual([
    { owner_id: "u1", entries: 3 },
    { owner_id: "u2", entries: 4 },
    { owner_id: "u3", entries: 3 },
  ]);
});

test("a second run changes nothing, and two clean runs write the same rows", async () => {
  const { sql } = await migrated();
  const first = await snapshot(sql);
  expect(first).toEqual(cleanRun);
  expect(await migrateItemOwnership(sql)).toEqual({ status: "already-migrated" });
  expect(await snapshot(sql)).toEqual(first);
});

test("leaves the owner columns NOT NULL, so a write without an owner fails from the moment it commits", async () => {
  const { sql } = await migrated();
  expect(
    await rows(
      sql,
      `SELECT table_name, is_nullable FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'owner_id' ORDER BY 1`,
    ),
  ).toEqual([
    { table_name: "entry", is_nullable: "NO" },
    { table_name: "entry_to_item", is_nullable: "NO" },
    { table_name: "item", is_nullable: "NO" },
  ]);
  await expect(
    sql`INSERT INTO item (id, title) VALUES ('item-late', 'Late')`,
  ).rejects.toMatchObject({
    errno: "23502",
  });
});

test("a migrated database missing an owner guard is still migrated, so the migration does not run again", async () => {
  const { sql } = await migrated();
  await sql`DROP TRIGGER wishlist_item_owner_guard ON wishlist_item`;
  const before = await snapshot(sql);
  expect(await migrateItemOwnership(sql)).toEqual({ status: "already-migrated" });
  expect(await snapshot(sql)).toEqual(before);
});

test("refuses a table it does not re-point that references Item Entry links, and changes nothing", async () => {
  const { sql } = await databases.create(seeded);
  await sql.unsafe(`
    CREATE TABLE link_note (entry_id text, item_id text, note text,
      FOREIGN KEY (entry_id, item_id) REFERENCES entry_to_item (entry_id, item_id) ON DELETE CASCADE);
    INSERT INTO link_note VALUES ('entry-2', 'item-a', 'kept');
  `);
  const before = await snapshot(sql);
  await expect(migrateItemOwnership(sql)).rejects.toThrow(
    "a table this migration does not re-point references Items, Item Entries or their links (1)",
  );
  expect(await snapshot(sql)).toEqual(before);
});

test.each(MIGRATION_STEPS)(
  "a crash after %s leaves the database as seeded, and the next run equals a clean run",
  async (step) => {
    const { sql } = await databases.create(seeded);
    const before = await snapshot(sql);
    const crash = new Error(`crashed after ${step}`);
    await expect(
      migrateItemOwnership(sql, {
        afterStep: (done) => {
          if (done === step) throw crash;
        },
      }),
    ).rejects.toBe(crash);
    expect(await snapshot(sql)).toEqual(before);
    await migrateItemOwnership(sql);
    expect(await snapshot(sql)).toEqual(cleanRun);
  },
);

test("gives separate copies to two pairs whose owner and Item ids join to the same text", async () => {
  const { sql } = await databases.create(seeded);
  await sql.unsafe(`
    INSERT INTO "user" (id, name, email, email_verified, username, created_at, updated_at) VALUES
      ('x', 'X', 'x@example.com', true, 'x', now(), now()),
      ('x:y', 'X Y', 'xy@example.com', true, 'x_y', now(), now());
    INSERT INTO item (id, title) VALUES ('y:z', 'Item Y Z'), ('z', 'Item Z');
    INSERT INTO collection (id, user_id, item_id, tags) VALUES
      ('col-x', 'x', 'y:z', '{}'), ('col-xy', 'x:y', 'z', '{}');
  `);
  expect(await migrateItemOwnership(sql)).toMatchObject({ status: "migrated", pairs: 7 });
  expect(
    await rows(
      sql,
      `SELECT c.user_id, i.title FROM collection c JOIN item i ON i.id = c.item_id
      WHERE c.id IN ('col-x', 'col-xy') ORDER BY 1`,
    ),
  ).toEqual([
    { user_id: "x", title: "Item Y Z" },
    { user_id: "x:y", title: "Item Z" },
  ]);
});

test("leaves a fresh database alone", async () => {
  const { sql } = await databases.create();
  expect(await migrateItemOwnership(sql)).toEqual({ status: "fresh-database" });
  const { columns } = await snapshot(sql);
  expect(columns).toEqual([]);
});

describe("table locks", () => {
  async function holdCollectionLock(sql: SQL) {
    const locked = Promise.withResolvers<true>();
    const release = Promise.withResolvers<true>();
    const holding = sql.begin(async (tx) => {
      await tx`LOCK TABLE collection IN ACCESS SHARE MODE`;
      locked.resolve(true);
      await release.promise;
    });
    await locked.promise;
    return async () => {
      release.resolve(true);
      await holding;
    };
  }

  async function lockWaitStartedAt(sql: SQL, other?: string) {
    for (let poll = 0; poll < 500; poll++) {
      const [waiting] = await rows(
        sql,
        `SELECT xact_start::text AS started FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'`,
      );
      if (waiting && waiting.started !== other) return waiting.started;
      await Bun.sleep(10);
    }
    throw new Error("the migration never waited for its lock");
  }

  test("retries an attempt that timed out on a held lock", async () => {
    const { sql } = await databases.create(seeded);
    const releaseLock = await holdCollectionLock(sql);
    const migration = migrateItemOwnership(sql, { lockTimeout: "500ms" });
    const firstAttempt = await lockWaitStartedAt(sql);
    await lockWaitStartedAt(sql, firstAttempt);
    await releaseLock();
    expect(await migration).toMatchObject({ status: "migrated", attempts: 2 });
  });

  async function crossMigration(sql: SQL, first: string, then: string) {
    const holding = Promise.withResolvers<true>();
    const migrationWaits = Promise.withResolvers<true>();
    const crossing = sql.begin(async (tx) => {
      await tx.unsafe(`LOCK TABLE ${first}`);
      holding.resolve(true);
      await migrationWaits.promise;
      await tx.unsafe(`LOCK TABLE ${then}`);
    });
    await holding.promise;
    const migration = migrateItemOwnership(sql);
    await lockWaitStartedAt(sql);
    migrationWaits.resolve(true);
    await crossing;
    return migration;
  }

  test("retries an attempt Postgres aborted to break a deadlock with another transaction", async () => {
    const { sql } = await databases.create(seeded);
    const migration = crossMigration(
      sql,
      "list_member IN ROW EXCLUSIVE MODE",
      "item IN ACCESS SHARE MODE",
    );
    expect(await migration).toMatchObject({ status: "migrated", attempts: 2 });
  });

  test("waits for a transaction writing users before it locks the Item tables, so the two never deadlock", async () => {
    const { sql } = await databases.create(seeded);
    const migration = crossMigration(
      sql,
      `"user" IN ROW EXCLUSIVE MODE`,
      "collection IN ACCESS SHARE MODE",
    );
    expect(await migration).toMatchObject({ status: "migrated", attempts: 1 });
  });

  test("migrates a Collection Item committed while it waits for its lock, even under a repeatable read default", async () => {
    const { sql, name, url } = await databases.create(seeded);
    await sql.unsafe(
      `ALTER DATABASE ${name} SET default_transaction_isolation TO 'repeatable read'`,
    );
    const repeatableRead = new SQL({ url, max: 1 });
    try {
      const written = Promise.withResolvers<true>();
      const commit = Promise.withResolvers<true>();
      const writing = sql.begin(async (tx) => {
        await tx`INSERT INTO collection (id, user_id, item_id, tags) VALUES ('col-late', 'u4', 'item-a', '{}')`;
        written.resolve(true);
        await commit.promise;
      });
      await written.promise;
      const migration = migrateItemOwnership(repeatableRead);
      await lockWaitStartedAt(sql);
      commit.resolve(true);
      await writing;
      expect(await migration).toMatchObject({ status: "migrated", pairs: 6 });
      expect(await verifyItemOwnership(sql)).toEqual([]);
    } finally {
      await repeatableRead.close();
    }
  });

  test("gives up after three attempts and leaves the database as it was", async () => {
    const { sql } = await databases.create(seeded);
    const before = await snapshot(sql);
    const releaseLock = await holdCollectionLock(sql);
    await expect(migrateItemOwnership(sql, { lockTimeout: "50ms" })).rejects.toMatchObject({
      errno: "55P03",
    });
    await releaseLock();
    expect(await snapshot(sql)).toEqual(before);
  });
});

test("migrates a generated seed of 20 users with 9 references each", async () => {
  const template = await databases.legacyTemplate((sql) =>
    seedScaledSharedItems(sql, { users: 20, items: 50, entries: 30, referencesPerUser: 9 }),
  );
  const { sql } = await databases.create(template);
  expect(await migrateItemOwnership(sql)).toMatchObject({
    status: "migrated",
    pairs: 180,
    copied: { items: 180, links: 720, releases: 360 },
    repointed: { collection: 60, wishlistItem: 60, listMemberItem: 60, listMemberOwner: 60 },
    deleted: { items: 50, entries: 30, links: 200, releases: 100 },
  });
  expect(await verifyItemOwnership(sql)).toEqual([]);
});
