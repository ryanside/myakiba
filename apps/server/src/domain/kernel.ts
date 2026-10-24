import { status } from "elysia";
import type { ElysiaCustomStatusResponse } from "elysia";
import type { RequestLogger } from "evlog";
import { SQL, asc, desc, is, sql } from "drizzle-orm";
import type { AnyColumn } from "drizzle-orm";
import type { AnyPgColumn, PgSelect } from "drizzle-orm/pg-core";
import { Panic, Result, TaggedError, UnhandledException, panic } from "better-result";
import type { AnyTaggedError, Err, InferErr, InferOk, Ok } from "better-result";
import { db } from "@myakiba/db/client";
import type { ReadTx, Tx } from "@myakiba/db/tx";
import type { Page, PageRequest } from "@myakiba/contracts/shared/pagination";
import type { AnyFailure, Category } from "./failure";
import type { Viewer } from "./viewer";

/**
 * The one way a route reads or writes user data. A domain module exports
 * operations built with `query` or `command`, and a route answers with
 * `serve(ctx, Module.op, input)`.
 *
 * A body returns a better-result `Result`. Every error a client may see is a
 * `Failure`, a class that carries its own category and literal message. Any other
 * Err is internal, and only a command's `recover` may see it, unless the operation
 * lists its class in `operational`. A deliberate `panic` is a defect: it is never
 * retried or recovered and answers a logged 500. Any other throw also answers that
 * 500, after `retry` and `recover` see it as an `UnhandledException`, and so does an
 * operational error that nothing recovered.
 *
 * A command runs in one transaction. Any Err or throw rolls it back;
 * `scope.failAfterCommit(failure)` saves its writes before answering the failure.
 * A query reads from the pool, so its parallel reads run on separate connections
 * and may see different commits; a query whose reads must agree sets
 * `snapshot: true` and reads one snapshot in one transaction. A command whose slow
 * work must not hold a connection does it in `before`, which reads from the pool
 * before the transaction opens. `serve` turns the outcome into the response: the
 * value, the failure's status and message, or a logged 500 with the operation's
 * `failure`.
 */
const FAILURE_STATUS = {
  bad_request: 400,
  forbidden: 403,
  conflict: 409,
  payload_too_large: 413,
  not_found: 404,
  too_many_requests: 429,
} as const satisfies Record<Category, number>;

/** A failure that answers after the command commits. Only `CommandScope.failAfterCommit` makes one. */
type Committed<F extends AnyFailure> = { readonly "~committed": F };

/** A `before` that hands its value to the body. Only `BeforeScope.proceed` makes one. */
type Proceed<P> = { readonly "~proceed": P };

/** The brands the kernel made, so that a lookalike object is never read as one. */
const brands = new WeakSet<object>();

function brand<T extends object>(value: T): T {
  brands.add(value);
  return value;
}

const committed = <F extends AnyFailure>(failure: F): Committed<F> =>
  brand({ "~committed": failure });
const proceeding = <P>(value: P): Proceed<P> => brand({ "~proceed": value });

const isCommitted = (error: Leftover): error is Committed<AnyFailure> =>
  brands.has(error) && "~committed" in error;
const isProceed = (result: AnyResult): result is Ok<Proceed<unknown>, Leftover> =>
  result.isOk() &&
  typeof result.value === "object" &&
  result.value !== null &&
  brands.has(result.value) &&
  "~proceed" in result.value;

function isFailure(error: Leftover): error is AnyFailure {
  return (
    TaggedError.is(error) &&
    "category" in error &&
    typeof error.category === "string" &&
    Object.hasOwn(FAILURE_STATUS, error.category)
  );
}

/** The public failure an Err stands for, after a commit or not. */
type PublicOf<E> = E extends Committed<infer F> ? F : E extends AnyFailure ? E : never;

/** An Err the client never sees: it exists for `retry` and `recover`. */
type InternalOf<E> = E extends AnyFailure | Committed<AnyFailure> ? never : E;

/** What `retry` and `recover` receive: an internal Err, or a value that was thrown. */
type Recoverable<E> = InternalOf<E> | UnhandledException;

type ReadScope = {
  readonly viewer: Viewer;
  readonly tx: ReadTx;
  /** The request's wide event. The kernel sets `action`, `user` and `outcome`. */
  readonly log: RequestLogger;
};

/** The values a prepared read binds to its `sql.placeholder(name)` slots. */
type Placeholders = Readonly<Record<string, string | number | boolean | Date | null>>;
type Statement<T> = { readonly execute: (placeholders?: Placeholders) => Promise<T> };
type Prepared<T> = { readonly statement: Statement<T> };

/** A query without `snapshot` reads from the pool, so it can also run reads built once by `prepared()`. */
type PoolScope = ReadScope & {
  readonly read: <T>(statement: Prepared<T>, placeholders?: Placeholders) => Promise<T>;
};

