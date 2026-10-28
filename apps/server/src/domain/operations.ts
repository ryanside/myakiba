import { tagged } from "./tagged";
import { Result, TaggedError, panic } from "better-result";
import type {
  Panic,
  AnyTaggedError,
  Err,
  InferErr,
  InferOk,
  Ok,
  UnhandledException,
} from "better-result";
import type { RequestLogger } from "evlog";
import type { ReadTx, Tx } from "@myakiba/db/tx";
import type { AnyFailure, Category } from "./failure";
import type { Viewer } from "./viewer";

export const FAILURE_STATUS = {
  bad_request: 400,
  forbidden: 403,
  conflict: 409,
  payload_too_large: 413,
  not_found: 404,
  too_many_requests: 429,
} as const satisfies Record<Category, number>;

/** A failure that answers after the command commits. Only `CommandScope.failAfterCommit` makes one. */
export type Committed<F extends AnyFailure> = { readonly "~committed": F };

/** A `before` that hands its value to the body. Only `BeforeScope.proceed` makes one. */
type Proceed<P> = { readonly "~proceed": P };

/** The brands the kernel made, so that a lookalike object is never read as one. */
const brands = new WeakSet<object>();

function brand<T extends object>(value: T): T {
  brands.add(value);
  return value;
}

export const committed = <F extends AnyFailure>(failure: F): Committed<F> =>
  brand({ "~committed": failure });
export const proceeding = <P>(value: P): Proceed<P> => brand({ "~proceed": value });

export const isCommitted = (error: Leftover): error is Committed<AnyFailure> =>
  brands.has(error) && "~committed" in error;
export const isProceed = (result: AnyResult): result is Ok<Proceed<unknown>, Leftover> =>
  result.isOk() &&
  typeof result.value === "object" &&
  result.value !== null &&
  brands.has(result.value) &&
  "~proceed" in result.value;

export function isFailure(error: Leftover): error is AnyFailure {
  return (
    TaggedError.is(error) &&
    "category" in error &&
    typeof error.category === "string" &&
    Object.hasOwn(FAILURE_STATUS, error.category)
  );
}

/** The public failure an Err stands for, after a commit or not. */
export type PublicOf<E> = E extends Committed<infer F> ? F : E extends AnyFailure ? E : never;

/** An Err the client never sees: it exists for `retry` and `recover`. */
type InternalOf<E> = E extends AnyFailure | Committed<AnyFailure> | ExecutionFailed ? never : E;

/** An unanswerable child outcome travels through Result combinators without throwing. */
export class ExecutionFailed extends tagged("ExecutionFailed")<{
  readonly cause: Panic | AnyTaggedError;
  readonly operation: OpConfig<string>;
}> {}

/** What `retry` and `recover` receive: an internal Err, or a value that was thrown. */
type Recoverable<E> = InternalOf<E> | UnhandledException;

export type ReadScope = {
  readonly viewer: Viewer;
  readonly tx: ReadTx;
  /** The request's wide event. The kernel sets `action`, `user` and `outcome`. */
  readonly log: RequestLogger;
};

/** The values a prepared read binds to its `sql.placeholder(name)` slots. */
export type Placeholders = Readonly<Record<string, string | number | boolean | Date | null>>;
export type Statement<T> = { readonly execute: (placeholders?: Placeholders) => Promise<T> };
export type Prepared<T> = { readonly statement: Statement<T> };

/** A query without `snapshot` reads from the pool, so it can also run reads built once by `prepared()`. */
type PoolScope = ReadScope & {
  readonly read: <T>(statement: Prepared<T>, placeholders?: Placeholders) => Promise<T>;
};

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

