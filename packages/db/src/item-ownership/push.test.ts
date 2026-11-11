import { expect, test } from "bun:test";
import path from "node:path";
import { snapshot, testDatabases } from "../../test/database";
import { isItemOwnershipMigrated, migrateItemOwnership, verifyItemOwnership } from "./migrate";
import { seedSharedItems } from "./seed";

const databases = testDatabases();
const PUSH_TIMEOUT = 60_000;
const OWNED_SCHEMA = Bun.fileURLToPath(import.meta.resolve("../../test/owned-schema.ts"));

// drizzle-kit 0.31.10 reads a composite foreign key's columns in no fixed order, so every push
// drops and re-adds the seven composite owner keys. The roles default is rewritten on every push
// of today's schema too.
const REPEATED_ON_EVERY_PUSH = [
  'ALTER TABLE "collection" DROP CONSTRAINT "collection_item_owner_fk"',
  'ALTER TABLE "collection" DROP CONSTRAINT "collection_release_of_item_fk"',
  'ALTER TABLE "entry_to_item" DROP CONSTRAINT "entry_to_item_entry_owner_fk"',
  'ALTER TABLE "entry_to_item" DROP CONSTRAINT "entry_to_item_item_owner_fk"',
  'ALTER TABLE "list_member" DROP CONSTRAINT "list_member_list_owner_fk"',
  'ALTER TABLE "list_member" DROP CONSTRAINT "list_member_item_owner_fk"',
  'ALTER TABLE "wishlist_item" DROP CONSTRAINT "wishlist_item_item_owner_fk"',
  `ALTER TABLE "entry_to_item" ALTER COLUMN "roles" SET DEFAULT '{}'::text[]`,
  'ALTER TABLE "collection" ADD CONSTRAINT "collection_item_owner_fk" FOREIGN KEY ("user_id","item_id") REFERENCES "public"."item"("owner_id","id") ON DELETE cascade ON UPDATE no action',
  'ALTER TABLE "collection" ADD CONSTRAINT "collection_release_of_item_fk" FOREIGN KEY ("item_id","release_id") REFERENCES "public"."item_release"("item_id","id") ON DELETE no action ON UPDATE no action',
  'ALTER TABLE "entry_to_item" ADD CONSTRAINT "entry_to_item_entry_owner_fk" FOREIGN KEY ("owner_id","entry_id") REFERENCES "public"."entry"("owner_id","id") ON DELETE cascade ON UPDATE no action',
  'ALTER TABLE "entry_to_item" ADD CONSTRAINT "entry_to_item_item_owner_fk" FOREIGN KEY ("owner_id","item_id") REFERENCES "public"."item"("owner_id","id") ON DELETE cascade ON UPDATE no action',
  'ALTER TABLE "list_member" ADD CONSTRAINT "list_member_list_owner_fk" FOREIGN KEY ("user_id","list_id") REFERENCES "public"."list"("user_id","id") ON DELETE cascade ON UPDATE no action',
  'ALTER TABLE "list_member" ADD CONSTRAINT "list_member_item_owner_fk" FOREIGN KEY ("user_id","item_id") REFERENCES "public"."item"("owner_id","id") ON DELETE cascade ON UPDATE no action',
  'ALTER TABLE "wishlist_item" ADD CONSTRAINT "wishlist_item_item_owner_fk" FOREIGN KEY ("user_id","item_id") REFERENCES "public"."item"("owner_id","id") ON DELETE cascade ON UPDATE no action',
].toSorted();

/** Pushes test/owned-schema.ts as push-schema.ts pushes the app's schema: no TTY, so any prompt fails. */
async function push(url: string) {
  const child = Bun.spawn(
    [
      "bunx",
      "drizzle-kit",
      "push",
      "--verbose",
      "--dialect=postgresql",
      `--schema=${OWNED_SCHEMA}`,
      `--url=${url}`,
      "--schemaFilters=public",
    ],
    { cwd: path.join(import.meta.dir, "../.."), stdin: "ignore", stdout: "pipe", stderr: "pipe" },
  );
  const [stdout, stderr] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  const output = `${stdout}\n${stderr}`;
  const [, executed = ""] = /current statements:\n([\s\S]*?)\n\n\S*\[/.exec(output) ?? [];
  return {
    applied: ["Changes applied", "No changes detected"].some((done) => output.includes(done)),
    // Push orders a migrated database's tables differently from a fresh one's.
    statements: executed
      .split(/;\n/)
      .map((statement) => statement.trim().replace(/;$/, ""))
      .filter(Boolean)
      .toSorted(),
    output,
  };
}

async function catalog(url: string, sql: Parameters<typeof snapshot>[0]) {
  expect(await push(url)).toMatchObject({ applied: true });
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
    expect(await push(url)).toMatchObject({
      applied: true,
      statements: REPEATED_ON_EVERY_PUSH,
    });
    const after = await snapshot(sql);
    expect(after.rows).toEqual(before.rows);
    expect(await isItemOwnershipMigrated(sql)).toBe(true);
    expect(await verifyItemOwnership(sql)).toEqual([]);
    expect(await push(url)).toMatchObject({ applied: true, statements: REPEATED_ON_EVERY_PUSH });
  },
  PUSH_TIMEOUT,
);

test(
  "an empty database pushed twice ends with the schema a migrated database gets",
  async () => {
    const empty = await databases.create();
    await empty.sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`;
    const fresh = await catalog(empty.url, empty.sql);
    expect(await push(empty.url)).toMatchObject({
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