/**
 * A pool read whose SQL is built once, at module load. Pass per-call values
 * through `sql.placeholder(name)` and run it with `scope.read(statement, values)`.
 */
export function prepared<T>(
  name: string,
  build: (pool: ReadTx) => { readonly prepare: (name: string) => Statement<T> },
): Prepared<T> {
  return { statement: build(pool).prepare(name) };
}

/** A command's `before`: the pool, plus the one way to hand a value to the body. */
type BeforeScope = PoolScope & {
  readonly proceed: <P>(value: P) => Ok<Proceed<P>, never>;
};

export type CommandScope = Omit<ReadScope, "tx"> & {
  readonly tx: Tx;
  /** Runs only after this attempt commits, reading the pool. A rollback discards its callbacks. */
  readonly afterCommit: (effect: (scope: ReadScope) => Promise<void>) => void;
  /** Commits this attempt's writes and effects, then answers with `failure`. Return it, or yield it inside `Result.gen`. */
  readonly failAfterCommit: <F extends AnyFailure>(failure: F) => Err<never, Committed<F>>;
};

type RecoveryScope = Pick<ReadScope, "viewer" | "log"> & {
  /**
   * Runs a fresh operation with `run`'s contract: a Failure comes back as an Err, an
   * unhandled throw throws the value originally thrown, an operational error throws
   * itself, and a defect throws its Panic.
   * A defect raised here always wins: once `recover` settles, the kernel answers with
   * it even if `recover` caught it, so a recovery can never hide a broken invariant.
   */
  readonly execute: <I, T, F extends AnyFailure, M extends string>(
    op: Op<I, T, F, M>,
    input: NoInfer<I>,
  ) => Promise<Result<T, F>>;
};

/**
 * A tagged error class an operation lists in `operational`: an outage it has no answer
 * for, such as Redis not answering. It is never a Failure, which the client sees.
 */
type OperationalClass = abstract new (...args: never[]) => AnyTaggedError;
type Operational = readonly OperationalClass[];

/**
 * A listed Failure fails to compile at its place in the list, and so does a class whose
 * instances TS reads as `any`, such as a bare `tagged("Tag")`, which would list every error.
 */
type Listable<O extends Operational> = {
  readonly [K in keyof O]: O[K] extends OperationalClass
    ? 0 extends 1 & InstanceType<O[K]>
      ? { readonly fix: "list a class declared as extends tagged(tag)<Props>" }
      : InstanceType<O[K]> extends AnyFailure
        ? { readonly fix: "a Failure answers its own status; never list it in operational" }
        : O[K]
    : O[K];
};
/** What a body may leave for the 500. A Panic or an UnhandledException is never answered. */
type OperationalOf<O extends Operational> = Exclude<
  InstanceType<O[number]>,
  Panic | UnhandledException
>;

type OpConfig<M extends string, O extends Operational = Operational> = {
  /** The wide event's `action`, such as "orders.delete_item". */
  readonly action: string;
  /** The 500 body for a defect, an unrecovered throw or an unrecovered operational error. */
  readonly failure: M;
  /**
   * Internal errors the operation answers with its logged 500, as if they were thrown:
   * `retry` and `recover` still see them, and the log carries the error and its cause.
   */
  readonly operational?: O & Listable<O>;
};

type QueryConfig<M extends string, O extends Operational> = OpConfig<M, O> & {
  /** Reads every statement from one snapshot, for a body whose reads must agree with each other. */
  readonly snapshot?: true;
};

/**
 * What a command does with what its body leaves behind. It is the third argument, after
 * the body, so that TS infers the body first and types `error` from it.
 */
type Retrying<E> = {
  /**
   * Decides whether a rolled-back attempt runs again, starting at attempt 1. It sees an
   * internal Err or a thrown value, never a Failure, a committed failure or a defect.
   * `before` is not repeated. A predicate passed by name takes `error: unknown`, because a
   * narrower parameter stops TS from inferring the body.
   */
  readonly retry?: (error: Recoverable<E>, attempt: number) => boolean;
  readonly recover?: never;
};

/** Handlers with a recover. Its presence, not its answer type, lets an internal error through. */
type Recovering<I, E, C> = Omit<Retrying<E>, "recover"> & {
  /**
   * Runs after rollback, for an internal Err or a throw from `before` or the last attempt.
   * A defect never reaches it. It answers with a Failure or a fresh operation, or throws
   * to answer 500; rethrowing `error` reports the value originally thrown.
   */
  readonly recover: (scope: RecoveryScope, input: I, error: Recoverable<E>) => Promise<C>;
};