export type RecoveryScope = Pick<ReadScope, "viewer" | "log"> & {
  /**
   * Runs a fresh operation. A Failure comes back as an Err; an unanswerable child
   * outcome comes back as ExecutionFailed, preserving its operation through Result.gen.
   * A defect raised here always wins: once `recover` settles, the kernel answers with
   * it even if `recover` caught it, so a recovery can never hide a broken invariant.
   */
  readonly execute: <I, T, F extends AnyFailure, M extends string>(
    op: Op<I, T, F, M>,
    input: NoInfer<I>,
  ) => Promise<Result<T, F | ExecutionFailed>>;
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

export type OpConfig<M extends string, O extends Operational = Operational> = {
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
export type Op<I, T, F extends AnyFailure, M extends string> = OpConfig<M> & {
  /** Type-only: carries the operation's types for `serve`. Never set at runtime. */
  readonly "~types"?: {
    readonly input: (input: I) => void;
    readonly value: T;
    readonly failure: F;
  };
};

/** What an Err holds: a Failure, an internal tagged error, a Panic, or a committed failure. */
export type Leftover = AnyTaggedError | Committed<AnyFailure>;
export type AnyResult = Result<unknown, Leftover>;

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

export type AnyOp = Op<never, unknown, AnyFailure, string>;
type Body = (scope: never, input: never) => Promise<AnyResult>;
type Hook = (scope: BeforeScope, input: never) => Promise<AnyResult>;
type Retry = (error: AnyTaggedError, attempt: number) => boolean;
export type Recover = (
  scope: RecoveryScope,
  input: never,
  error: AnyTaggedError,
) => Promise<AnyResult>;

export const bodies = new WeakMap<AnyOp, Body>();
export const befores = new WeakMap<AnyOp, Hook>();
export const retries = new WeakMap<AnyOp, Retry>();
export const recoveries = new WeakMap<AnyOp, Recover>();
export const operationals = new WeakMap<AnyOp, Operational>();

export const SNAPSHOT = { isolationLevel: "repeatable read", accessMode: "read only" } as const;
export const snapshots = new WeakSet<AnyOp>();
export const poolReads = new WeakSet<AnyOp>();
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

export type StreamOp<I, T, M extends string> = Op<I, AsyncGenerator<T, void>, never, M> & {
  readonly "~stream": true;
};
export const streams = new WeakMap<AnyOp, (message: string, last: never) => Ok<unknown, never>>();

export type StreamScope = PoolScope & {
  readonly execute: <I, T, F extends AnyFailure, M extends string>(
    op: Op<I, T, F, M>,
    input: NoInfer<I>,
  ) => Promise<Result<T, F>>;
};

/** An event stream whose route delegates with yield* serve(...), keeping the framework's generator lifecycle. */
export function stream<I, T, const M extends string>(
  config: OpConfig<M> & {
    readonly onError: (message: string, last: T) => T;
  },
  body: (scope: StreamScope, input: I) => AsyncGenerator<T, void>,
): StreamOp<I, T, M> {
  const op = { action: config.action, failure: config.failure, "~stream": true as const };
  bodies.set(op, (async (scope, input) => Result.ok(body(scope as StreamScope, input))) as Body);
  poolReads.add(op);
  streams.set(op, (message, last) => Result.ok(config.onError(message, last)));
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
  C extends Result<unknown, AnyFailure | ExecutionFailed> = never,
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
  C extends Result<unknown, AnyFailure | ExecutionFailed> = never,
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

type InputOf<O> = O extends Op<infer I, infer _T, infer _F, infer _M> ? I : never;
type ValueOf<O> = O extends Op<infer _I, infer T, infer _F, infer _M> ? T : never;
type ErrorOf<O> = O extends Op<infer _I, infer _T, infer F, infer _M> ? F : never;
export type CompositionScope<Steps extends readonly AnyOp[]> = Pick<ReadScope, "viewer" | "log"> & {
  readonly execute: <O extends Steps[number]>(
    op: O,
    input: NoInfer<InputOf<O>>,
  ) => Promise<Result<ValueOf<O>, ErrorOf<O> | ExecutionFailed>>;
};

export const compositions = new WeakMap<
  AnyOp,
  (scope: CompositionScope<readonly AnyOp[]>, input: never) => Promise<AnyResult>
>();

/** Plans in before and composes operations without opening an extra transaction. Each command owns its writes, recovery, effects and failure response. */
export function compose<
  I,
  B extends AnyResult,
  R extends AnyResult,
  const M extends string,
  const Steps extends readonly AnyOp[],
>(
  config: {
    readonly action: string;
    readonly failure: M;
    readonly steps: Steps;
    readonly before: (
      scope: CompositionScope<Steps>,
      input: I,
    ) => Promise<B & Handled<InferErr<B>, false, never> & NoPanic<InferErr<B>>>;
  },
  body: (
    scope: CompositionScope<Steps>,
    input: InferOk<B>,
  ) => Promise<R & Checked<R, InferErr<R>, false>>,
): Op<I, InferOk<R>, PublicOf<InferErr<B> | InferErr<R>>, M | Steps[number]["failure"]> {
  const op = { action: config.action, failure: config.failure };
  compositions.set(op, async (scope, input) => {
    const declared = scope as CompositionScope<Steps>;
    const checked: CompositionScope<Steps> = {
      viewer: scope.viewer,
      log: scope.log,
      execute: async (next, value) => {
        if (!config.steps.includes(next))
          panic(`${op.action} tried to execute undeclared step ${next.action}`);
        return declared.execute(next, value);
      },
    };
    const planning: CompositionScope<Steps> = {
      ...checked,
      execute: async (next, value) => {
        if (!poolReads.has(next) && !snapshots.has(next))
          panic(`${op.action} tried to execute command ${next.action} in before`);
        return checked.execute(next, value);
      },
    };
    const plan = await config.before(planning, input);
    if (plan.isErr()) return plan;
    return body(checked, plan.value as InferOk<B>);
  });
  return op;
}
