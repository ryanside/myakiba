import process from "node:process";
import { SQL } from "bun";
import dotenv from "dotenv";
import { installOwnerGuards } from "../item-ownership/guards";
import { migrateItemOwnership } from "../item-ownership/migrate";
import type { MigrationReport } from "../item-ownership/migrate";

dotenv.config({
  path: "../../apps/server/.env",
});

const SUCCESS_MESSAGES = ["Changes applied", "No changes detected"] as const;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to push the database schema");
}

// Retired in 0d74a0d1, each after the tables that reference it. main's database still has them, and
// push cannot drop them without a prompt: it asks whether add_commit is one of them renamed.
const RETIRED_TABLES = [
  "data_transfer_import_item",
  "data_transfer_import",
  "sync_session_item",
  "sync_session",
] as const;

// The pushed schema declares per-owner indexes, so pre-ownership Items get their owners first.
const database = new SQL({ url: databaseUrl });
let migration: MigrationReport;
try {
  await database.begin(async (tx) => {
    for (const table of RETIRED_TABLES) {
      const [found] = await tx<[{ exists: boolean }]>`
        SELECT to_regclass(${`public.${table}`}) IS NOT NULL AS exists
      `;
      if (!found.exists) continue;
      const [{ rows }] = await tx.unsafe<[{ rows: number }]>(
        `SELECT count(*)::int AS rows FROM "${table}"`,
      );
      await tx.unsafe(`DROP TABLE IF EXISTS "${table}"`);
      console.log(`Dropped retired table ${table} (${rows} rows).`);
    }
  });
  await database`CREATE EXTENSION IF NOT EXISTS pg_trgm`;
  migration = await migrateItemOwnership(database);
  console.log(`Item ownership migration: ${JSON.stringify(migration)}`);
} finally {
  await database.close();
}

const child = Bun.spawn(["bunx", "drizzle-kit", "push", "--verbose"], {
  cwd: process.cwd(),
  env: process.env,
  stdin: "ignore",
  stdout: "pipe",
  stderr: "pipe",
});

const relay = async (stream: ReadableStream<Uint8Array>, destination: NodeJS.WriteStream) => {
  const decoder = new TextDecoder();
  let output = "";

  for await (const chunk of stream) {
    destination.write(chunk);
    output += decoder.decode(chunk, { stream: true });
  }

  output += decoder.decode();
  return output;
};

const [stdout, stderr, exitCode] = await Promise.all([
  relay(child.stdout, process.stdout),
  relay(child.stderr, process.stderr),
  child.exited,
]);

const output = `${stdout}\n${stderr}`;
const completed = SUCCESS_MESSAGES.some((message) => output.includes(message));

if (exitCode !== 0 || !completed) {
  console.error(
    [
      "",
      "SCHEMA PUSH FAILED. drizzle-kit's output above shows where it stopped. A TTY error means it stopped at a prompt.",
      ...(migration.status === "migrated"
        ? [
            "The Item ownership migration above has committed, so the database is migrated but not pushed.",
            "The running server's Item writes fail until db-push completes.",
          ]
        : []),
      "Fix the cause and run db-push again. It reports already-migrated and finishes the push.",
      "To undo the deploy instead, restore the pg_dump taken before it.",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

// Push does not read triggers, so the owner guards are installed after every push. A database
// without the owner columns yet has none to install.
const guarded = new SQL({ url: databaseUrl });
try {
  const guards = await installOwnerGuards(guarded);
  console.log(
    guards === "installed"
      ? "Item owner guards installed."
      : "Item owner guards skipped: no owner columns.",
  );
} finally {
  await guarded.close();
}