/** Only `serve` and `run` can execute an operation, because its body lives in `bodies`. */
type Op<I, T, F extends AnyFailure, M extends string> = OpConfig<M> & {
  /** Type-only: carries the operation's types for `serve`. Never set at runtime. */
  readonly "~types"?: {
    readonly input: (input: I) => void;
    readonly value: T;
    readonly failure: F;
  };
};

/** What an Err holds: a Failure, an internal tagged error, a Panic, or a committed failure. */
type Leftover = AnyTaggedError | Committed<AnyFailure>;
type AnyResult = Result<unknown, Leftover>;

/**
 * better-result widens `Result.ok("Saved")` to `Ok<string>`, which would hide a message
 * body's literal from Eden, so a body whose answer is a plain `string` fails to compile.
 */
type Literal<T> = [T] extends [never]
  ? unknown
  : unknown extends T
    ? unknown
    : string extends T
      ? { readonly fix: 'write a string answer as Result.ok("…" as const)' }
      : unknown;

/** An internal Err with nowhere to go fails to compile at the body. */
type Handled<E, Recovers extends boolean, D> = [Exclude<InternalOf<E>, D>] extends [never]
  ? unknown
  : Recovers extends true
    ? unknown
    : {
        readonly fix: "an internal error needs recover or a class in operational, or must be a Failure";
      };

/** A defect is thrown with `panic(...)`, so that no hook can mistake it for an expected failure. */
type NoPanic<E> = [Extract<E, Panic>] extends [never]
  ? unknown
  : { readonly fix: "throw a defect with panic(...); never return a Panic as an Err" };

/**
 * A body's return type is `R & Checked<…>`: TS infers R from the body, then checks the
 * body against the intersection. A failed check names its fix as a missing `fix` property.
 */
type Checked<Answer, E, Recovers extends boolean, D = never> = Literal<InferOk<Answer>> &
  Handled<E, Recovers, D> &
  NoPanic<E>;

type AnyOp = Op<never, unknown, AnyFailure, string>;
type Body = (scope: never, input: never) => Promise<AnyResult>;
type Hook = (scope: BeforeScope, input: never) => Promise<AnyResult>;
type Retry = (error: AnyTaggedError, attempt: number) => boolean;
type Recover = (scope: RecoveryScope, input: never, error: AnyTaggedError) => Promise<AnyResult>;

const bodies = new WeakMap<AnyOp, Body>();
const befores = new WeakMap<AnyOp, Hook>();
const retries = new WeakMap<AnyOp, Retry>();
const recoveries = new WeakMap<AnyOp, Recover>();
const operationals = new WeakMap<AnyOp, Operational>();

const SNAPSHOT = { isolationLevel: "repeatable read", accessMode: "read only" } as const;
const snapshots = new WeakSet<AnyOp>();
const poolReads = new WeakSet<AnyOp>();
const pool: ReadTx = db;

const readPrepared = <T>(statement: Prepared<T>, placeholders?: Placeholders) =>
  statement.statement.execute(placeholders);

/** Runs `select 1` on the pool, for the readiness check. */
export async function ping(): Promise<void> {
  await db.execute(sql`select 1`);
}

/**
 * A read. The body takes the scope and one input object, never positional params, and
 * returns a Result whose errors are all Failures or listed in `operational`. Without
 * `snapshot` it reads the pool; with it, one repeatable-read, read-only snapshot.
 */
export function query<
  I,
  R extends AnyResult,
  const M extends string,
  const S extends true | undefined = undefined,
  const O extends Operational = [],
>(
  config: QueryConfig<M, O> & { readonly snapshot?: S },
  body: (
    scope: S extends true ? ReadScope : PoolScope,
    input: I,
  ) => Promise<R & Checked<R, InferErr<R>, false, OperationalOf<O>>>,
): Op<I, InferOk<R>, PublicOf<InferErr<R>>, M> {
  const op = { action: config.action, failure: config.failure };
  bodies.set(op, body as Body);
  if (config.operational) operationals.set(op, config.operational);
  (config.snapshot ? snapshots : poolReads).add(op);
  return op;
}

type Before<I, B extends AnyResult> = (scope: BeforeScope, input: I) => Promise<B>;

/** What a `before` hands the body. */
type HandoffOf<B> = B extends Ok<Proceed<infer P>, unknown> ? P : never;
/** What a `before` answers by itself, without the transaction. */
type AnswerOf<B> = B extends Ok<Proceed<unknown>, unknown> ? never : B;

