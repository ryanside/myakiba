import { beforeAll, describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { snapshot, testDatabases } from "../../test/database";
import { PUSH_TIMEOUT, pushSchema } from "../../test/push";
import { OWNER_CHECKS, OWNER_MISMATCH, installOwnerGuards, ownerGuardsInstalled } from "./guards";
import { migrateItemOwnership, verifyItemOwnership } from "./migrate";
import { seedSharedItems } from "./seed";

const databases = testDatabases();
let seeded: string;

beforeAll(async () => {
  seeded = await databases.legacyTemplate(seedSharedItems);
});

const RELEASE_OF_U1 = "11111111-1111-4111-8111-111111111111";
const OTHER_RELEASE_OF_U1 = "11111111-1111-4111-8111-222222222222";
const RELEASE_OF_U2 = "22222222-2222-4222-8222-222222222222";

/** The migrated seed with an Item, two releases and an Item Entry owned by u1, and the same for u2. */
async function migrated() {
  const database = await databases.create(seeded);
  await migrateItemOwnership(database.sql);
  await database.sql.unsafe(`
    INSERT INTO item (id, owner_id, title) VALUES ('item-u1', 'u1', 'Mine'), ('item-u2', 'u2', 'Theirs');
    INSERT INTO item_release (id, item_id, date) VALUES
      ('${RELEASE_OF_U1}', 'item-u1', '2026-03-01'), ('${OTHER_RELEASE_OF_U1}', 'item-u1', '2026-04-01'),
      ('${RELEASE_OF_U2}', 'item-u2', '2026-03-01');
    INSERT INTO entry (id, owner_id, category, name) VALUES
      ('entry-u1', 'u1', 'Characters', 'Mine'), ('entry-u2', 'u2', 'Characters', 'Theirs');
  `);
  return database;
}

type Check = keyof typeof OWNER_CHECKS;

async function outcome(write: Promise<unknown>): Promise<"written" | Check | string> {
  try {
    await write;
    return "written";
  } catch (error) {
    const { errno, constraint, message } = error as {
      errno?: string;
      constraint?: string;
      message: string;
    };
    if (errno === OWNER_MISMATCH && constraint !== undefined) {
      expect(message).toBe(OWNER_CHECKS[constraint as Check]);
      return constraint;
    }
    return `${errno}: ${message}`;
  }
}

describe("each guard rejects a write across users and lets the owner's own write through", () => {
  test("a Collection Item and its Item", async () => {
    const { sql } = await migrated();
    expect(
      await outcome(
        sql`INSERT INTO collection (id, user_id, item_id, tags) VALUES ('col-x', 'u2', 'item-u1', '{}')`,
      ),
    ).toBe("collection_item_owner");
    expect(
      await outcome(
        sql`INSERT INTO collection (id, user_id, item_id, tags) VALUES ('col-x', 'u1', 'item-u1', '{}')`,
      ),
    ).toBe("written");
    expect(await outcome(sql`UPDATE collection SET item_id = 'item-u2' WHERE id = 'col-x'`)).toBe(
      "collection_item_owner",
    );
    expect(await outcome(sql`UPDATE collection SET user_id = 'u2' WHERE id = 'col-x'`)).toBe(
      "collection_item_owner",
    );
    expect(await outcome(sql`UPDATE collection SET notes = 'kept' WHERE id = 'col-x'`)).toBe(
      "written",
    );
  });

  test("a Collection Item and its Selected Item Release", async () => {
    const { sql } = await migrated();
    expect(
      await outcome(
        sql`INSERT INTO collection (id, user_id, item_id, release_id, tags)
          VALUES ('col-x', 'u1', 'item-u1', ${RELEASE_OF_U2}, '{}')`,
      ),
    ).toBe("collection_release_of_item");
    expect(
      await outcome(
        sql`INSERT INTO collection (id, user_id, item_id, release_id, tags)
          VALUES ('col-x', 'u1', 'item-u1', ${RELEASE_OF_U1}, '{}')`,
      ),
    ).toBe("written");
    expect(
      await outcome(sql`UPDATE collection SET release_id = ${RELEASE_OF_U2} WHERE id = 'col-x'`),
    ).toBe("collection_release_of_item");
    expect(
      await outcome(
        sql`UPDATE collection SET release_id = ${OTHER_RELEASE_OF_U1} WHERE id = 'col-x'`,
      ),
    ).toBe("written");
  });

  test("a Wishlist Item and its Item", async () => {
    const { sql } = await migrated();
    expect(
      await outcome(
        sql`INSERT INTO wishlist_item (id, user_id, item_id) VALUES ('wish-x', 'u2', 'item-u1')`,
      ),
    ).toBe("wishlist_item_item_owner");
    expect(
      await outcome(
        sql`INSERT INTO wishlist_item (id, user_id, item_id) VALUES ('wish-x', 'u1', 'item-u1')`,
      ),
    ).toBe("written");
    expect(
      await outcome(sql`UPDATE wishlist_item SET item_id = 'item-u2' WHERE id = 'wish-x'`),
    ).toBe("wishlist_item_item_owner");
  });

  test("a List Member, its List and its Item", async () => {
    const { sql } = await migrated();
    expect(
      await outcome(
        sql`INSERT INTO list_member (id, list_id, user_id, item_id) VALUES ('member-x', 'list-2', 'u1', 'item-u1')`,
      ),
    ).toBe("list_member_list_owner");
    expect(
      await outcome(
        sql`INSERT INTO list_member (id, list_id, user_id, item_id) VALUES ('member-x', 'list-1', 'u1', 'item-u2')`,
      ),
    ).toBe("list_member_item_owner");
    expect(
      await outcome(
        sql`INSERT INTO list_member (id, list_id, user_id, item_id) VALUES ('member-x', 'list-1', 'u1', 'item-u1')`,
      ),
    ).toBe("written");
    expect(
      await outcome(sql`UPDATE list_member SET list_id = 'list-2' WHERE id = 'member-x'`),
    ).toBe("list_member_list_owner");
    expect(
      await outcome(sql`UPDATE list_member SET item_id = 'item-u2' WHERE id = 'member-x'`),
    ).toBe("list_member_item_owner");
  });

  test("an Item Entry link, its Item and its Item Entry", async () => {
    const { sql } = await migrated();
    expect(
      await outcome(
        sql`INSERT INTO entry_to_item (owner_id, entry_id, item_id) VALUES ('u1', 'entry-u1', 'item-u2')`,
      ),
    ).toBe("entry_to_item_item_owner");
    expect(
      await outcome(
        sql`INSERT INTO entry_to_item (owner_id, entry_id, item_id) VALUES ('u1', 'entry-u2', 'item-u1')`,
      ),
    ).toBe("entry_to_item_entry_owner");
    expect(
      await outcome(
        sql`INSERT INTO entry_to_item (owner_id, entry_id, item_id) VALUES (NULL, 'entry-u1', 'item-u1')`,
      ),
    ).toBe("entry_to_item_item_owner");
    expect(
      await outcome(
        sql`INSERT INTO entry_to_item (owner_id, entry_id, item_id) VALUES ('u1', 'entry-u1', 'item-u1')`,
      ),
    ).toBe("written");
    expect(
      await outcome(sql`UPDATE entry_to_item SET entry_id = 'entry-u2' WHERE item_id = 'item-u1'`),
    ).toBe("entry_to_item_entry_owner");
    expect(
      await outcome(sql`UPDATE entry_to_item SET owner_id = 'u2' WHERE item_id = 'item-u1'`),
    ).toBe("entry_to_item_item_owner");
  });

  test("an owner never changes on an Item, an Item Entry, a List or an Item Release", async () => {
    const { sql } = await migrated();
    expect(await outcome(sql`UPDATE item SET owner_id = 'u2' WHERE id = 'item-u1'`)).toBe(
      "item_owner_fixed",
    );
    expect(await outcome(sql`UPDATE item SET owner_id = 'u1' WHERE id = 'item-a'`)).toBe(
      "item_owner_fixed",
    );
    expect(await outcome(sql`UPDATE entry SET owner_id = NULL WHERE id = 'entry-u1'`)).toBe(
      "entry_owner_fixed",
    );
    expect(await outcome(sql`UPDATE list SET user_id = 'u2' WHERE id = 'list-1'`)).toBe(
      "list_owner_fixed",
    );
    expect(
      await outcome(sql`UPDATE item_release SET item_id = 'item-u2' WHERE id = ${RELEASE_OF_U1}`),
    ).toBe("item_release_item_fixed");
    expect(
      await outcome(sql`UPDATE item SET title = 'Renamed', owner_id = 'u1' WHERE id = 'item-u1'`),
    ).toBe("written");
    expect(await outcome(sql`UPDATE list SET title = 'Renamed' WHERE id = 'list-1'`)).toBe(
      "written",
    );
  });
});

test("rows without an owner stay writable, as they were before the migration", async () => {
  const { sql } = await migrated();
  expect(await outcome(sql`UPDATE item SET title = 'Retired' WHERE owner_id IS NULL`)).toBe(
    "written",
  );
  expect(
    await outcome(sql`UPDATE entry_to_item SET roles = '{Sculptor}' WHERE owner_id IS NULL`),
  ).toBe("written");
  expect(
    await outcome(sql`INSERT INTO entry_to_item (entry_id, item_id) VALUES ('entry-6', 'item-f')`),
  ).toBe("written");
  expect(await outcome(sql`DELETE FROM item WHERE owner_id IS NULL`)).toBe("written");
  expect(await verifyItemOwnership(sql)).toEqual([]);
});

test("a delete that cascades through a Selected Item Release passes every guard", async () => {
  const { sql } = await migrated();
  await sql`INSERT INTO collection (id, user_id, item_id, release_id, tags)
    VALUES ('col-x', 'u1', 'item-u1', ${RELEASE_OF_U1}, '{}'),
      ('col-y', 'u1', 'item-u1', ${OTHER_RELEASE_OF_U1}, '{}')`;
  expect(await outcome(sql`DELETE FROM item_release WHERE id = ${RELEASE_OF_U1}`)).toBe("written");
  expect(await sql`SELECT release_id FROM collection WHERE id = 'col-x'`).toEqual([
    { release_id: null },
  ]);
  expect(await outcome(sql`DELETE FROM item WHERE id = 'item-u1'`)).toBe("written");
  expect(await outcome(sql`DELETE FROM "user" WHERE id = 'u1'`)).toBe("written");
  expect(await sql`SELECT count(*)::int AS left FROM collection WHERE user_id = 'u1'`).toEqual([
    { left: 0 },
  ]);
});

test("a guard does not see an Item another transaction has not committed, so it rejects the write", async () => {
  const { sql } = await migrated();
  const inserted = Promise.withResolvers<true>();
  const finish = Promise.withResolvers<true>();
  const inserting = sql.begin(async (tx) => {
    await tx`INSERT INTO item (id, owner_id, title) VALUES ('item-late', 'u2', 'Late')`;
    inserted.resolve(true);
    await finish.promise;
  });
  await inserted.promise;
  const write = outcome(
    sql`INSERT INTO wishlist_item (id, user_id, item_id) VALUES ('wish-x', 'u1', 'item-late')`,
  );
  const result = await write;
  finish.resolve(true);
  await inserting;
  expect(result).toBe("wishlist_item_item_owner");
});

test("leaves a database without owner columns alone", async () => {
  const { sql } = await databases.create(seeded);
  const before = await snapshot(sql);
  expect(await installOwnerGuards(sql)).toBe("pre-ownership");
  expect(await snapshot(sql)).toEqual(before);
});

test("refuses a database with only some of the owner columns", async () => {
  const { sql } = await databases.create(seeded);
  await sql`ALTER TABLE item ADD COLUMN owner_id text`;
  await expect(installOwnerGuards(sql)).rejects.toThrow(
    "Cannot guard Item ownership without entry.owner_id, entry_to_item.owner_id, list_member.user_id",
  );
});

async function guardsOf(sql: SQL) {
  const { triggers, functions } = await snapshot(sql);
  return { triggers, functions };
}

test(
  "an empty database gets the guards after push, and installing them again or pushing again keeps them",
  async () => {
    const { sql, url } = await databases.create();
    await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`;
    expect(await pushSchema(url)).toMatchObject({ applied: true });
    expect(await ownerGuardsInstalled(sql)).toBe(false);
    expect(await installOwnerGuards(sql)).toBe("installed");
    expect(await ownerGuardsInstalled(sql)).toBe(true);
    const installed = await guardsOf(sql);
    expect(installed.triggers).toHaveLength(8);
    expect(await installOwnerGuards(sql)).toBe("installed");
    expect(await guardsOf(sql)).toEqual(installed);
    expect(await pushSchema(url)).toMatchObject({
      applied: true,
      statements: [`ALTER TABLE "entry_to_item" ALTER COLUMN "roles" SET DEFAULT '{}'::text[]`],
    });
    expect(await guardsOf(sql)).toEqual(installed);

    const migratedSeed = await databases.create(seeded);
    await migrateItemOwnership(migratedSeed.sql);
    expect(await guardsOf(migratedSeed.sql)).toEqual(installed);
  },
  PUSH_TIMEOUT,
);

const REISSUE_LOCK = 7;

async function waitsForALock(sql: SQL, marker: string): Promise<boolean> {
  const [{ waiting }] = await sql<[{ waiting: number }]>`
    SELECT count(*)::int AS waiting FROM pg_stat_activity
    WHERE wait_event_type = 'Lock' AND query LIKE ${`%${marker}%`} AND pid <> pg_backend_pid()
  `;
  return waiting > 0;
}

test("a guard locks the Item it checks, so an id deleted and reissued to another user mid-write cannot pass it", async () => {
  const { sql } = await migrated();
  await sql`INSERT INTO item (id, owner_id, title) VALUES ('item-u1-other', 'u1', 'Also mine')`;
  const reissued = Promise.withResolvers<true>();
  const release = Promise.withResolvers<true>();
  const reissuing = sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(${REISSUE_LOCK})`;
    await tx`DELETE FROM item WHERE id = 'item-u1'`;
    await tx`INSERT INTO item (id, owner_id, title) VALUES ('item-u1', 'u2', 'Reissued')`;
    reissued.resolve(true);
    await release.promise;
  });
  await reissued.promise;
  // Postgres runs a statement's foreign key checks after its last row, so they find the reissued Item.
  const write = outcome(sql`
    INSERT INTO collection (id, user_id, item_id, tags)
    SELECT v.id, 'u1', v.item_id, '{}'
    FROM (VALUES ('col-x', 'item-u1', 0), ('col-y', 'item-u1-other', ${REISSUE_LOCK}::int)) v(id, item_id, waits_for)
    WHERE v.waits_for = 0 OR (SELECT true FROM pg_advisory_xact_lock(v.waits_for))
  `);
  while (!(await waitsForALock(sql, "col-x"))) await Bun.sleep(10);
  release.resolve(true);
  await reissuing;
  expect(await write).toBe("collection_item_owner");
  expect(await verifyItemOwnership(sql)).toEqual([]);
});

test("overlapping installs all succeed", async () => {
  const database = await migrated();
  const clients = Array.from({ length: 6 }, () => new SQL({ url: database.url, max: 1 }));
  try {
    for (let round = 0; round < 5; round++) {
      const installs = await Promise.allSettled(
        clients.map((client) => installOwnerGuards(client)),
      );
      expect(installs.filter((install) => install.status === "rejected")).toEqual([]);
    }
  } finally {
    await Promise.all(clients.map((client) => client.close()));
  }
});

test("a guard that fires only on a replica is not installed, and installing enables it again", async () => {
  const { sql } = await migrated();
  await sql`ALTER TABLE collection ENABLE REPLICA TRIGGER collection_owner_guard`;
  expect(await ownerGuardsInstalled(sql)).toBe(false);
  expect(await installOwnerGuards(sql)).toBe("installed");
  expect(await ownerGuardsInstalled(sql)).toBe(true);
  await sql`ALTER TABLE collection ENABLE ALWAYS TRIGGER collection_owner_guard`;
  expect(await ownerGuardsInstalled(sql)).toBe(true);
});
