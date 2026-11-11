import { expect, test } from "bun:test";
import path from "node:path";
import { snapshot, testDatabases } from "../../test/database";
import { PUSH_TIMEOUT } from "../../test/push";
import { ownerGuardsInstalled } from "../item-ownership/guards";
import { migrateItemOwnership, verifyItemOwnership } from "../item-ownership/migrate";
import { seedSharedItems } from "../item-ownership/seed";

const databases = testDatabases();

async function dbPush(url: string) {
  const child = Bun.spawn(["bun", "src/scripts/push-schema.ts"], {
    cwd: path.join(import.meta.dir, "../.."),
    env: { ...process.env, DATABASE_URL: url },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { exitCode, output: `${stdout}\n${stderr}` };
}

test(
  "db-push migrates a legacy database, pushes with no prompt and no lost row, and installs the guards; a second run changes nothing",
  async () => {
    const seeded = await databases.legacyTemplate(seedSharedItems);
    const migratedOnly = await databases.create(seeded);
    await migrateItemOwnership(migratedOnly.sql);
    const expected = await snapshot(migratedOnly.sql);

    const { sql, url } = await databases.create(seeded);
    const first = await dbPush(url);
    expect(first.exitCode).toBe(0);
    expect(first.output).toContain('Item ownership migration: {"status":"migrated"');
    expect(first.output).toContain("Item owner guards installed.");
    const pushed = await snapshot(sql);
    expect(pushed.rows).toEqual(expected.rows);
    expect(pushed.triggers).toEqual(expected.triggers);
    expect(pushed.functions).toEqual(expected.functions);
    expect(await ownerGuardsInstalled(sql)).toBe(true);
    expect(await verifyItemOwnership(sql)).toEqual([]);

    const second = await dbPush(url);
    expect(second.exitCode).toBe(0);
    expect(second.output).toContain('Item ownership migration: {"status":"already-migrated"}');
    expect(await snapshot(sql)).toEqual(pushed);
  },
  PUSH_TIMEOUT * 2,
);

test(
  "db-push skips the migration on a fresh database and installs the guards; a second run changes nothing",
  async () => {
    const { sql, url } = await databases.create();
    const first = await dbPush(url);
    expect(first.exitCode).toBe(0);
    expect(first.output).toContain('Item ownership migration: {"status":"fresh-database"}');
    expect(first.output).toContain("Item owner guards installed.");
    expect(await ownerGuardsInstalled(sql)).toBe(true);
    const pushed = await snapshot(sql);

    const second = await dbPush(url);
    expect(second.exitCode).toBe(0);
    expect(second.output).toContain('Item ownership migration: {"status":"already-migrated"}');
    expect(await snapshot(sql)).toEqual(pushed);
  },
  PUSH_TIMEOUT * 2,
);