/**
 * A write. Everything the body does through `scope.tx` commits together or not at all:
 * any Err or throw rolls the attempt back, and only `scope.failAfterCommit(failure)`
 * keeps the writes. `before` runs first, for work such as parsing or a network call,
 * and reads the pool outside the transaction. It returns `scope.proceed(value)` to run
 * the body with `value`, or a Result that answers without opening a transaction. A row
 * it read can change before the body runs, so the body must re-check inside the
 * transaction anything it writes against. Its effects outside the database, such as a
 * stored file, are never rolled back. `handlers.retry` reruns a rolled-back attempt
 * without repeating `before`. `handlers.recover` handles what `before` or the last
 * attempt left internal or threw, through fresh operations after rollback. Without a
 * recover, an internal error must be listed in `operational`. Commit effects run
 * afterwards; their errors never retry or recover committed writes.
 */
export function command<
  I,
  B extends AnyResult,
  R extends AnyResult,
  const M extends string,
  C extends Result<unknown, AnyFailure> = never,
  const O extends Operational = [],
>(
  config: OpConfig<M, O> & { readonly before: Before<I, B> },
  body: (
    scope: CommandScope,
    input: HandoffOf<B>,
  ) => Promise<R & Checked<AnswerOf<B> | R, InferErr<B | R>, true>>,
  handlers: Recovering<I, InferErr<B | R>, C>,
): Op<I, InferOk<AnswerOf<B> | R | C>, PublicOf<InferErr<B | R | C>>, M>;
export function command<
  I,
  B extends AnyResult,
  R extends AnyResult,
  const M extends string,
  const O extends Operational = [],
>(
  config: OpConfig<M, O> & { readonly before: Before<I, B> },
  body: (
    scope: CommandScope,
    input: HandoffOf<B>,
  ) => Promise<R & Checked<AnswerOf<B> | R, InferErr<B | R>, false, OperationalOf<O>>>,
  handlers?: Retrying<InferErr<B | R>>,
): Op<I, InferOk<AnswerOf<B> | R>, PublicOf<InferErr<B | R>>, M>;
// Only the overloads above take a `before`: it reads the pool, so it can never be handed a Tx.
export function command<
  I,
  R extends AnyResult,
  const M extends string,
  C extends Result<unknown, AnyFailure> = never,
  const O extends Operational = [],
>(
  config: OpConfig<M, O> & { readonly before?: never },
  body: (scope: CommandScope, input: I) => Promise<R & Checked<R, InferErr<R>, true>>,
  handlers: Recovering<I, InferErr<R>, C>,
): Op<I, InferOk<R | C>, PublicOf<InferErr<R | C>>, M>;
export function command<
  I,
  R extends AnyResult,
  const M extends string,
  const O extends Operational = [],
>(
  config: OpConfig<M, O> & { readonly before?: never },
  body: (
    scope: CommandScope,
    input: I,
  ) => Promise<R & Checked<R, InferErr<R>, false, OperationalOf<O>>>,
  handlers?: Retrying<InferErr<R>>,
): Op<I, InferOk<R>, PublicOf<InferErr<R>>, M>;
export function command(
  config: OpConfig<string> & { readonly before?: Before<never, AnyResult> },
  body: (scope: CommandScope, input: never) => Promise<AnyResult>,
  handlers?: Retrying<never> | Recovering<never, never, AnyResult>,
): AnyOp {
  const op = { action: config.action, failure: config.failure };
  bodies.set(op, body as Body);
  if (config.before) befores.set(op, config.before);
  if (handlers?.retry) retries.set(op, handlers.retry as Retry);
  if (handlers?.recover) recoveries.set(op, handlers.recover as Recover);
  if (config.operational) operationals.set(op, config.operational);
  return op;
}

type FailureResponse<F> = F extends {
  readonly category: infer C extends Category;
  readonly message: infer M;
}
  ? ElysiaCustomStatusResponse<(typeof FAILURE_STATUS)[C], M>
  : never;

/** Thrown inside the transaction so that it rolls back, carrying the Err that asked for it. */
class Rollback {
  readonly result: Err<unknown, Leftover>;

  constructor(result: Err<unknown, Leftover>) {
    this.result = result;
  }
}

/**
 * better-result rethrows a value thrown inside `Result.gen` or a combinator callback as a
 * Panic with one of these messages and the value as its cause. The kernel looks through
 * them, so a Postgres error means the same thing whether or not the body used gen.
 * `kernel.test.ts` makes better-result produce each one.
 */
const RETHROWN = new Set([
  "generator body threw",
  "generator cleanup threw",
  "map callback threw",
  "mapError callback threw",
  "andThen callback threw",
  "andThenAsync callback threw",
  "tryRecover callback threw",
  "tryRecoverAsync callback threw",
  "match ok handler threw",
  "match err handler threw",
  "matchError handler threw",
  "tap callback threw",
  "tapAsync callback threw",
  "tapError callback threw",
  "tapErrorAsync callback threw",
  "tapBoth ok callback threw",
  "tapBoth err callback threw",
  "tapBothAsync ok callback threw",
  "tapBothAsync err callback threw",
  "Result.try catch handler threw",
  "Result.tryPromise catch handler threw",
  "Result.allAsync input promise rejected",
  "Result.partitionAsync input promise rejected",
  "shouldRetry predicate threw",
  "Result.tryPromise delayMs callback threw",
  "Result.codec serialize schema threw",
  "Result.codec deserialize schema threw",
]);

