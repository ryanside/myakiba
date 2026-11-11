import { afterAll, afterEach } from "bun:test";
import { SQL } from "bun";
import { LEGACY_SCHEMA } from "../src/item-ownership/legacy-schema";

type TestDatabase = { readonly name: string; readonly url: string; readonly sql: SQL };

/**
 * Databases on the TEST_DATABASE_URL server. A database from `create` is dropped after the test
 * that made it, and a template after the file. Each DROP DATABASE waits for a checkpoint, which
 * grows with every database still on disk.
 */
export function testDatabases() {
  const serverUrl = process.env.TEST_DATABASE_URL;
  if (!serverUrl) {
    throw new Error(
      "Set TEST_DATABASE_URL to a Postgres server this test can create databases on, such as postgres://test:test@127.0.0.1:5432/test",
    );
  }
  const server = new SQL({ url: serverUrl });
  const open: TestDatabase[] = [];
  const templates: string[] = [];
  const urlOf = (name: string) => {
    const url = new URL(serverUrl);
    url.pathname = `/${name}`;
    return url.toString();
  };
  const drop = async (name: string) => {
    await server.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  };
  const dropOpen = async () => {
    for (const database of open.splice(0)) {
      await database.sql.close();
      await drop(database.name);
    }
  };

  afterEach(dropOpen);
  afterAll(async () => {
    await dropOpen();
    for (const name of templates.splice(0)) await drop(name);
    await server.close();
  });

  const createDatabase = async (template?: string): Promise<TestDatabase> => {
    const name = `test_${crypto.randomUUID().replaceAll("-", "")}`;
    await server.unsafe(`CREATE DATABASE ${name}${template ? ` TEMPLATE ${template}` : ""}`);
    // Bun opens all of a pool's connections at once. The lock tests use three: a lock holder,
    // the migration and a watcher.
    return { name, url: urlOf(name), sql: new SQL({ url: urlOf(name), max: 3 }) };
  };

  return {
    async create(template?: string): Promise<TestDatabase> {
      const database = await createDatabase(template);
      open.push(database);
      return database;
    },
    /** Postgres copies a template only while nothing is connected to it, so this closes it. */
    async legacyTemplate(
      fill: (sql: SQL) => Promise<void>,
      schema: readonly string[] = LEGACY_SCHEMA,
    ): Promise<string> {
      const { name, sql } = await createDatabase();
      templates.push(name);
      try {
        await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`;
        for (const statement of schema) await sql.unsafe(statement);
        await fill(sql);
      } finally {
        await sql.close();
      }
      return name;
    },
  };
}

export async function snapshot(sql: SQL) {
  const tables = await sql<{ name: string }[]>`
    SELECT table_name AS name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name
  `;
  const rows: Record<string, string> = {};
  for (const { name } of tables) {
    const [table] = await sql.unsafe<[{ rows: string }]>(
      `SELECT coalesce(string_agg(t::text, E'\\n' ORDER BY t::text), '') AS rows FROM "${name}" t`,
    );
    rows[name] = table.rows;
  }
  const columns = await sql`
    SELECT table_name, column_name, data_type, is_nullable, column_default
    FROM information_schema.columns WHERE table_schema = 'public'
    ORDER BY table_name, column_name
  `;
  const indexes = await sql`
    SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY indexname
  `;
  const constraints = await sql`
    SELECT conrelid::regclass::text AS table_name, conname, pg_get_constraintdef(oid) AS definition
    FROM pg_constraint WHERE connamespace = 'public'::regnamespace
    ORDER BY table_name, conname
  `;
  const triggers = await sql`
    SELECT c.relname AS table_name, t.tgname, pg_get_triggerdef(t.oid) AS definition
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relnamespace = 'public'::regnamespace AND NOT t.tgisinternal
    ORDER BY table_name, t.tgname
  `;
  const functions = await sql`
    SELECT p.proname, pg_get_functiondef(p.oid) AS definition FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND NOT EXISTS
      (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
    ORDER BY p.proname
  `;
  return {
    rows,
    columns: [...columns],
    indexes: [...indexes],
    constraints: [...constraints],
    triggers: [...triggers],
    functions: [...functions],
  };
}
