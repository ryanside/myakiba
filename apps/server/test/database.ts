import { afterAll } from "bun:test";
import { SQL } from "bun";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import * as authSchema from "@myakiba/db/schema/auth";
import * as figureSchema from "@myakiba/db/schema/figure";
import { installOwnerGuards } from "@myakiba/db/owner-guards";

/** Creates a fresh database with the app schema, points DATABASE_URL at it and drops it after the file. */
export async function createTestDatabase() {
  const serverUrl = process.env.TEST_DATABASE_URL;
  if (!serverUrl) {
    throw new Error(
      "Set TEST_DATABASE_URL to a Postgres server this test can create databases on, such as postgres://test:test@127.0.0.1:5432/test",
    );
  }
  const databaseName = `test_${crypto.randomUUID().replaceAll("-", "")}`;
  const server = new SQL({ url: serverUrl });
  await server.unsafe(`CREATE DATABASE ${databaseName}`);
  const databaseUrl = new URL(serverUrl);
  databaseUrl.pathname = `/${databaseName}`;
  process.env.DATABASE_URL = databaseUrl.toString();

  const { db } = await import("@myakiba/db/client");
  await db.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm");
  const schemaStatements = await generateMigration(
    generateDrizzleJson({}),
    generateDrizzleJson({ ...authSchema, ...figureSchema }),
  );
  for (const statement of schemaStatements) await db.execute(statement);
  await installOwnerGuards(db.$client);

  afterAll(async () => {
    await db.$client.close();
    await server.unsafe(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
    await server.close();
  });
  return db;
}

type Database = Awaited<ReturnType<typeof createTestDatabase>>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Writes rows the owner guards would reject, as a database could hold from before a guard
 * existed: guards fire only on writes, so installing one leaves such a row in place.
 */
export async function writeUnguarded(
  db: Database,
  write: (tx: Transaction) => PromiseLike<object>,
) {
  await db.transaction(async (tx) => {
    await tx.execute("SET LOCAL session_replication_role = replica");
    await write(tx);
  });
}