/** How an operation ended, before `run` turns it into a Result or a throw. */
type Settled =
  | { readonly kind: "answer"; readonly result: Result<unknown, AnyFailure> }
  /** A deliberate `panic` or `unwrap`, possibly wrapped: never retried or recovered. */
  | { readonly kind: "defect"; readonly panic: Panic }
  /** An internal Err or a thrown value, which `retry` and `recover` may handle. */
  | { readonly kind: "left"; readonly error: AnyTaggedError };

/** Walks better-result's rethrow wrappers to what was really thrown. */
function classify(cause: unknown): Settled {
  let value = cause;
  while (Panic.is(value) && RETHROWN.has(value.message)) value = value.cause;
  if (Panic.is(value)) return { kind: "defect", panic: value };
  if (UnhandledException.is(value)) return { kind: "left", error: value };
  return { kind: "left", error: new UnhandledException({ cause: value }) };
}

/** Sorts what a body, `before` or `recover` returned. A returned Panic is a defect. */
function settle(result: AnyResult): Settled {
  if (result.isOk()) return { kind: "answer", result: Result.ok(result.value) };
  const error = isCommitted(result.error) ? result.error["~committed"] : result.error;
  if (Panic.is(error)) return { kind: "defect", panic: error };
  if (isFailure(error)) return { kind: "answer", result: Result.err(error) };
  return { kind: "left", error };
}

async function guarded(step: () => Promise<Settled>): Promise<Settled> {
  try {
    return await step();
  } catch (error) {
    return classify(error);
  }
}

function bodyOf(op: AnyOp) {
  const body = bodies.get(op);
  if (!body) panic(`${op.action} was not built by query() or command(), so it has no body to run`);
  return body;
}

/** A committed failure keeps the attempt's writes, unless it carries a defect. */
const keepsWrites = (error: Leftover) => isCommitted(error) && !Panic.is(error["~committed"]);

type Effect = (scope: ReadScope) => Promise<void>;

async function runEffects(
  op: AnyOp,
  effects: readonly Effect[],
  viewer: Viewer,
  log: RequestLogger,
) {
  for (const effect of effects) {
    try {
      await effect({ viewer, tx: pool, log });
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      log.warn(failure.message, {
        afterCommitErrors: [
          {
            step: op.action,
            name: failure.name,
            message: failure.message,
            stack: failure.stack,
            cause: failure.cause,
          },
        ],
      });
    }
  }
}

/** Runs a query that reads the pool, one autocommit statement at a time. */
async function readPool(op: AnyOp, viewer: Viewer, input: never, log: RequestLogger) {
  const body = bodyOf(op);
  try {
    return settle(await body({ viewer, tx: pool, read: readPrepared, log } as never, input));
  } catch (error) {
    return classify(error);
  }
}

/** Runs `before` and every attempt of a command, retrying what `retry` accepts. */
async function attempts(
  op: AnyOp,
  viewer: Viewer,
  input: never,
  log: RequestLogger,
): Promise<Settled> {
  let handoff: unknown = input;
  const before = befores.get(op);
  if (before) {
    let first: AnyResult;
    try {
      first = await before(
        {
          viewer,
          tx: pool,
          read: readPrepared,
          log,
          proceed: (value) => Result.ok(proceeding(value)),
        },
        input,
      );
    } catch (error) {
      return classify(error);
    }
    if (!isProceed(first)) return settle(first);
    handoff = first.value["~proceed"];
  }
  const body = bodyOf(op);
  const retry = retries.get(op);
  for (let attempt = 1; ; attempt += 1) {
    const attemptEffects: Effect[] = [];
    let settled: Settled;
    try {
      const result = await db.transaction(
        async (tx) => {
          const scope: CommandScope = {
            viewer,
            tx,
            log,
            afterCommit: (effect) => {
              attemptEffects.push(effect);
            },
            failAfterCommit: (failure) => Result.err(committed(failure)),
          };
          const answered = await body(scope as never, handoff as never);
          if (answered.isErr() && !keepsWrites(answered.error)) throw new Rollback(answered);
          return answered;
        },
        snapshots.has(op) ? SNAPSHOT : undefined,
      );
      await runEffects(op, attemptEffects, viewer, log);
      settled = settle(result);
    } catch (error) {
      settled = error instanceof Rollback ? settle(error.result) : classify(error);
    }
    if (settled.kind !== "left" || !retry) return settled;
    let again: boolean;
    try {
      again = retry(settled.error, attempt);
    } catch (error) {
      return classify(error);
    }
    if (!again) return settled;
  }
}

