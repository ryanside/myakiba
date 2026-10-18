import { describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { createRequestLogger, initLogger } from "evlog";
import { user } from "@myakiba/db/schema/auth";
import { createTestDatabase } from "../../test/database";

initLogger({ enabled: false });

const db = await createTestDatabase();
const { command, fail, ok, query, run, serve } = await import("./kernel");
const { Viewer } = await import("./viewer");

const viewer = Viewer.fromSession({ user: { id: "viewer-1" } });
const log = createRequestLogger();
const config = { action: "test.write", failure: "Failed to write" };

const writeThen = (ending: "ok" | "fail" | "throw") =>
  command(config, async (scope, input: { readonly id: string }) => {
    await scope.tx.insert(user).values({
      id: input.id,
      name: input.id,
      email: `${input.id}@example.com`,
      username: input.id,
    });
    if (ending === "fail") return fail("not_found", "Nothing to write");
    if (ending === "throw") throw new Error("injected failure after the write");
    return ok("written");
  });

const readUser = query(
  { action: "test.read", failure: "Failed to read" },
  async (scope, input: { readonly id: string }) => {
    const [found] = await scope.tx.select({ id: user.id }).from(user).where(eq(user.id, input.id));
    return found ? ok(found) : fail("not_found", "No such user");
  },
);

const userExists = async (id: string) => {
  const found = await db.select({ id: user.id }).from(user).where(eq(user.id, id));
  return found.length === 1;
};

describe("an operation runs in one transaction", () => {
  test("a command's writes commit when it returns ok", async () => {
    expect(await run(viewer, writeThen("ok"), { id: "committed" }, log)).toEqual({
      ok: true,
      value: "written",
    });
    expect(await userExists("committed")).toBe(true);
  });

  test("a failure rolls back the writes made before it", async () => {
    expect(await run(viewer, writeThen("fail"), { id: "failed" }, log)).toEqual({
      ok: false,
      category: "not_found",
      message: "Nothing to write",
    });
    expect(await userExists("failed")).toBe(false);
  });

  test("a throw rolls back the writes and reaches the caller", async () => {
    await expect(run(viewer, writeThen("throw"), { id: "thrown" }, log)).rejects.toThrow(
      "injected failure after the write",
    );
    expect(await userExists("thrown")).toBe(false);
  });

  test("a query sees committed rows", async () => {
    await run(viewer, writeThen("ok"), { id: "visible" }, log);

    expect(await run(viewer, readUser, { id: "visible" }, log)).toEqual({
      ok: true,
      value: { id: "visible" },
    });
  });
});

test("every statement of one operation shares a transaction, and each operation gets its own", async () => {
  const transactionIds = query(
    { action: "test.transaction", failure: "Failed to read" },
    async (scope) => {
      const read = () =>
        scope.tx.select({ id: sql<string>`txid_current()::text` }).from(sql`(select 1) as one`);
      const [first] = await read();
      const [second] = await read();
      return ok([first?.id, second?.id]);
    },
  );

  const one = await run(viewer, transactionIds, undefined, log);
  const two = await run(viewer, transactionIds, undefined, log);
  if (!one.ok || !two.ok) throw new Error("the query failed");

  expect(one.value[0]).toBe(one.value[1]);
  expect(two.value[0]).not.toBe(one.value[0]);
});

test("a snapshot query reads one repeatable-read, read-only snapshot", async () => {
  const settings = (snapshot?: true) =>
    query({ action: "test.snapshot", failure: "Failed to read", snapshot }, async (scope) => {
      const [row] = await scope.tx
        .select({
          isolation: sql<string>`current_setting('transaction_isolation')`,
          readOnly: sql<string>`current_setting('transaction_read_only')`,
        })
        .from(sql`(select 1) as one`);
      return ok(row);
    });

  expect(await run(viewer, settings(true), undefined, log)).toEqual({
    ok: true,
    value: { isolation: "repeatable read", readOnly: "on" },
  });
  expect(await run(viewer, settings(), undefined, log)).toEqual({
    ok: true,
    value: { isolation: "read committed", readOnly: "off" },
  });
});

describe("serve answers with the outcome", () => {
  const caller = { viewer, log: createRequestLogger() };

  test("ok answers the value", async () => {
    expect(await serve(caller, writeThen("ok"), { id: "served" })).toBe("written");
  });

  test("a failure answers its status and message", async () => {
    expect(await serve(caller, writeThen("fail"), { id: "served-fail" })).toMatchObject({
      code: 404,
      response: "Nothing to write",
    });
  });

  test("a throw answers 500 with the operation's failure", async () => {
    expect(await serve(caller, writeThen("throw"), { id: "served-throw" })).toMatchObject({
      code: 500,
      response: "Failed to write",
    });
    expect(await userExists("served-throw")).toBe(false);
  });
});
