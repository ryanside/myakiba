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

function stop(lines: readonly string[]): never {
  console.error(["", ...lines, ""].join("\n"));
  process.exit(1);
}

async function attempt<T>(work: () => PromiseLike<T>, failed: string): Promise<T> {
  try {
    return await work();
  } catch (error) {
    console.error(error);
    return stop([failed, "Fix the cause and run db-push again."]);
  }
}

// The pushed schema declares per-owner indexes, so pre-ownership Items get their owners first.
const database = new SQL({ url: databaseUrl });
let migration: MigrationReport;
try {
  await attempt(
    () => database`CREATE EXTENSION IF NOT EXISTS pg_trgm`,
    "CREATING THE pg_trgm EXTENSION FAILED. The migration did not run, so the database is as it was.",
  );
  migration = await attempt(
    () => migrateItemOwnership(database),
    "ITEM OWNERSHIP MIGRATION FAILED. It rolled back, so the database is as it was, retired tables included.",
  );
} finally {
  await database.close();
}
console.log(`Item ownership migration: ${JSON.stringify(migration)}`);
if (migration.status === "migrated") {
  for (const { table, rows } of migration.droppedTables) {
    console.log(`Dropped retired table ${table} (${rows} rows).`);
  }
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
  stop([
    "SCHEMA PUSH FAILED. drizzle-kit's output above shows where it stopped. A TTY error means it stopped at a prompt.",
    ...(migration.status === "migrated"
      ? [
          "The Item ownership migration above has committed, so the database is migrated but not pushed.",
          "main's Import/Export and sync no longer work, because the retired tables went with that commit, and its Item writes fail until the new server starts.",
        ]
      : []),
    "Fix the cause and run db-push again. It reports already-migrated and finishes the push.",
    "To undo the deploy instead, restore the pg_dump taken before it.",
  ]);
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