/** Runs `recover` with fresh operations, and answers with any defect they raised. */
async function recovered(
  recover: Recover,
  viewer: Viewer,
  input: never,
  left: AnyTaggedError,
  log: RequestLogger,
): Promise<Settled> {
  let defect: Panic | undefined;
  const execute: RecoveryScope["execute"] = async (next, value) => {
    try {
      return await run(viewer, next, value, log);
    } catch (error) {
      const sorted = classify(error);
      if (sorted.kind === "defect") defect ??= sorted.panic;
      throw error;
    }
  };
  const settled = await guarded(async () =>
    settle(await recover({ viewer, log, execute }, input, left)),
  );
  return defect ? { kind: "defect", panic: defect } : settled;
}

/**
 * Runs `op` and returns its Result. Routes call `serve`; tests call this.
 *
 * Expected failures come back as Err. A defect throws its Panic. A throw nobody
 * recovered throws the value originally thrown, including one that `recover` rethrew,
 * and an operational error nobody recovered throws itself.
 */
export async function run<I, T, F extends AnyFailure, M extends string>(
  viewer: Viewer,
  op: Op<I, T, F, M>,
  input: NoInfer<I>,
  log: RequestLogger,
): Promise<Result<T, F>> {
  const anyOp = op as AnyOp;
  let settled: Settled;
  if (poolReads.has(anyOp)) {
    settled = await readPool(anyOp, viewer, input as never, log);
  } else {
    settled = await attempts(anyOp, viewer, input as never, log);
    const recover = recoveries.get(anyOp);
    if (settled.kind === "left" && recover) {
      settled = await recovered(recover, viewer, input as never, settled.error, log);
    }
  }
  if (settled.kind === "answer") return settled.result as Result<T, F>;
  if (settled.kind === "defect") throw settled.panic;
  const left = settled.error;
  if (UnhandledException.is(left)) throw left.cause;
  if (operationals.get(anyOp)?.some((declared) => left instanceof declared)) throw left;
  return panic(
    `${op.action} answered an internal error that no recover handled; only a AnyFailure may reach serve`,
    settled.error,
  );
}

/**
 * Runs `op` for the signed-in caller and answers with its value, its failure's
 * status and message, or a 500. Eden sees one entry per Failure class.
 */
export async function serve<I, T, F extends AnyFailure, M extends string>(
  caller: { readonly viewer: Viewer; readonly log: RequestLogger },
  op: Op<I, T, F, M>,
  input: NoInfer<I>,
): Promise<T | FailureResponse<F> | ElysiaCustomStatusResponse<500, M>> {
  caller.log.set({
    action: caller.log.getContext().action ?? op.action,
    user: { id: caller.viewer.userId },
  });
  try {
    const result = await run(caller.viewer, op, input, caller.log);
    if (result.isOk()) {
      // An operation may name its own outcome, such as "imported", in place of "success".
      caller.log.set({ outcome: caller.log.getContext().outcome ?? "success" });
      return result.value;
    }
    caller.log.set({ outcome: result.error.category });
    return status(
      FAILURE_STATUS[result.error.category],
      result.error.message,
    ) as FailureResponse<F>;
  } catch (error) {
    caller.log.error(error instanceof Error ? error : new Error(String(error)), {
      step: op.action,
    });
    caller.log.set({ outcome: "error" });
    return status(500, op.failure);
  }
}

type SortColumn = AnyColumn | SQL | SQL.Aliased;
type Direction = "asc" | "desc";

/** A flat selection, as a list query passes to `scope.tx.select(...)`. */
type Fields = Readonly<Record<string, SortColumn>>;

/**
 * A total over the whole filtered set: the sum of a column or expression, or the
 * count of rows that match a condition, either one optionally filtered.
 */
type Total = { readonly sum: SortColumn; readonly where?: SQL } | { readonly count: SQL };
type Totals = Readonly<Record<string, Total>>;

type PageOf<TRows extends PgSelect, TTotals extends Totals> = Page<Awaited<TRows>[number]> & {
  readonly [K in keyof TTotals]: number;
};

type PageSource<TFields extends Fields, TRows extends PgSelect, TTotals extends Totals> = {
  readonly select: TFields;
  /** Builds the filtered rows from `select`, such as `(fields) => scope.tx.select(fields).from(...)`. */
  readonly rows: (fields: TFields) => TRows;
  readonly totals?: TTotals;
};

