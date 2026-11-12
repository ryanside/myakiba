import { describe, expect, spyOn, test } from "bun:test";
import { Panic, Result, panic } from "better-result";
import { eq, sql } from "drizzle-orm";
import { createRequestLogger, initLogger } from "evlog";
import { user } from "@myakiba/db/schema/auth";
import type { ReadTx, Tx } from "@myakiba/db/tx";
import { createTestDatabase } from "../../test/database";

initLogger({ enabled: false });

const db = await createTestDatabase();
const { command, prepared, query, run, serve } = await import("./kernel");
const { Failure } = await import("./failure");
const { tagged } = await import("./tagged");
const { Viewer } = await import("./viewer");

const NothingToWrite = Failure("NothingToWrite", "not_found", "Nothing to write");
const NoSuchUser = Failure("NoSuchUser", "not_found", "No such user");
const NotThisOne = Failure("NotThisOne", "bad_request", "Not this one");
const PickAnotherSection = Failure("PickAnotherSection", "bad_request", "Pick another section");
const Contended = tagged("Contended");

const viewer = Viewer.fromSession({ user: { id: "viewer-1" } });
const log = createRequestLogger();
const config = { action: "test.write", failure: "Failed to write" };

const newUser = (id: string) => ({ id, name: id, email: `${id}@example.com`, username: id });

const writeThen = (ending: "ok" | "fail" | "throw") =>
  command(config, async (scope, input: { readonly id: string }) => {
    await scope.tx.insert(user).values(newUser(input.id));
    if (ending === "fail") return Result.err(new NothingToWrite());
    if (ending === "throw") throw new Error("injected failure after the write");
    return Result.ok("written" as const);
  });

const readUser = query(
  { action: "test.read", failure: "Failed to read" },
  async (scope, input: { readonly id: string }) => {
    const [found] = await scope.tx.select({ id: user.id }).from(user).where(eq(user.id, input.id));
    return found ? Result.ok(found) : Result.err(new NoSuchUser());
  },
);

async function valueOf<T, E>(answer: Promise<Result<T, E>>): Promise<T> {
  const outcome = await answer;
  return outcome.unwrap();
}

const rejected = async (error: Error): Promise<Result<number, never>> => {
  throw error;
};
/** A lookup that finds no row, for a body whose invariant says one exists. */
const missingRow = async (): Promise<Result<null, never>> => Result.ok(null);

const userExists = async (id: string) => {
  const found = await db.select({ id: user.id }).from(user).where(eq(user.id, id));
  return found.length === 1;
};

describe("an operation runs in one transaction", () => {
  test("a command's writes commit when it returns ok", async () => {
    expect(await valueOf(run(viewer, writeThen("ok"), { id: "committed" }, log))).toBe("written");
    expect(await userExists("committed")).toBe(true);
  });

  test("a failure rolls back the writes made before it", async () => {
    const outcome = await run(viewer, writeThen("fail"), { id: "failed" }, log);

    expect(outcome.isErr() && outcome.error).toBeInstanceOf(NothingToWrite);
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

    expect(await valueOf(run(viewer, readUser, { id: "visible" }, log))).toEqual({
      id: "visible",
    });
  });
});

const transactionIds = (kind: "command" | "query" | "snapshot") => {
  const body = async (scope: { readonly tx: ReadTx }) => {
    const read = () =>
      scope.tx.select({ id: sql<string>`txid_current()::text` }).from(sql`(select 1) as one`);
    const [first] = await read();
    const [second] = await read();
    return Result.ok([first?.id, second?.id]);
  };
  const readConfig = { action: `test.${kind}`, failure: "Failed to read" };
  if (kind === "command") return command(readConfig, body);
  return query(kind === "snapshot" ? { ...readConfig, snapshot: true } : readConfig, body);
};

test.each(["command", "snapshot"] as const)(
  "every statement of one %s shares a transaction, and each call gets its own",
  async (kind) => {
    const one = await valueOf(run(viewer, transactionIds(kind), undefined, log));
    const two = await valueOf(run(viewer, transactionIds(kind), undefined, log));

    expect(one[0]).toBe(one[1]);
    expect(two[0]).not.toBe(one[0]);
  },
);

