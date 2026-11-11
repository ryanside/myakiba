import { beforeAll, expect, test } from "bun:test";
import path from "node:path";
import type { SQL } from "bun";
import { snapshot, testDatabases } from "../../test/database";
import { deleteRetiredItems, planItemCleanup } from "./cleanup";
import { migrateItemOwnership, verifyItemOwnership } from "./migrate";
import { seedSharedItems } from "./seed";

const databases = testDatabases();
let seeded: string;
let migrated: string;

beforeAll(async () => {
  seeded = await databases.legacyTemplate(seedSharedItems);
  migrated = await databases.legacyTemplate(async (sql) => {
    await seedSharedItems(sql);
    await migrateItemOwnership(sql);
  });
});

const RETIRED = {
  items: ["item-a", "item-b", "item-c", "item-d", "item-e", "item-f"],
  releases: [
    "a0000000-0000-4000-8000-000000000001",
    "a0000000-0000-4000-8000-000000000002",
    "a0000000-0000-4000-8000-000000000003",
    "b0000000-0000-4000-8000-000000000001",
    "d0000000-0000-4000-8000-000000000001",
    "e0000000-0000-4000-8000-000000000001",
    "e0000000-0000-4000-8000-000000000002",
  ],
  entries: ["entry-1", "entry-2", "entry-3", "entry-4", "entry-5", "entry-6"],
  links: [
    { entryId: "entry-1", itemId: "item-a" },
    { entryId: "entry-1", itemId: "item-b" },
    { entryId: "entry-2", itemId: "item-a" },
    { entryId: "entry-3", itemId: "item-a" },
    { entryId: "entry-4", itemId: "item-e" },
    { entryId: "entry-5", itemId: "item-d" },
  ],
  pictureKeys: ["items/mfc/1004/dddddddddddddddd.png"],
};

async function withoutOwner(sql: SQL) {
  const [counts] = await sql`
    SELECT
      (SELECT count(*) FROM item WHERE owner_id IS NULL)::int AS items,
      (SELECT count(*) FROM item_release r JOIN item i ON i.id = r.item_id
        WHERE i.owner_id IS NULL)::int AS releases,
      (SELECT count(*) FROM entry WHERE owner_id IS NULL)::int AS entries,
      (SELECT count(*) FROM entry_to_item WHERE owner_id IS NULL)::int AS links
  `;
  return counts;
}

const ITEM_TABLES = new Set(["item", "item_release", "entry", "entry_to_item"]);

async function keptRows(sql: SQL) {
  const [owned] = await sql`
    SELECT
      (SELECT string_agg(t::text, E'\n' ORDER BY t::text) FROM item t
        WHERE owner_id IS NOT NULL) AS items,
      (SELECT string_agg(r::text, E'\n' ORDER BY r::text) FROM item_release r
        JOIN item i ON i.id = r.item_id WHERE i.owner_id IS NOT NULL) AS releases,
      (SELECT string_agg(t::text, E'\n' ORDER BY t::text) FROM entry t
        WHERE owner_id IS NOT NULL) AS entries,
      (SELECT string_agg(t::text, E'\n' ORDER BY t::text) FROM entry_to_item t
        WHERE owner_id IS NOT NULL) AS links
  `;
  const { rows } = await snapshot(sql);
  const others = Object.entries(rows).filter(([table]) => !ITEM_TABLES.has(table));
  return { owned, others };
}

test("refuses to plan or delete before the ownership migration, when deleting would take Collection Items with it", async () => {
  const { sql } = await databases.create(seeded);
  const before = await snapshot(sql);
  const refusal = "Run the Item ownership migration before items:cleanup";
  await expect(planItemCleanup(sql)).rejects.toThrow(refusal);
  await expect(deleteRetiredItems(sql)).rejects.toThrow(refusal);
  expect(await snapshot(sql)).toEqual(before);
});

test("a dry run lists exactly the retired rows and the pictures only they show, and deletes nothing", async () => {
  const { sql } = await databases.create(migrated);
  const before = await snapshot(sql);
  expect(await planItemCleanup(sql)).toEqual(RETIRED);
  expect(await snapshot(sql)).toEqual(before);
});

test("--delete deletes exactly the retired rows, keeps every owned row, and owner closure still holds", async () => {
  const { sql } = await databases.create(migrated);
  const kept = await keptRows(sql);
  expect(await deleteRetiredItems(sql)).toEqual(RETIRED);
  expect(await withoutOwner(sql)).toEqual({ items: 0, releases: 0, entries: 0, links: 0 });
  expect(await keptRows(sql)).toEqual(kept);
  expect(await verifyItemOwnership(sql)).toEqual([]);
  expect(await migrateItemOwnership(sql)).toEqual({ status: "already-migrated" });
  expect(await deleteRetiredItems(sql)).toEqual({
    items: [],
    releases: [],
    entries: [],
    links: [],
    pictureKeys: [],
  });
});

test("bun run items:cleanup prints the plan and deletes only with --delete", async () => {
  const { sql, url } = await databases.create(migrated);
  const cleanup = async (...flags: string[]) => {
    const child = Bun.spawn([process.execPath, "run", "items:cleanup", ...flags], {
      cwd: path.resolve(import.meta.dir, "../.."),
      env: { ...process.env, DATABASE_URL: url },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    return { exitCode, stdout, stderr };
  };

  const dryRun = await cleanup();
  expect(dryRun).toMatchObject({ exitCode: 0, stderr: expect.stringContaining("Dry run") });
  expect(dryRun.stdout).toContain('"items/mfc/1004/dddddddddddddddd.png"');
  expect(await withoutOwner(sql)).toEqual({ items: 6, releases: 7, entries: 6, links: 6 });

  expect(await cleanup("--delete")).toMatchObject({ exitCode: 0 });
  expect(await withoutOwner(sql)).toEqual({ items: 0, releases: 0, entries: 0, links: 0 });
});
