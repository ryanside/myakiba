import { describe, expect, spyOn, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { createRequestLogger, initLogger } from "evlog";
import { user } from "@myakiba/db/schema/auth";
import type { ReadTx } from "@myakiba/db/tx";
import { createTestDatabase } from "../../test/database";

initLogger({ enabled: false });

const db = await createTestDatabase();
const { command, fail, failAfterCommit, ok, prepared, proceed, query, run, serve } =
  await import("./kernel");
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

const transactionIds = (kind: "command" | "query" | "snapshot") => {
  const body = async (scope: { readonly tx: ReadTx }) => {
    const read = () =>
      scope.tx.select({ id: sql<string>`txid_current()::text` }).from(sql`(select 1) as one`);
    const [first] = await read();
    const [second] = await read();
    return ok([first?.id, second?.id]);
  };
  const readConfig = { action: `test.${kind}`, failure: "Failed to read" };
  if (kind === "command") return command(readConfig, body);
  return query(kind === "snapshot" ? { ...readConfig, snapshot: true } : readConfig, body);
};

test.each(["command", "snapshot"] as const)(
  "every statement of one %s shares a transaction, and each call gets its own",
  async (kind) => {
    const one = await run(viewer, transactionIds(kind), undefined, log);
    const two = await run(viewer, transactionIds(kind), undefined, log);
    if (!one.ok || !two.ok) throw new Error("the operation failed");

    expect(one.value[0]).toBe(one.value[1]);
    expect(two.value[0]).not.toBe(one.value[0]);
  },
);

test("a query without a snapshot reads from the pool, one autocommit statement at a time", async () => {
  const outcome = await run(viewer, transactionIds("query"), undefined, log);
  if (!outcome.ok) throw new Error("the query failed");

  expect(outcome.value[0]).not.toBe(outcome.value[1]);
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

describe("a command's before step", () => {
  const currentTxid = async (scope: { readonly tx: ReadTx }) => {
    const [row] = await scope.tx
      .select({ id: sql<string>`txid_current()::text` })
      .from(sql`(select 1) as one`);
    return row?.id;
  };
  const openTransactions = async () => {
    const [open] = await db.execute<{ count: number }>(
      "SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = current_database() AND backend_type = 'client backend' AND pid <> pg_backend_pid() AND (state LIKE 'idle in transaction%' OR xact_start IS NOT NULL)",
    );
    return open?.count;
  };
  const writeAfter = (answer: "proceed" | "ok" | "fail" | "throw") => {
    let bodyRuns = 0;
    const op = command(
      {
        ...config,
        before: async (scope, input: { readonly id: string }) => {
          const reads = [await currentTxid(scope), await currentTxid(scope)];
          const open = await openTransactions();
          if (answer === "ok") return ok({ reads, open });
          if (answer === "fail") return fail("bad_request", "Not this one");
          if (answer === "throw") throw new Error("injected failure in before");
          return proceed({ id: input.id, reads, open });
        },
      },
      async (scope, input) => {
        bodyRuns += 1;
        await scope.tx.insert(user).values({
          id: input.id,
          name: input.id,
          email: `${input.id}@example.com`,
          username: input.id,
        });
        return ok({ reads: input.reads, open: input.open });
      },
    );
    return { op, bodyRuns: () => bodyRuns };
  };

  test("reads from the pool before the transaction, then hands its value to the body", async () => {
    const { op } = writeAfter("proceed");

    const outcome = await run(viewer, op, { id: "after-before" }, log);
    if (!outcome.ok) throw new Error("the command failed");

    expect(outcome.value.open).toBe(0);
    expect(outcome.value.reads[0]).not.toBe(outcome.value.reads[1]);
    expect(await userExists("after-before")).toBe(true);
  });

  test.each(["ok", "fail"] as const)(
    "an outcome (%s) answers without running the body",
    async (answer) => {
      const { op, bodyRuns } = writeAfter(answer);

      const outcome = await run(viewer, op, { id: `answered-${answer}` }, log);

      expect(outcome.ok).toBe(answer === "ok");
      expect(bodyRuns()).toBe(0);
      expect(await userExists(`answered-${answer}`)).toBe(false);
    },
  );

  test("a throw answers a logged 500 without running the body", async () => {
    const { op, bodyRuns } = writeAfter("throw");
    const caller = { viewer, log: createRequestLogger() };
    const logged = spyOn(caller.log, "error");

    expect(await serve(caller, op, { id: "before-threw" })).toMatchObject({
      code: 500,
      response: "Failed to write",
    });
    expect(logged).toHaveBeenCalledWith(new Error("injected failure in before"), {
      step: "test.write",
    });
    expect(bodyRuns()).toBe(0);
    expect(await userExists("before-threw")).toBe(false);
  });
});

describe("a prepared read", () => {
  let builds = 0;
  const createdAt = prepared("test_user_created_at", (pool) => {
    builds += 1;
    return pool
      .select({ id: user.id, createdAt: user.createdAt })
      .from(user)
      .where(eq(user.id, sql.placeholder("id")));
  });
  const readCreatedAt = query(
    { action: "test.prepared", failure: "Failed to read" },
    async (scope, input: { readonly id: string }) => {
      const [found] = await scope.read(createdAt, { id: input.id });
      return found ? ok(found) : fail("not_found", "No such user");
    },
  );

  test("builds its SQL once, binds each call's values and keeps drizzle's column mapping", async () => {
    await run(viewer, writeThen("ok"), { id: "prepared-1" }, log);
    await run(viewer, writeThen("ok"), { id: "prepared-2" }, log);

    const one = await run(viewer, readCreatedAt, { id: "prepared-1" }, log);
    const two = await run(viewer, readCreatedAt, { id: "prepared-2" }, log);
    if (!one.ok || !two.ok) throw new Error("the prepared read failed");

    expect(builds).toBe(1);
    expect([one.value.id, two.value.id]).toEqual(["prepared-1", "prepared-2"]);
    expect(one.value.createdAt).toBeInstanceOf(Date);
  });

  test("only a query without a snapshot can run one, because it reads from the pool", () => {
    query({ action: "test.snapshot", failure: "Failed to read", snapshot: true }, async (scope) => {
      // @ts-expect-error a snapshot query reads one transaction
      await scope.read(createdAt, { id: "x" });
      return ok(1);
    });
    command(config, async (scope) => {
      // @ts-expect-error a command's reads must see its own writes
      await scope.read(createdAt, { id: "x" });
      return ok(1);
    });
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

  test("a bad request answers 400 with its message", async () => {
    const rejects = query({ action: "test.bad_request", failure: "Failed to read" }, async () =>
      fail("bad_request", "Pick another section"),
    );
    expect(await serve(caller, rejects, {})).toMatchObject({
      code: 400,
      response: "Pick another section",
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

describe("command commit hooks and recovery", () => {
  test("effects observe committed rows and disappear on fail or throw", async () => {
    const observed: string[] = [];
    const operation = (ending: "ok" | "fail" | "throw") =>
      command(config, async (scope, id: string) => {
        await scope.tx
          .insert(user)
          .values({ id, name: id, email: `${id}@example.com`, username: id });
        scope.afterCommit(async (committed) => {
          const rows = await committed.tx.select({ id: user.id }).from(user).where(eq(user.id, id));
          for (const row of rows) observed.push(row.id);
        });
        if (ending === "fail") return fail("bad_request", "Rejected");
        if (ending === "throw") throw new Error("rolled back");
        return ok(id);
      });
    await run(viewer, operation("ok"), "effect-committed", log);
    await run(viewer, operation("fail"), "effect-failed", log);
    await expect(run(viewer, operation("throw"), "effect-thrown", log)).rejects.toThrow(
      "rolled back",
    );
    expect(observed).toEqual(["effect-committed"]);
    expect(await userExists("effect-failed")).toBe(false);
    expect(await userExists("effect-thrown")).toBe(false);
  });

  test("a retry rolls back its writes and effects and retains the before handoff", async () => {
    let preparations = 0;
    let attempts = 0;
    const effects: number[] = [];
    const operation = command(
      {
        ...config,
        before: async (_scope, id: string) => {
          preparations += 1;
          return proceed(id);
        },
        retry: (error, attempt) =>
          error instanceof Error && error.message === "retry" && attempt < 3,
      },
      async (scope, id) => {
        attempts += 1;
        const attempt = attempts;
        await scope.tx
          .insert(user)
          .values({ id, name: id, email: `${id}@example.com`, username: id });
        scope.afterCommit(async () => {
          effects.push(attempt);
        });
        if (attempt < 3) throw new Error("retry");
        return ok(id);
      },
    );
    expect(await run(viewer, operation, "retried-write", log)).toEqual({
      ok: true,
      value: "retried-write",
    });
    expect({ preparations, attempts, effects }).toEqual({
      preparations: 1,
      attempts: 3,
      effects: [3],
    });
  });

  test("recovery runs after rollback and commits a fresh operation", async () => {
    let attempts = 0;
    const original = new Error("original write failed");
    const operation = command(
      {
        ...config,
        retry: (_error, attempt) => attempt < 2,
        recover: async (scope, id: string, error) => {
          expect(error).toBe(original);
          expect(await userExists(id)).toBe(false);
          return scope.execute(writeThen("ok"), { id });
        },
      },
      async (scope, id: string) => {
        attempts += 1;
        await scope.tx
          .insert(user)
          .values({ id, name: id, email: `${id}@example.com`, username: id });
        throw original;
      },
    );
    expect(await run(viewer, operation, "recovered-write", log)).toEqual({
      ok: true,
      value: "written",
    });
    expect(attempts).toBe(2);
    expect(await userExists("recovered-write")).toBe(true);
  });

  test("recovery also handles preparation failures, and cannot run for committed effect failures", async () => {
    let recoveries = 0;
    const recover = async () => {
      recoveries += 1;
      return ok("recovered");
    };
    const beforeThrows = command(
      {
        ...config,
        before: async () => {
          throw new Error("preparation");
        },
        recover,
      },
      async () => ok("unused"),
    );
    expect(await run(viewer, beforeThrows, undefined, log)).toEqual({
      ok: true,
      value: "recovered",
    });
    const effectThrows = command({ ...config, recover }, async (scope) => {
      scope.afterCommit(async () => {
        throw new Error("effect");
      });
      return ok("committed");
    });
    expect(await run(viewer, effectThrows, undefined, log)).toEqual({
      ok: true,
      value: "committed",
    });
    expect(recoveries).toBe(1);
  });
});

test("failed commit effects keep the committed response and run later effects", async () => {
  initLogger({ enabled: true });
  const caller = { viewer, log: createRequestLogger() };
  initLogger({ enabled: false });
  const original = new Error("original recovered error");
  caller.log.error(original);
  const logged = spyOn(caller.log, "error");
  const warnings = spyOn(caller.log, "warn");
  const observed: string[] = [];
  const operation = command(config, async (scope, id: string) => {
    await scope.tx.insert(user).values({ id, name: id, email: `${id}@example.com`, username: id });
    for (const message of ["first effect failed", "second effect failed"]) {
      scope.afterCommit(async () => {
        throw new Error(message);
      });
    }
    scope.afterCommit(async (committed) => {
      const rows = await committed.tx.select({ id: user.id }).from(user).where(eq(user.id, id));
      for (const row of rows) observed.push(row.id);
    });
    return ok("committed");
  });

  expect(await serve(caller, operation, "failed-effects")).toBe("committed");
  expect(await userExists("failed-effects")).toBe(true);
  expect(observed).toEqual(["failed-effects"]);
  expect(warnings).toHaveBeenCalledTimes(2);
  expect(logged).not.toHaveBeenCalled();
  expect(caller.log.getContext()).toMatchObject({
    error: { message: original.message },
    outcome: "success",
    afterCommitErrors: [{ message: "first effect failed" }, { message: "second effect failed" }],
  });
});

test("a committed failure saves its writes and effects before answering its status", async () => {
  let effects = 0;
  let retries = 0;
  let recoveries = 0;
  const operation = command(
    {
      ...config,
      retry: (_error, attempt) => {
        retries += 1;
        return attempt < 2;
      },
      recover: async () => {
        recoveries += 1;
        return ok("unused");
      },
    },
    async (scope, id: string) => {
      await scope.tx
        .insert(user)
        .values({ id, name: id, email: `${id}@example.com`, username: id });
      scope.afterCommit(async () => {
        effects += 1;
      });
      return failAfterCommit("conflict", "The saved lease has expired");
    },
  );

  expect(await run(viewer, operation, "committed-failure", log)).toEqual({
    ok: false,
    category: "conflict",
    message: "The saved lease has expired",
  });
  expect(await serve({ viewer, log }, operation, "served-committed-failure")).toMatchObject({
    code: 409,
    response: "The saved lease has expired",
  });
  expect(await userExists("committed-failure")).toBe(true);
  expect(await userExists("served-committed-failure")).toBe(true);
  expect({ effects, retries, recoveries }).toEqual({ effects: 2, retries: 0, recoveries: 0 });
});
