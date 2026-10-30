import { describe, expect, mock, spyOn, test } from "bun:test";
import { Panic, Result, UnhandledException, panic } from "better-result";
import { eq, sql } from "drizzle-orm";
import { createRequestLogger, initLogger } from "evlog";
import { user } from "@myakiba/db/schema/auth";
import type { ReadTx } from "@myakiba/db/tx";
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
const Rejected = Failure("Rejected", "bad_request", "Rejected");
const LeaseExpired = Failure("LeaseExpired", "conflict", "The saved lease has expired");
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

describe("command commit hooks and recovery", () => {
  test("effects observe committed rows and disappear on fail or throw", async () => {
    const observed: string[] = [];
    const operation = (ending: "ok" | "fail" | "throw") =>
      command(config, async (scope, id: string) => {
        await scope.tx.insert(user).values(newUser(id));
        scope.afterCommit(async (committed) => {
          const rows = await committed.tx.select({ id: user.id }).from(user).where(eq(user.id, id));
          for (const row of rows) observed.push(row.id);
        });
        if (ending === "fail") return Result.err(new Rejected());
        if (ending === "throw") throw new Error("rolled back");
        return Result.ok({ id });
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
        before: async (scope, id: string) => {
          preparations += 1;
          return scope.proceed(id);
        },
      },
      async (scope, id) => {
        attempts += 1;
        const attempt = attempts;
        await scope.tx.insert(user).values(newUser(id));
        scope.afterCommit(async () => {
          effects.push(attempt);
        });
        if (attempt < 3) throw new Error("retry");
        return Result.ok({ id });
      },
      {
        retry: (error, attempt) =>
          error.cause instanceof Error && error.cause.message === "retry" && attempt < 3,
      },
    );
    expect(await valueOf(run(viewer, operation, "retried-write", log))).toEqual({
      id: "retried-write",
    });
    expect({ preparations, attempts, effects }).toEqual({
      preparations: 1,
      attempts: 3,
      effects: [3],
    });
  });

  test("an internal Err rolls back and drives retry like a throw", async () => {
    let attempts = 0;
    const operation = command(
      config,
      async (scope, id: string) => {
        attempts += 1;
        await scope.tx.insert(user).values(newUser(`${id}-${attempts}`));
        if (attempts < 3) return Result.err(new Contended({ message: "the row was locked" }));
        return Result.ok(attempts);
      },
      {
        retry: (error, attempt) => Contended.is(error) && attempt < 3,
        recover: async () => Result.err(new Rejected()),
      },
    );

    expect(await valueOf(run(viewer, operation, "contended", log))).toBe(3);
    expect(await userExists("contended-1")).toBe(false);
    expect(await userExists("contended-2")).toBe(false);
    expect(await userExists("contended-3")).toBe(true);
  });

  test("recovery runs after rollback and commits a fresh operation", async () => {
    let attempts = 0;
    const original = new Error("original write failed");
    const operation = command(
      config,
      async (scope, id: string) => {
        attempts += 1;
        await scope.tx.insert(user).values(newUser(id));
        throw original;
      },
      {
        retry: (_error, attempt) => attempt < 2,
        recover: async (scope, id, error) => {
          expect(error).toBeInstanceOf(UnhandledException);
          expect(error.cause).toBe(original);
          expect(await userExists(id)).toBe(false);
          return scope.execute(writeThen("ok"), { id });
        },
      },
    );
    expect(await valueOf(run(viewer, operation, "recovered-write", log))).toBe("written");
    expect(attempts).toBe(2);
    expect(await userExists("recovered-write")).toBe(true);
  });

  test("recovery also handles preparation failures, and cannot run for committed effect failures", async () => {
    let recoveries = 0;
    const recover = async () => {
      recoveries += 1;
      return Result.ok("recovered" as const);
    };
    const beforeThrows = command(
      {
        ...config,
        before: async () => {
          throw new Error("preparation");
        },
      },
      async () => Result.ok("unused" as const),
      { recover },
    );
    expect(await valueOf(run(viewer, beforeThrows, undefined, log))).toBe("recovered");
    const effectThrows = command(
      config,
      async (scope) => {
        scope.afterCommit(async () => {
          throw new Error("effect");
        });
        return Result.ok("committed" as const);
      },
      { recover },
    );
    expect(await valueOf(run(viewer, effectThrows, undefined, log))).toBe("committed");
    expect(recoveries).toBe(1);
  });

  test("a rethrown error reaches the caller as the value originally thrown", async () => {
    const original = new Error("original persistence error");
    const operation = command(config, async () => rejected(original), {
      recover: async (_scope, _input, error) => {
        throw error;
      },
    });

    await expect(run(viewer, operation, undefined, log)).rejects.toBe(original);
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
    await scope.tx.insert(user).values(newUser(id));
    for (const message of ["first effect failed", "second effect failed"]) {
      scope.afterCommit(async () => {
        throw new Error(message);
      });
    }
    scope.afterCommit(async (committed) => {
      const rows = await committed.tx.select({ id: user.id }).from(user).where(eq(user.id, id));
      for (const row of rows) observed.push(row.id);
    });
    return Result.ok("committed" as const);
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

describe("a committed failure saves its writes and effects before answering its status", () => {
  test.each(["returned", "yielded inside Result.gen"] as const)("when %s", async (how) => {
    let effects = 0;
    let retries = 0;
    let recoveries = 0;
    const operation = command(
      config,
      async (scope, id: string) =>
        Result.gen(async function* () {
          await scope.tx.insert(user).values(newUser(id));
          scope.afterCommit(async () => {
            effects += 1;
          });
          if (how === "returned") return scope.failAfterCommit(new LeaseExpired());
          yield* scope.failAfterCommit(new LeaseExpired());
          return Result.ok(1);
        }),
      {
        retry: (_error, attempt) => {
          retries += 1;
          return attempt < 2;
        },
        recover: async () => {
          recoveries += 1;
          return Result.ok(0);
        },
      },
    );

    const outcome = await run(viewer, operation, `committed-${how}`, log);
    expect(outcome.isErr() && outcome.error).toBeInstanceOf(LeaseExpired);
    expect(await serve({ viewer, log }, operation, `served-${how}`)).toMatchObject({
      code: 409,
      response: "The saved lease has expired",
    });
    expect(await userExists(`committed-${how}`)).toBe(true);
    expect(await userExists(`served-${how}`)).toBe(true);
    expect({ effects, retries, recoveries }).toEqual({ effects: 2, retries: 0, recoveries: 0 });
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

describe("a defect is never retried or recovered", () => {
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
      let retries = 0;
      let recoveries = 0;
      const id = `defect-${Object.keys(defects).indexOf(name)}`;
      const operation = command(
        config,
        async (scope, input: string) => {
          await scope.tx.insert(user).values(newUser(input));
          return end();
        },
        {
          retry: () => {
            retries += 1;
            return true;
          },
          recover: async () => {
            recoveries += 1;
            return Result.ok(0);
          },
        },
      );
      const caller = { viewer, log: createRequestLogger() };
      const logged = spyOn(caller.log, "error");

      expect(await serve(caller, operation, id)).toMatchObject({
        code: 500,
        response: "Failed to write",
      });
      expect(logged.mock.lastCall?.[0]).toBeInstanceOf(Panic);
      expect({ retries, recoveries }).toEqual({ retries: 0, recoveries: 0 });
      expect(await userExists(id)).toBe(false);
    },
  );

  test.each(["body", "before", "recover"] as const)(
    "a Panic returned as an Err from %s is refused before any hook",
    async (from) => {
      const defect = new Panic({ message: "returned instead of thrown" });
      let retries = 0;
      const returned = () => Result.err(defect) as Result<number, never>;
      const operation = command(
        {
          ...config,
          before: async (scope, input: string) =>
            from === "before" ? returned() : scope.proceed(input),
        },
        async (scope, input) => {
          await scope.tx.insert(user).values(newUser(`returned-${from}`));
          if (from === "body") return returned();
          throw new Error(input);
        },
        {
          retry: () => {
            retries += 1;
            return false;
          },
          recover: async () => returned(),
        },
      );

      await expect(run(viewer, operation, "go", log)).rejects.toBe(defect);
      expect(retries).toBe(from === "recover" ? 1 : 0);
      expect(await userExists(`returned-${from}`)).toBe(false);
    },
  );
});

describe("a defect raised while recovering always answers", () => {
  const broken = command({ ...config, action: "test.broken" }, async () =>
    panic("a recovery operation found a broken invariant"),
  );
  test("even when recover ignores its Err and answers ok", async () => {
    const operation = command(
      config,
      async () => {
        throw new Error("persistence failed");
      },
      {
        recover: async (scope) => {
          const result = await scope.execute(broken, {});
          expect(result.isErr()).toBe(true);
          return Result.ok("hidden" as const);
        },
      },
    );

    await expect(run(viewer, operation, undefined, log)).rejects.toThrow(
      "a recovery operation found a broken invariant",
    );
  });

  test("and when recover forwards its Err", async () => {
    const operation = command(
      config,
      async () => {
        throw new Error("persistence failed");
      },
      {
        recover: (scope) => scope.execute(broken, {}),
      },
    );
    const caller = { viewer, log: createRequestLogger() };
    const logged = spyOn(caller.log, "error");

    expect(await serve(caller, operation, {})).toMatchObject({ code: 500 });
    expect(logged.mock.lastCall?.[0]).toBeInstanceOf(Panic);
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
    "%s never reaches retry or recover",
    async (_name, produce) => {
      const retry = mock(() => false);
      const recover = mock(async () => Result.ok(0));
      const operation = command(
        config,
        async (scope) => {
          await scope.tx.insert(user).values(newUser("callback-defect"));
          produce();
          return Result.ok(1);
        },
        { retry, recover },
      );
      await expect(run(viewer, operation, undefined, log)).rejects.toBeInstanceOf(Panic);
      expect(retry).not.toHaveBeenCalled();
      expect(recover).not.toHaveBeenCalled();
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

  test("after its command rolls back, and retry still sees it", async () => {
    const seen: unknown[] = [];
    const operation = command(
      { ...config, operational: [Unreachable] },
      async (scope, id: string) => {
        await scope.tx.insert(user).values(newUser(id));
        return Result.err(outage);
      },
      {
        retry: (error, attempt) => {
          seen.push(error);
          return attempt < 2;
        },
      },
    );

    await expect(run(viewer, operation, "operational-write", log)).rejects.toBe(outage);
    expect(seen).toEqual([outage, outage]);
    expect(await userExists("operational-write")).toBe(false);
  });

  test("unless a recover answers it", async () => {
    const operation = command(
      { ...config, operational: [Unreachable] },
      async () => Result.err(outage),
      {
        recover: async (_scope, _input, error) => {
          expect(error).toBe(outage);
          return Result.ok("recovered" as const);
        },
      },
    );

    expect(await valueOf(run(viewer, operation, undefined, log))).toBe("recovered");
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

test("a Panic in a commit effect logs at error level and keeps the response", async () => {
  initLogger({ enabled: true });
  const caller = { viewer, log: createRequestLogger() };
  initLogger({ enabled: false });
  const errors = spyOn(caller.log, "error");
  const operation = command(config, async (scope, id: string) => {
    await scope.tx.insert(user).values(newUser(id));
    scope.afterCommit(async () => {
      panic("committed effect invariant failed");
    });
    return Result.ok("committed" as const);
  });
  expect(await serve(caller, operation, "panic-effect")).toBe("committed");
  expect(await userExists("panic-effect")).toBe(true);
  expect(errors).toHaveBeenCalledTimes(1);
  expect(errors.mock.lastCall?.[0]).toBeInstanceOf(Panic);
});
