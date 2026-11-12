import { expect, test } from "bun:test";
import { snapshot, testDatabases } from "./database";

const databases = testDatabases();

test("a snapshot leaves out null columns but keeps nulls inside a jsonb value", async () => {
  const { sql } = await databases.create();
  await sql`CREATE TABLE t (id text PRIMARY KEY, note text, body jsonb)`;
  await sql`INSERT INTO t VALUES ('a', NULL, '{"kept": null, "list": [null]}')`;

  const { rows } = await snapshot(sql);

  expect(rows.t).toBe('{"id": "a", "body": {"kept": null, "list": [null]}}');
});