/** A total as a window over every filtered row, so each row of the page carries it. */
function windowTotal(total: Total): SQL<number> {
  if ("count" in total) {
    return sql<number>`COUNT(*) FILTER (WHERE ${total.count}) OVER ()`.mapWith(Number);
  }
  const filter = total.where ? sql` FILTER (WHERE ${total.where})` : sql``;
  return sql<number>`COALESCE(SUM(${total.sum})${filter} OVER (), 0)`.mapWith(Number);
}

/** Fields renamed by `named`, as a CTE selects them. */
type NamedFields = Readonly<Record<string, SQL.Aliased>>;

/** A subquery's aliased field, which renders as a reference to its alias. */
const isSubqueryField = (field: SQL.Aliased) =>
  "isSelectionField" in field && field.isSelectionField === true;

/** Names a field, so rows read through a CTE decode by name. */
function named(field: SortColumn, name: string): SQL.Aliased {
  if (is(field, SQL.Aliased)) {
    if (field.fieldAlias === name) return field;
    return isSubqueryField(field) ? sql`${field}`.as(name) : field.sql.as(name);
  }
  if (is(field, SQL)) return field.as(name);
  return sql`${field}`.mapWith(field).as(name);
}

/** Reads a named field of a CTE, which keeps the field's decoder. */
function fieldOf(source: NamedFields, name: string): SQL.Aliased {
  const field = source[name];
  if (!field) panic(`paginateBy read ${name} from a CTE that does not name it`);
  return field;
}

const fieldsOf = (source: NamedFields, names: readonly string[]): NamedFields =>
  Object.fromEntries(names.map((name) => [name, fieldOf(source, name)]));

const valuesOf = <T>(row: Readonly<Record<string, T>>, names: readonly string[], prefix = "") =>
  Object.fromEntries(names.map((name) => [name, row[`${prefix}${name}`]]));

/** Names the kernel gives the totals, sort keys and page marker it adds to a list's own fields. */
const RESERVED_NAME = /^(?:sort_\d+|total_|on_page$)/u;

/**
 * Cuts one page of `rows` in `orderBy` order, with `totalCount` and `totals`
 * over the whole filtered set. One statement reads the page with each total as
 * a window over the filtered rows, so the page and its totals share a snapshot.
 * A page with no rows reads nothing more at offset 0, where the filtered set is
 * empty. Past the end, one more statement reads the totals, and only when rows
 * have arrived up to the offset does one statement read the totals and the page
 * together. `orderBy` must end in a key that is unique within `rows`. A list
 * the user sorts goes through `paginate`.
 */
export async function paginateBy<
  TFields extends Fields,
  TRows extends PgSelect,
  TTotals extends Totals = Record<never, never>,
>(
  scope: { readonly tx: ReadTx },
  window: { readonly limit: number; readonly offset: number },
  source: PageSource<TFields, TRows, TTotals> & {
    readonly orderBy: readonly (readonly [SortColumn, Direction])[];
  },
): Promise<PageOf<TRows, TTotals>> {
  const keys = Object.keys(source.select);
  const reserved = keys.find((key) => RESERVED_NAME.test(key));
  if (reserved) panic(`paginateBy reserves the field name ${reserved}, which the list selected`);
  const totals = [
    ["totalCount", sql<number>`COUNT(*) OVER ()`.mapWith(Number)] as const,
    ...Object.entries(source.totals ?? {}).map(
      ([key, total]) => [key, windowTotal(total)] as const,
    ),
  ];
  const totalKeys = totals.map(([key]) => key);
  const totalFields = Object.fromEntries(totals.map(([key, total]) => [`total_${key}`, total]));
  const orderBy = source.orderBy.map(([by, direction]) => (direction === "asc" ? asc : desc)(by));
  const fields = { ...source.select, ...totalFields } satisfies Fields;
  const rows = source.rows(fields as TFields);
  // Postgres computes windows before DISTINCT, so a distinct source is paged as a CTE of its rows.
  if (rows["config"].distinct) return paginateDistinct(scope, window, source);
  const cut = (limit: number, offset: number) =>
    source
      .rows(fields as TFields)
      .orderBy(...orderBy)
      .limit(limit)
      .offset(offset);
  const page = await rows
    .orderBy(...orderBy)
    .limit(window.limit)
    .offset(window.offset);
  const [first] = page;
  if (first) return pageOf(page, first);
  if (window.offset === 0) return pageOf([], {});
  // Past the end, one statement reads the totals. When its count stops short of the offset,
  // its snapshot has no rows there either, so the empty page and those totals agree.
  const [head] = await cut(1, 0);
  if (!head) return pageOf([], {});
  if (Number(head["total_totalCount"]) <= window.offset) return pageOf([], head);
  // Rows arrived, so one statement reads the totals and the page from one snapshot.
  const sorts = source.orderBy.map(([by], index) => [`sort_${index}`, by] as const);
  const pageSelection: NamedFields = Object.fromEntries([
    ...Object.entries(source.select).map(([key, field]) => [key, named(field, key)]),
    ...sorts.map(([name, by]) => [name, named(by, name)]),
    ["on_page", sql<boolean>`true`.as("on_page")],
  ]);
  const totalsSelection: NamedFields = Object.fromEntries(
    Object.entries(totalFields).map(([key, total]) => [key, total.as(key)]),
  );
  const pageRows = scope.tx.$with("page_rows", pageSelection).as(
    source
      .rows(pageSelection as TFields)
      .orderBy(...orderBy)
      .limit(window.limit)
      .offset(window.offset)
      .getSQL(),
  );
  const pageTotals = scope.tx.$with("page_totals", totalsSelection).as(
    source
      .rows(totalsSelection as TFields)
      .limit(1)
      .getSQL(),
  );
  const together = await scope.tx
    .with(pageRows, pageTotals)
    .select({
      ...fieldsOf(pageRows, [...keys, "on_page"]),
      ...fieldsOf(pageTotals, Object.keys(totalsSelection)),
    })
    .from(pageTotals)
    .leftJoin(pageRows, sql`true`)
    .orderBy(
      ...source.orderBy.map(([, direction], index) =>
        (direction === "asc" ? asc : desc)(fieldOf(pageRows, `sort_${index}`)),
      ),
    );
  const [latest] = together;
  if (!latest) return pageOf([], {});
  return pageOf(
    together.filter((row) => row["on_page"]),
    latest,
  );

  function pageOf<T>(
    items: readonly Readonly<Record<string, T>>[],
    totalsRow: Readonly<Record<string, T>>,
  ) {
    const result: Page<unknown> = {
      items: items.map((row) => valuesOf(row, keys)),
      totalCount: Number(totalsRow["total_totalCount"] ?? 0),
      ...Object.fromEntries(totalKeys.map((key) => [key, Number(totalsRow[`total_${key}`] ?? 0)])),
    };
    return result as PageOf<TRows, TTotals>;
  }
}

