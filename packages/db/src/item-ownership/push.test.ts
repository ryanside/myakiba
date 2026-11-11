import { expect, test } from "bun:test";
import { snapshot, testDatabases } from "../../test/database";
import { PUSH_TIMEOUT, REPEATED_ON_EVERY_PUSH, pushSchema } from "../../test/push";
import { isItemOwnershipMigrated, migrateItemOwnership, verifyItemOwnership } from "./migrate";
import { seedSharedItems } from "./seed";

const databases = testDatabases();

// The migration installs these. Push reads no triggers, so it neither declares nor drops them.
const OWNER_GUARDS = [
  "collection_owner_guard",
  "entry_owner_guard",
  "entry_to_item_owner_guard",
  "item_owner_guard",
  "item_release_owner_guard",
  "list_owner_guard",
  "list_member_owner_guard",
  "wishlist_item_owner_guard",
];

async function catalog(url: string, sql: Parameters<typeof snapshot>[0]) {
  expect(await pushSchema(url)).toMatchObject({ applied: true });
  const { columns, indexes, constraints } = await snapshot(sql);
  return { columns, indexes, constraints };
}

test(
  "pushes the owned schema onto a migrated database with no prompt and no lost row",
  async () => {
    const seeded = await databases.legacyTemplate(seedSharedItems);
    const { sql, url } = await databases.create(seeded);
    await migrateItemOwnership(sql);
    const before = await snapshot(sql);
    expect(before.triggers.map((trigger) => trigger.tgname)).toEqual(OWNER_GUARDS);
    expect(await pushSchema(url)).toMatchObject({
      applied: true,
      statements: REPEATED_ON_EVERY_PUSH,
    });
    const after = await snapshot(sql);
    expect(after.rows).toEqual(before.rows);
    expect(after.triggers).toEqual(before.triggers);
    expect(after.functions).toEqual(before.functions);
    expect(await isItemOwnershipMigrated(sql)).toBe(true);
    expect(await verifyItemOwnership(sql)).toEqual([]);
    expect(await pushSchema(url)).toMatchObject({
      applied: true,
      statements: REPEATED_ON_EVERY_PUSH,
    });
    expect(await snapshot(sql)).toEqual(after);
  },
  PUSH_TIMEOUT,
);

test(
  "an empty database pushed twice ends with the schema a migrated database gets",
  async () => {
    const empty = await databases.create();
    await empty.sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`;
    const fresh = await catalog(empty.url, empty.sql);
    expect(await pushSchema(empty.url)).toMatchObject({
      applied: true,
      statements: REPEATED_ON_EVERY_PUSH,
    });

    const seeded = await databases.legacyTemplate(seedSharedItems);
    const legacy = await databases.create(seeded);
    await migrateItemOwnership(legacy.sql);
    expect(await catalog(legacy.url, legacy.sql)).toEqual(fresh);
  },
  PUSH_TIMEOUT,
);