test("a query without a snapshot reads from the pool, one autocommit statement at a time", async () => {
  const ids = await valueOf(run(viewer, transactionIds("query"), undefined, log));

  expect(ids[0]).not.toBe(ids[1]);
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
      return Result.ok(row);
    });

  expect(await valueOf(run(viewer, settings(true), undefined, log))).toEqual({
    isolation: "repeatable read",
    readOnly: "on",
  });
  expect(await valueOf(run(viewer, settings(), undefined, log))).toEqual({
    isolation: "read committed",
    readOnly: "off",
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
          if (answer === "ok") return Result.ok({ reads, open });
          if (answer === "fail") return Result.err(new NotThisOne());
          if (answer === "throw") throw new Error("injected failure in before");
          return scope.proceed({ id: input.id, reads, open });
        },
      },
      async (scope, input) => {
        bodyRuns += 1;
        await scope.tx.insert(user).values(newUser(input.id));
        return Result.ok({ reads: input.reads, open: input.open });
      },
    );
    return { op, bodyRuns: () => bodyRuns };
  };

  test("reads from the pool before the transaction, then hands its value to the body", async () => {
    const { op } = writeAfter("proceed");

    const answered = await valueOf(run(viewer, op, { id: "after-before" }, log));

    expect(answered.open).toBe(0);
    expect(answered.reads[0]).not.toBe(answered.reads[1]);
    expect(await userExists("after-before")).toBe(true);
  });

  test.each(["ok", "fail"] as const)(
    "an outcome (%s) answers without running the body",
    async (answer) => {
      const { op, bodyRuns } = writeAfter(answer);

      const outcome = await run(viewer, op, { id: `answered-${answer}` }, log);

      expect(outcome.isOk()).toBe(answer === "ok");
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

describe("a write before's commitFirst makes", () => {
  const commitFirstThen = (ending: "proceed" | "fail") =>
    command(
      {
        ...config,
        before: async (scope, input: { readonly id: string }) => {
          await scope.commitFirst((tx) => tx.insert(user).values(newUser(`${input.id}-first`)));
          if (ending === "fail") return Result.err(new NotThisOne());
          return scope.proceed(input);
        },
      },
      async (scope, input) => {
        await scope.tx.insert(user).values(newUser(input.id));
        return Result.err(new NothingToWrite());
      },
    );

  test("commits before the body, and the body's rollback leaves it", async () => {
    const outcome = await run(viewer, commitFirstThen("proceed"), { id: "kept" }, log);

    expect(outcome.isErr()).toBe(true);
    expect(await userExists("kept")).toBe(false);
    expect(await userExists("kept-first")).toBe(true);
  });

  test("stays when before itself answers a failure", async () => {
    await run(viewer, commitFirstThen("fail"), { id: "answered" }, log);

    expect(await userExists("answered-first")).toBe(true);
  });

  test("a second call in one run is a defect, and writes nothing", async () => {
    const twice = command(
      {
        ...config,
        before: async (scope, input: { readonly id: string }) => {
          await scope.commitFirst((tx) => tx.insert(user).values(newUser(`${input.id}-1`)));
          await scope.commitFirst((tx) => tx.insert(user).values(newUser(`${input.id}-2`)));
          return scope.proceed(input);
        },
      },
      async (scope, input) => {
        await scope.tx.insert(user).values(newUser(input.id));
        return Result.ok("written" as const);
      },
    );

    await expect(run(viewer, twice, { id: "twice" }, log)).rejects.toThrow(
      "commitFirst ran twice in test.write",
    );
    expect(await userExists("twice-1")).toBe(true);
    expect(await userExists("twice-2")).toBe(false);
    expect(await userExists("twice")).toBe(false);
  });

  test("a call after before returned, such as from the body, is a defect, and writes nothing", async () => {
    type Handoff = {
      readonly id: string;
      readonly commitFirst: (write: (tx: Tx) => Promise<void>) => Promise<void>;
    };
    const handedOver = command(
      {
        ...config,
        before: async (scope, input: { readonly id: string }) =>
          scope.proceed<Handoff>({ id: input.id, commitFirst: scope.commitFirst }),
      },
      async (_scope, input: Handoff) => {
        await input.commitFirst(async (tx) => {
          await tx.insert(user).values(newUser(input.id));
        });
        return Result.ok("written" as const);
      },
    );

    await expect(run(viewer, handedOver, { id: "late" }, log)).rejects.toThrow(
      "commitFirst ran after before returned in test.write",
    );
    expect(await userExists("late")).toBe(false);
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
      return found ? Result.ok(found) : Result.err(new NoSuchUser());
    },
  );

  test("builds its SQL once, binds each call's values and keeps drizzle's column mapping", async () => {
    await run(viewer, writeThen("ok"), { id: "prepared-1" }, log);
    await run(viewer, writeThen("ok"), { id: "prepared-2" }, log);

    const one = await valueOf(run(viewer, readCreatedAt, { id: "prepared-1" }, log));
    const two = await valueOf(run(viewer, readCreatedAt, { id: "prepared-2" }, log));

    expect(builds).toBe(1);
    expect([one.id, two.id]).toEqual(["prepared-1", "prepared-2"]);
    expect(one.createdAt).toBeInstanceOf(Date);
  });

  test("only a query without a snapshot can run one, because it reads from the pool", () => {
    query({ action: "test.snapshot", failure: "Failed to read", snapshot: true }, async (scope) => {
      // @ts-expect-error a snapshot query reads one transaction
      await scope.read(createdAt, { id: "x" });
      return Result.ok(1);
    });
    command(config, async (scope) => {
      // @ts-expect-error a command's reads must see its own writes
      await scope.read(createdAt, { id: "x" });
      return Result.ok(1);
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
      Result.err(new PickAnotherSection()),
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

test("several operations in a route keep its first action and log the failing step", async () => {
  initLogger({ enabled: true });
  const caller = { viewer, log: createRequestLogger() };
  initLogger({ enabled: false });
  await serve(caller, writeThen("ok"), { id: "route-action" });
  const original = new Error("later operation failed");
  const later = query({ action: "test.later", failure: "Later failed" }, async () =>
    rejected(original),
  );
  const logged = spyOn(caller.log, "error");
  expect(await serve(caller, later, {})).toMatchObject({
    code: 500,
    response: "Later failed",
  });
  expect(logged).toHaveBeenCalledWith(original, { step: "test.later" });
  expect(caller.log.getContext()).toMatchObject({
    action: "test.write",
    user: { id: viewer.userId },
    outcome: "error",
    step: "test.later",
    error: { message: original.message },
  });
});

test("a failing DB write logs the underlying Postgres message and diagnostics", async () => {
  await db.execute(sql`CREATE FUNCTION reject_logged_write() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION USING MESSAGE = 'trigger rejected the write', ERRCODE = '23514',
        DETAIL = 'the saved value is forbidden', CONSTRAINT = 'test_write_guard', TABLE = 'user';
    END;
  $$`);
  await db.execute(sql`CREATE TRIGGER reject_logged_write BEFORE INSERT ON "user"
    FOR EACH ROW EXECUTE FUNCTION reject_logged_write()`);
  initLogger({ enabled: true });
  const caller = { viewer, log: createRequestLogger() };
  initLogger({ enabled: false });
  try {
    expect(await serve(caller, writeThen("ok"), { id: "rejected-by-trigger" })).toMatchObject({
      code: 500,
      response: "Failed to write",
    });
    expect(caller.log.getContext()).toMatchObject({
      errorCauses: [
        {
          message: "trigger rejected the write",
          code: "23514",
          detail: "the saved value is forbidden",
          constraint: "test_write_guard",
          table: "user",
        },
      ],
    });
    expect(JSON.stringify(caller.log.getContext())).toContain("trigger rejected the write");
    expect(await userExists("rejected-by-trigger")).toBe(false);
  } finally {
    await db.execute(sql`DROP TRIGGER reject_logged_write ON "user"`);
    await db.execute(sql`DROP FUNCTION reject_logged_write()`);
  }
});

describe("a defect", () => {
  const defects = {
    "a panic": async (): Promise<Result<number, never>> => panic("the row must exist"),
    "a panic inside Result.gen": async () =>
      Result.gen(async function* () {
        const row = yield* Result.await(missingRow());
        return row ? Result.ok(1) : panic("the row must exist");
      }),
    "a panic with a raw cause inside Result.gen": async () =>
      Result.gen(async function* () {
        const row = yield* Result.await(missingRow());
        return row ? Result.ok(1) : panic("the row must exist", new Error("zod"));
      }),
    "an unwrapped Err": async () =>
      Result.ok(Result.err(new Contended({ message: "locked" })).unwrap("the row must exist")),
  };

  test.each(Object.entries(defects))(
    "%s rolls back and answers a logged 500",
    async (name, end) => {
      const id = `defect-${Object.keys(defects).indexOf(name)}`;
      const operation = command(config, async (scope, input: string) => {
        await scope.tx.insert(user).values(newUser(input));
        return end();
      });
      const caller = { viewer, log: createRequestLogger() };
      const logged = spyOn(caller.log, "error");

      expect(await serve(caller, operation, id)).toMatchObject({
        code: 500,
        response: "Failed to write",
      });
      expect(logged.mock.lastCall?.[0]).toBeInstanceOf(Panic);
      expect(await userExists(id)).toBe(false);
    },
  );

  test.each(["body", "before"] as const)("a Panic returned as an Err from %s", async (from) => {
    const defect = new Panic({ message: "returned instead of thrown" });
    const returned = () => Result.err(defect) as Result<number, never>;
    const operation = command(
      {
        ...config,
        before: async (scope, input: string) =>
          from === "before" ? returned() : scope.proceed(input),
      },
      async (scope) => {
        await scope.tx.insert(user).values(newUser(`returned-${from}`));
        return returned();
      },
    );

    await expect(run(viewer, operation, "go", log)).rejects.toBe(defect);
    expect(await userExists(`returned-${from}`)).toBe(false);
  });
});

describe("throwing Result callbacks are defects", () => {
  const original = new Error("unexpected callback failure");
  const throwing = () => {
    throw original;
  };
  const producers = {
    generator: () =>
      Result.gen(function* () {
        yield* Result.ok(1);
        return throwing();
      }),
    combinator: () => Result.ok(1).map(throwing),
    "tagged error match": () => new Contended({ message: "locked" }).match({ Contended: throwing }),
    "catch handler": () => Result.try({ try: throwing, catch: throwing }),
  };
  test.each(Object.entries(producers))(
    "%s reaches the caller as a Panic and rolls back",
    async (_name, produce) => {
      const operation = command(config, async (scope) => {
        await scope.tx.insert(user).values(newUser("callback-defect"));
        produce();
        return Result.ok(1);
      });
      await expect(run(viewer, operation, undefined, log)).rejects.toBeInstanceOf(Panic);
      expect(await userExists("callback-defect")).toBe(false);
    },
  );
});

describe("an operational error the operation lists answers the 500 a throw answers", () => {
  class Unreachable extends tagged("Unreachable")<{
    readonly cause: unknown;
    readonly message: string;
  }> {}
  const original = new Error("Connection is closed.");
  const outage = new Unreachable({ cause: original, message: "Redis did not answer" });
  const readConfig = { action: "test.outage", failure: "Failed to read" };
  const reads = {
    thrown: query(readConfig, async () => rejected(original)),
    listed: query({ ...readConfig, operational: [Unreachable] }, async () => Result.err(outage)),
  };

  test("with the same status and body, logging the tagged error and its cause", async () => {
    initLogger({ enabled: true });
    const caller = { viewer, log: createRequestLogger() };
    initLogger({ enabled: false });
    const logged = spyOn(caller.log, "error");

    const answered = await serve(caller, reads.listed, {});

    expect<unknown>(answered).toEqual(await serve({ viewer, log }, reads.thrown, {}));
    expect(answered).toMatchObject({ code: 500, response: "Failed to read" });
    expect(logged).toHaveBeenCalledWith(outage, { step: "test.outage" });
    expect(caller.log.getContext()).toMatchObject({
      outcome: "error",
      step: "test.outage",
      error: { message: "Redis did not answer", cause: original },
    });
  });

  test("after its command rolls back", async () => {
    const operation = command(
      { ...config, operational: [Unreachable] },
      async (scope, id: string) => {
        await scope.tx.insert(user).values(newUser(id));
        return Result.err(outage);
      },
    );

    await expect(run(viewer, operation, "operational-write", log)).rejects.toBe(outage);
    expect(await userExists("operational-write")).toBe(false);
  });

  test("and an internal Err the operation does not list stays a defect", async () => {
    const Unlisted = tagged("Unlisted");
    const operation = query(
      { ...readConfig, operational: [Unreachable] },
      async () => Result.err(new Unlisted({ message: "not listed" })) as Result<number, never>,
    );

    await expect(run(viewer, operation, undefined, log)).rejects.toBeInstanceOf(Panic);
  });
});
