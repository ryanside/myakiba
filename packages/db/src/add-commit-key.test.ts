import { expect, test } from "bun:test";
import type { SQL } from "bun";
import { testDatabases } from "../test/database";
import { APP_SCHEMA, PUSH_TIMEOUT, REPEATED_ON_EVERY_PUSH, pushSchema } from "../test/push";

const databases = testDatabases();

const COMMIT_ID = "7d3b9a52-1c4e-4f8a-9b6d-2e5f0a8c1d37";

const DROP_OLD_KEY = 'ALTER TABLE "add_commit" DROP CONSTRAINT "add_commit_user_id_commit_id_pk"';
const CREATE_INDEX =
  'CREATE UNIQUE INDEX "add_commit_user_id_commit_id_idx" ON "add_commit" USING btree ("user_id","commit_id")';

// drizzle-kit 0.31.10 reads a primary key's columns with this query, which has no ORDER BY.
// It filters the rows itself, because a WHERE on constraint_type changes the plan.
async function keyColumnsAsPushReadsThem(sql: SQL) {
  const rows = await sql<{ column_name: string; constraint_type: string }[]>`
    SELECT c.column_name, c.data_type, constraint_type, constraint_name, constraint_schema
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage AS ccu USING (constraint_schema, constraint_name)
    JOIN information_schema.columns AS c ON c.table_schema = tc.constraint_schema
      AND tc.table_name = c.table_name AND ccu.column_name = c.column_name
    WHERE tc.table_name = 'add_commit' and constraint_schema = 'public'
  `;
  return rows.filter((row) => row.constraint_type === "PRIMARY KEY").map((row) => row.column_name);
}

const REVERSED = ["commit_id", "user_id"];

// The read comes back reversed only on some catalogs. On a fresh Postgres 18.6 cluster it reads
// the key in order until the cluster's OID counter passes about 24,600, with the composite key in
// `unrelated` below; Postgres 17 has not been seen to reverse it. So the template is built again,
// further along the counter each time, until the read reverses.
const OIDS_PER_ATTEMPT = 8192;
const ATTEMPTS = 6;

/** Production before this key change, on a catalog where drizzle reads its key as commit_id, user_id. */
async function productionTemplateWithReversedKeyRead(): Promise<string | undefined> {
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const read = { columns: [] as string[] };
    const template = await databases.legacyTemplate(async (sql) => {
      await sql`DROP INDEX IF EXISTS add_commit_user_id_commit_id_idx`;
      await sql`
        ALTER TABLE add_commit DROP CONSTRAINT IF EXISTS add_commit_user_id_commit_id_pk,
          ADD CONSTRAINT add_commit_user_id_commit_id_pk PRIMARY KEY (user_id, commit_id)
      `;
      await sql`CREATE SCHEMA unrelated`;
      await sql`CREATE TABLE unrelated.pair (a int, b int, PRIMARY KEY (a, b))`;
      await sql`
        INSERT INTO "user" (id, name, email, username) VALUES ('u1', 'U', 'u@example.com', 'u')
      `;
      await sql`
        INSERT INTO add_commit (user_id, commit_id, body_hash) VALUES ('u1', ${COMMIT_ID}, 'first')
      `;
      read.columns = await keyColumnsAsPushReadsThem(sql);
      if (!Bun.deepEquals(read.columns, REVERSED)) {
        // Each large object takes one OID, so this moves the counter without growing the catalog.
        await sql`SELECT lo_unlink(lo_create(0)) FROM generate_series(1, ${OIDS_PER_ATTEMPT}::int)`;
      }
    });
    if (Bun.deepEquals(read.columns, REVERSED)) return template;
  }
  console.warn(
    `Skipping add_commit key tests: drizzle-kit's key read never came back reversed in ${ATTEMPTS} templates ${OIDS_PER_ATTEMPT} OIDs apart on this server, so it cannot show the old key being rebuilt.`,
  );
}

const template = await productionTemplateWithReversedKeyRead();

async function productionWithReversedKeyRead() {
  if (template === undefined) {
    throw new Error("These tests are skipped when no template reads reversed");
  }
  const database = await databases.create(template);
  expect(await keyColumnsAsPushReadsThem(database.sql)).toEqual(REVERSED);
  return database;
}

const commitRecords = (sql: SQL) =>
  sql`SELECT user_id, commit_id::text, body_hash FROM add_commit ORDER BY commit_id`;

async function expectCommitUpsert(sql: SQL) {
  await sql`
    INSERT INTO add_commit (user_id, commit_id, body_hash) VALUES ('u1', ${COMMIT_ID}, 'again')
    ON CONFLICT (user_id, commit_id) DO UPDATE SET body_hash = excluded.body_hash
  `;
  expect(await commitRecords(sql)).toEqual([
    { user_id: "u1", commit_id: COMMIT_ID, body_hash: "again" },
  ]);
}

test.skipIf(template === undefined)(
  "push moves add_commit to a key it reads back the same, so a second push leaves it alone",
  async () => {
    const { sql, url } = await productionWithReversedKeyRead();
    const before = await commitRecords(sql);

    expect(await pushSchema(url, APP_SCHEMA)).toMatchObject({
      applied: true,
      statements: [DROP_OLD_KEY, ...REPEATED_ON_EVERY_PUSH, CREATE_INDEX],
    });
    expect(await commitRecords(sql)).toEqual(before);
    expect(await pushSchema(url, APP_SCHEMA)).toMatchObject({
      applied: true,
      statements: REPEATED_ON_EVERY_PUSH,
    });
    await expectCommitUpsert(sql);
  },
  PUSH_TIMEOUT,
);

test.skipIf(template === undefined)(
  "with the unique index built first, push only drops the old key, so commits always have one",
  async () => {
    const { sql, url } = await productionWithReversedKeyRead();
    await sql`
      CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "add_commit_user_id_commit_id_idx"
      ON "add_commit" USING btree ("user_id", "commit_id")
    `;

    expect(await pushSchema(url, APP_SCHEMA)).toMatchObject({
      applied: true,
      statements: [DROP_OLD_KEY, ...REPEATED_ON_EVERY_PUSH],
    });
    expect(await pushSchema(url, APP_SCHEMA)).toMatchObject({
      applied: true,
      statements: REPEATED_ON_EVERY_PUSH,
    });
    await expectCommitUpsert(sql);
  },
  PUSH_TIMEOUT,
);
