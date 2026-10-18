import { afterAll } from "bun:test";
import { SQL } from "bun";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import * as authSchema from "@myakiba/db/schema/auth";
import * as figureSchema from "@myakiba/db/schema/figure";

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

  afterAll(async () => {
    await db.$client.close();
    await server.unsafe(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
    await server.close();
  });
  return db;
}
