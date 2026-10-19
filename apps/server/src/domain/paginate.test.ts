import { afterEach, describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { sql } from "drizzle-orm";
import type { Query } from "drizzle-orm";
import { integer, pgTable, text } from "drizzle-orm/pg-core";
import type { PgSession } from "drizzle-orm/pg-core";
import { createRequestLogger, initLogger } from "evlog";
import { createTestDatabase } from "../../test/database";

initLogger({ enabled: false });

const db = await createTestDatabase();
const { command, ok, paginateBy, run } = await import("./kernel");
const { Viewer } = await import("./viewer");

const writer = new SQL({ url: process.env.DATABASE_URL, max: 1 });
await writer`create table paged (id integer primary key, name text not null)`;
const paged = pgTable("paged", { id: integer().primaryKey(), name: text().notNull() });

// Runs a committed write on another connection after the nth statement the kernel reads,
// in the pool or in any transaction, to place it between two of paginateBy's statements.
type Prepared = { execute: <T>(...values: never[]) => Promise<T> };
type Prepare = (this: PgSession, query: Query, ...rest: never[]) => Prepared;
const sessions: { prepareQuery: Prepare } = Object.getPrototypeOf(db._.session);
const prepareQuery = sessions.prepareQuery;
let statements = 0;
let afterStatement: (statement: number) => Promise<void> = async () => {};
sessions.prepareQuery = function (query, ...rest) {
  const prepared = prepareQuery.call(this, query, ...rest);
  const execute = prepared.execute.bind(prepared);
  prepared.execute = async <T>(...values: never[]): Promise<T> => {
    const result = await execute<T>(...values);
    if (/^(?:select|with) /iu.test(query.sql)) await afterStatement(++statements);
    return result;
  };
  return prepared;
};

const reset = async (rows: readonly (readonly [number, string])[]) => {
  await writer`truncate paged`;
  for (const [id, name] of rows) await writer`insert into paged values (${id}, ${name})`;
  statements = 0;
};

afterEach(() => {
  afterStatement = async () => {};
});

describe("a DISTINCT source", () => {
  const page = (offset: number) =>
    paginateBy(
      { tx: db },
      { limit: 1, offset },
      {
        select: { name: paged.name },
        rows: (fields) => db.selectDistinct(fields).from(paged).$dynamic(),
        orderBy: [[paged.name, "asc"]],
      },
    );

  test("counts its distinct rows on the first, last and past-end pages", async () => {
    await reset([
      [1, "a"],
      [2, "a"],
      [3, "b"],
    ]);
    const pages = await Promise.all([0, 1, 2, 100].map(page));
    expect(pages).toEqual([
      { items: [{ name: "a" }], totalCount: 2 },
      { items: [{ name: "b" }], totalCount: 2 },
      { items: [], totalCount: 2 },
      { items: [], totalCount: 2 },
    ]);
  });

  test("refuses a total other than the count", async () => {
    await reset([[1, "a"]]);
    const totalled = paginateBy(
      { tx: db },
      { limit: 1, offset: 0 },
      {
        select: { name: paged.name, id: paged.id },
        rows: (fields) => db.selectDistinct(fields).from(paged).$dynamic(),
        orderBy: [[paged.id, "asc"]],
        totals: { ids: { sum: paged.id } },
      },
    );
    expect(totalled).rejects.toThrow("cannot total its columns");
  });
});

describe("a page past the end, read while rows arrive and leave", () => {
  const source = (tx: Parameters<typeof paginateBy>[0]["tx"]) => ({
    select: { id: paged.id },
    rows: (fields: { readonly id: typeof paged.id }) => tx.select(fields).from(paged).$dynamic(),
    orderBy: [[paged.id, "asc"]] as const,
  });
  // One row, then a second arrives after the empty page, then every row leaves after the
  // next two reads: the page and its totals must still describe one moment.
  const arriveThenLeave = async (statement: number) => {
    if (statement === 1) await writer`insert into paged values (2, 'b')`;
    if (statement === 3) await writer`delete from paged`;
  };
  const agrees = (page: { readonly items: readonly unknown[]; readonly totalCount: number }) =>
    expect(page.items.length).toBe(Math.min(1, Math.max(page.totalCount - 1, 0)));

  test("in a READ COMMITTED transaction", async () => {
    await reset([[1, "a"]]);
    afterStatement = arriveThenLeave;
    const page = await db.transaction(async (tx) => {
      const [isolation] = await tx.execute(sql`show transaction_isolation`);
      expect(isolation).toEqual({ transaction_isolation: "read committed" });
      statements = 0;
      return paginateBy({ tx }, { limit: 1, offset: 1 }, source(tx));
    });
    agrees(page);
  });

  test("in a command's scope", async () => {
    await reset([[1, "a"]]);
    afterStatement = arriveThenLeave;
    const op = command({ action: "test.page", failure: "Failed to page" }, async (scope) =>
      ok(await paginateBy(scope, { limit: 1, offset: 1 }, source(scope.tx))),
    );
    const outcome = await run(
      Viewer.fromSession({ user: { id: "viewer-1" } }),
      op,
      undefined,
      createRequestLogger(),
    );
    if (!outcome.ok) throw new Error("the command failed");
    agrees(outcome.value);
  });

  test("on the pool, when the second row stays, the re-read returns the page it reaches", async () => {
    await reset([[1, "a"]]);
    afterStatement = async (statement) => {
      if (statement === 1) await writer`insert into paged values (2, 'b')`;
    };
    expect(await paginateBy({ tx: db }, { limit: 1, offset: 1 }, source(db))).toEqual({
      items: [{ id: 2 }],
      totalCount: 2,
    });
  });
});