/**
 * Pages a DISTINCT source through a CTE of its distinct rows, so the window
 * totals count rows after DISTINCT removes duplicates. A total other than the
 * count would read the source's own columns, which the CTE no longer exposes.
 */
function paginateDistinct<TFields extends Fields, TRows extends PgSelect, TTotals extends Totals>(
  scope: { readonly tx: ReadTx },
  window: { readonly limit: number; readonly offset: number },
  source: PageSource<TFields, TRows, TTotals> & {
    readonly orderBy: readonly (readonly [SortColumn, Direction])[];
  },
): Promise<PageOf<TRows, TTotals>> {
  if (Object.keys(source.totals ?? {}).length > 0) {
    panic("paginateBy counts a DISTINCT source but cannot total its columns");
  }
  const keys = Object.keys(source.select);
  const selection: NamedFields = Object.fromEntries([
    ...Object.entries(source.select).map(([key, field]) => [key, named(field, key)]),
    ...source.orderBy.map(([by], index) => [`sort_${index}`, named(by, `sort_${index}`)]),
  ]);
  const distinctRows = scope.tx
    .$with("distinct_rows", selection)
    .as(source.rows(selection as TFields).getSQL());
  const page: Promise<Page<unknown>> = paginateBy(scope, window, {
    select: fieldsOf(distinctRows, keys),
    rows: (fields) => scope.tx.with(distinctRows).select(fields).from(distinctRows).$dynamic(),
    orderBy: source.orderBy.map(
      ([, direction], index) => [fieldOf(distinctRows, `sort_${index}`), direction] as const,
    ),
  });
  return page as Promise<PageOf<TRows, TTotals>>;
}

/**
 * Orders `rows` by the requested sort, then by `tiebreak`, and cuts the page.
 * `sortBy` names a column for every sort key the contract accepts, and the
 * tiebreak ends in a primary key, so the order is total and pages never overlap.
 */
export function paginate<
  TSort extends string,
  TFields extends Fields,
  TRows extends PgSelect,
  TTotals extends Totals = Record<never, never>,
>(
  scope: { readonly tx: ReadTx },
  request: PageRequest<TSort>,
  source: PageSource<TFields, TRows, TTotals> & {
    readonly sortBy: { readonly [K in TSort]: SortColumn };
    readonly tiebreak: readonly [...SortColumn[], AnyPgColumn<{ isPrimaryKey: true }>];
  },
): Promise<PageOf<TRows, TTotals>> {
  const sort = source.sortBy[request.sort];
  const columns = [sort, ...source.tiebreak.filter((column) => column !== sort)];
  return paginateBy(scope, request, {
    select: source.select,
    rows: source.rows,
    orderBy: columns.map((column) => [column, request.order] as const),
    totals: source.totals,
  });
}
