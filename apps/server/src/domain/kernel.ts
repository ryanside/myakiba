import { ElysiaCustomStatusResponse, status } from "elysia";
import * as z from "zod";
import type { RequestLogger } from "evlog";
import { SQL, asc, desc, is, sql } from "drizzle-orm";
import type { AnyColumn } from "drizzle-orm";
import type { AnyPgColumn, PgSelect } from "drizzle-orm/pg-core";
import { Panic, Result, UnhandledException, panic } from "better-result";
import type { AnyTaggedError, Err } from "better-result";
import { db } from "@myakiba/db/client";
import type { ReadTx } from "@myakiba/db/tx";
import type { Page, PageRequest } from "@myakiba/contracts/shared/pagination";
import type { AnyFailure, Category } from "./failure";
import type { Viewer } from "./viewer";
import { tagged } from "./tagged";

import {
  FAILURE_STATUS,
  isCommitted,
  isProceed,
  isFailure,
  bodies,
  poolBodies,
  befores,
  retries,
  recoveries,
  operationals,
  SNAPSHOT,
  snapshots,
  streams,
  compositions,
  proceeding,
  committed,
} from "./operations";
import type {
  Statement,
  ReadScope,
  AnyResult,
  AnyOp,
  RecoveryScope,
  CommandScope,
  Leftover,
  OpConfig,
  Op,
  Prepared,
  Placeholders,
  CompositionScope,
  StreamOp,
  StreamScope,
  Recover,
} from "./operations";

export { query, command, compose, stream } from "./operations";
export type { Op, CommandScope, InputOf, CompositionScope } from "./operations";

/** An unanswerable child outcome travels through Result combinators without throwing. */
const executionIdentity = Symbol("kernel execution outcome");
const ExecutionFailure = tagged("ExecutionFailed")<{
  readonly cause: Panic | AnyTaggedError;
  readonly operation: OpConfig<string>;
  readonly childAction?: string;
}>;

export interface ExecutionFailed extends InstanceType<typeof ExecutionFailure> {
  readonly [executionIdentity]: true;
}
const executionReceivers = new WeakMap<object, OpConfig<string>>();
function isExecutionFailed(
  error: Parameters<typeof ExecutionFailure.is>[0],
): error is ExecutionFailed {
  return ExecutionFailure.is(error) && executionReceivers.has(error);
}
const executionFailedGuard = Object.freeze({ is: isExecutionFailed });
export { executionFailedGuard as ExecutionFailed };

/** Only this module can construct and brand an outcome. Its trusted metadata is immutable. */
function executionFailed(
  props: ConstructorParameters<typeof ExecutionFailure>[0],
  receiver: OpConfig<string>,
): ExecutionFailed {
  const failure: ExecutionFailed = Object.assign(
    new ExecutionFailure({
      ...props,
      operation: Object.freeze({
        action: props.operation.action,
        failure: props.operation.failure,
      }),
    }),
    { [executionIdentity]: true as const },
  );
  executionReceivers.set(failure, receiver);
  Object.freeze(failure);
  return failure;
}

/**
 * The one way a route reads or writes user data. A domain module exports
 * operations built with `query`, `command`, `compose` or `stream`, and a route answers with
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
const pool: ReadTx = db;
const readPrepared = <T>(statement: Prepared<T>, placeholders?: Placeholders) =>
  statement.statement.execute(placeholders);

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

/** Runs `select 1` on the pool, for the readiness check. */
export async function ping(): Promise<void> {
  await db.execute(sql`select 1`);
}

type FailureResponse<F> = F extends {
  readonly category: infer C extends Category;
  readonly message: infer M;
}
  ? ElysiaCustomStatusResponse<(typeof FAILURE_STATUS)[C], M>
  : never;

type Stopped = { readonly kind: "rollback"; readonly result: Err<unknown, Leftover> };

class Stop {
  readonly outcome: Stopped;

  constructor(outcome: Stopped) {
    this.outcome = outcome;
  }
}

/** How an operation ended, before `run` turns it into a Result or a throw. */
type Settled =
  | { readonly kind: "answer"; readonly result: Result<unknown, AnyFailure> }
  /** A deliberate `panic` or `unwrap`, possibly wrapped: never retried or recovered. */
  | {
      readonly kind: "defect";
      readonly panic: Panic;
      readonly operation?: OpConfig<string>;
      readonly childAction?: string;
    }
  /** An internal Err or a thrown value, which `retry` and `recover` may handle. */
  | {
      readonly kind: "left";
      readonly error: AnyTaggedError;
      readonly operation?: OpConfig<string>;
      readonly childAction?: string;
    };

function classify(
  cause: unknown,
  returningOp: OpConfig<string>,
): Exclude<Settled, { readonly kind: "answer" }> {
  if (isExecutionFailed(cause)) {
    const receivedHere = executionReceivers.get(cause) === returningOp;
    return {
      ...classify(cause.cause, returningOp),
      operation: receivedHere ? cause.operation : returningOp,
      childAction: cause.childAction ?? (receivedHere ? undefined : cause.operation.action),
    };
  }
  if (Panic.is(cause)) return { kind: "defect", panic: cause };
  if (UnhandledException.is(cause)) return { kind: "left", error: cause };
  return { kind: "left", error: new UnhandledException({ cause }) };
}

/** Sorts what a body, `before` or `recover` returned. A returned Panic is a defect. */
function settle(result: AnyResult, op: OpConfig<string>): Settled {
  if (result.isOk()) return { kind: "answer", result: Result.ok(result.value) };
  const error = isCommitted(result.error) ? result.error["~committed"] : result.error;
  if (isExecutionFailed(error)) return classify(error, op);
  if (Panic.is(error)) return { kind: "defect", panic: error };
  if (isFailure(error)) return { kind: "answer", result: Result.err(error) };
  return { kind: "left", error };
}

async function guarded(op: OpConfig<string>, step: () => Promise<Settled>): Promise<Settled> {
  try {
    return await step();
  } catch (error) {
    return classify(error, op);
  }
}

function bodyOf(op: AnyOp) {
  const body = bodies.get(op);
  if (!body) panic(`${op.action} was not built by query() or command(), so it has no body to run`);
  return body;
}

/** A committed failure keeps the attempt's writes. */
const keepsWrites = (error: Leftover) => isCommitted(error);

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
      const details = {
        afterCommitErrors: [
          {
            step: op.action,
            name: failure.name,
            message: failure.message,
            stack: failure.stack,
            cause: failure.cause,
          },
        ],
      };
      if (Panic.is(error)) {
        log.set(details);
        log.error(error);
      } else {
        log.warn(failure.message, details);
      }
    }
  }
}

/** Runs a query that reads the pool, one autocommit statement at a time. */
async function readPool(op: AnyOp, viewer: Viewer, input: never, log: RequestLogger) {
  const body = poolBodies.get(op);
  if (!body) panic(`${op.action} has no pool query body to run`);
  return guarded(op, async () =>
    settle(await body({ viewer, tx: pool, read: readPrepared, log }, input), op),
  );
}

async function streamStep<I, T, F extends AnyFailure, M extends string>(
  receiver: OpConfig<string>,
  viewer: Viewer,
  op: Op<I, T, F, M>,
  input: I,
  log: RequestLogger,
): Promise<Result<T, F | ExecutionFailed>> {
  if (receiver.action === op.action)
    panic(`${receiver.action} stream read ${op.action} must use a distinct action`);
  return executionResult(
    await evaluate(op as AnyOp, viewer, input as never, log),
    op,
    receiver,
  ) as Result<T, F | ExecutionFailed>;
}

/** Only a stream receives throwing reads and resumable polling reads. */
async function openStream(op: AnyOp, viewer: Viewer, input: never, log: RequestLogger) {
  const registration = streams.get(op);
  if (!registration) panic(`${op.action} has no stream body to run`);
  const scope: StreamScope = {
    viewer,
    tx: pool,
    read: readPrepared,
    log,
    readOrThrow: async (next, value) => {
      const result = await streamStep(op, viewer, next, value, log);
      if (result.isErr()) {
        if (isExecutionFailed(result.error)) throw result.error;
        log.set({ outcome: result.error.category });
        return Result.err(result.error);
      }
      return Result.ok(result.value);
    },
    poll: async (next, value) => {
      const result = await streamStep(op, viewer, next, value, log);
      if (result.isOk()) return result;
      if (isExecutionFailed(result.error)) {
        const error = result.error;
        if (Panic.is(error.cause)) throw error;
        const cause = UnhandledException.is(error.cause) ? error.cause.cause : error.cause;
        logOperationError(
          log,
          op.action,
          cause instanceof Error ? cause : new Error(String(cause)),
          error.childAction ?? error.operation.action,
        );
      } else {
        log.set({ outcome: result.error.category });
      }
      return result;
    },
  };
  return guarded(op, async () => settle(Result.ok(registration.body(scope, input)), op));
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
      return classify(error, op);
    }
    if (!isProceed(first)) return settle(first, op);
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
          if (answered.isErr() && !keepsWrites(answered.error))
            throw new Stop({ kind: "rollback", result: answered });
          return answered;
        },
        snapshots.has(op) ? SNAPSHOT : undefined,
      );
      await runEffects(op, attemptEffects, viewer, log);
      settled = settle(result, op);
    } catch (error) {
      settled =
        error instanceof Stop && error.outcome.kind === "rollback"
          ? settle(error.outcome.result, op)
          : classify(error, op);
    }
    if (settled.kind !== "left" || !retry) return settled;
    let again: boolean;
    try {
      again = retry(settled.error, attempt);
    } catch (error) {
      return classify(error, op);
    }
    if (!again) return settled;
  }
}

/** Runs `recover` with fresh operations, and answers with any defect they raised. */
async function recovered(
  op: OpConfig<string>,
  recover: Recover,
  viewer: Viewer,
  input: never,
  left: AnyTaggedError,
  log: RequestLogger,
): Promise<Settled> {
  let defect: Settled | undefined;
  const execute: RecoveryScope["execute"] = async (next, value) => {
    const child = await evaluate(next as AnyOp, viewer, value as never, log);
    if (child.kind === "defect") defect ??= child;
    return executionResult(child, next, op) as never;
  };
  const settled = await guarded(op, async () =>
    settle(await recover({ viewer, log, execute }, input, left), op),
  );
  return defect ?? settled;
}

function executionResult(
  child: Settled,
  op: OpConfig<string>,
  receiver: OpConfig<string>,
): AnyResult {
  if (child.kind === "answer") return child.result;
  return Result.err(
    executionFailed(
      {
        cause: child.kind === "defect" ? child.panic : child.error,
        operation: child.operation ?? op,
        childAction: child.childAction,
      },
      receiver,
    ),
  );
}

async function evaluate(
  op: AnyOp,
  viewer: Viewer,
  input: never,
  log: RequestLogger,
): Promise<Settled> {
  const composition = compositions.get(op);
  let settled: Settled;
  if (composition) {
    let defect: Exclude<Settled, { readonly kind: "answer" }> | undefined;
    const scope: CompositionScope<readonly AnyOp[]> = {
      viewer,
      log,
      execute: async (next, value) => {
        const child = await evaluate(next, viewer, value as never, log);
        if (child.kind === "defect") defect ??= child;
        return executionResult(child, next, op) as never;
      },
    };
    settled = await guarded(op, async () => settle(await composition(scope, input), op));
    if (defect) settled = defect;
  } else if (streams.has(op)) {
    settled = await openStream(op, viewer, input, log);
  } else if (poolBodies.has(op)) {
    settled = await readPool(op, viewer, input, log);
  } else {
    settled = await attempts(op, viewer, input, log);
    const recover = recoveries.get(op);
    if (settled.kind === "left" && recover) {
      settled = await recovered(op, recover, viewer, input, settled.error, log);
    }
  }
  if (settled.kind === "answer") return settled;
  if (settled.operation) {
    if (composition) return settled;
    return {
      ...settled,
      operation: op,
      childAction: settled.childAction ?? settled.operation.action,
    };
  }
  if (
    settled.kind === "left" &&
    !UnhandledException.is(settled.error) &&
    !operationals.get(op)?.some((declared) => settled.error instanceof declared)
  ) {
    return {
      kind: "defect",
      operation: op,
      panic: new Panic({
        message: `${op.action} answered an internal error that no recover handled; only a public failure may reach serve`,
        cause: settled.error,
      }),
    };
  }
  return { ...settled, operation: op };
}

function answer(settled: Settled): Result<unknown, AnyFailure> {
  if (settled.kind === "answer") return settled.result;
  if (settled.kind === "defect") throw settled.panic;
  if (UnhandledException.is(settled.error)) throw settled.error.cause;
  throw settled.error;
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
  return answer(await evaluate(op as AnyOp, viewer, input as never, log)) as Result<T, F>;
}

const loggedCauseSchema = z.object({
  message: z.string(),
  code: z.string().optional(),
  errno: z.string().optional(),
  detail: z.string().optional(),
  constraint: z.string().optional(),
  table: z.string().optional(),
  cause: z.unknown().optional(),
});

/** Error properties are often non-enumerable, so JSON logs need explicit cause fields. */
function errorCauses(error: Error) {
  const causes: Omit<z.infer<typeof loggedCauseSchema>, "cause" | "errno">[] = [];
  const seen = new Set<unknown>([error]);
  let current = error.cause;
  while (current !== undefined && !seen.has(current)) {
    seen.add(current);
    const parsed = loggedCauseSchema.safeParse(current);
    if (!parsed.success) {
      causes.push({ message: String(current) });
      break;
    }
    const { cause, errno, ...fields } = parsed.data;
    // Bun exposes Postgres SQLSTATE as errno, and its own driver error name as code.
    causes.push({ ...fields, code: errno ?? fields.code });
    current = cause;
  }
  return causes;
}

/** Logs an operation failure, including the driver diagnostics in its cause chain. */
function logOperationError(
  log: RequestLogger,
  action: string,
  error: Error,
  childAction?: string,
): void {
  log.error(error, { step: action, ...(childAction && { childAction }) });
  const causes = errorCauses(error);
  if (causes.length > 0) log.set({ errorCauses: causes });
  log.set({ outcome: "error" });
}

type Caller = { readonly viewer: Viewer; readonly log: RequestLogger };

type StreamValue<T> = T extends AsyncGenerator<infer V, void> ? V : never;

/**
 * Runs `op` for the signed-in caller and answers with its value, its failure's
 * status and message, or a 500. Eden sees one entry per Failure class.
 */
export function serve<I, T, M extends string>(
  caller: Caller,
  op: StreamOp<I, T, M>,
  input: NoInfer<I>,
): AsyncGenerator<T, ReturnType<() => void> | ElysiaCustomStatusResponse<500, M>>;
export function serve<I, T, F extends AnyFailure, M extends string>(
  caller: Caller,
  op: Op<I, T, F, M>,
  input: NoInfer<I>,
): Promise<T | FailureResponse<F> | ElysiaCustomStatusResponse<500, M>>;
export function serve<I, T, F extends AnyFailure, M extends string>(
  caller: Caller,
  op: Op<I, T, F, M>,
  input: NoInfer<I>,
):
  | Promise<T | FailureResponse<F> | ElysiaCustomStatusResponse<500, M>>
  | AsyncGenerator<StreamValue<T>, ReturnType<() => void> | ElysiaCustomStatusResponse<500, M>> {
  const terminal = streams.get(op as AnyOp);
  if (!terminal) return serveResult(caller, op, input);
  return (async function* () {
    const response = await serveResult(caller, op, input);
    if (response instanceof ElysiaCustomStatusResponse)
      return response as ElysiaCustomStatusResponse<500, M>;
    let last: IteratorYieldResult<StreamValue<T>> | undefined;
    try {
      for await (const value of response as T & AsyncGenerator<StreamValue<T>, void>) {
        last = { done: false, value };
        yield value;
      }
    } catch (error) {
      const childAction = isExecutionFailed(error)
        ? (error.childAction ?? error.operation.action)
        : undefined;
      const cause = isExecutionFailed(error) ? error.cause : error;
      const logged = UnhandledException.is(cause) ? cause.cause : cause;
      logOperationError(
        caller.log,
        op.action,
        logged instanceof Error ? logged : new Error(String(logged)),
        childAction,
      );
      if (!last) return status(500, op.failure) as ElysiaCustomStatusResponse<500, M>;
      yield terminal.onError(op.failure, last.value as never).value as StreamValue<T>;
    }
  })();
}

async function serveResult<I, T, F extends AnyFailure, M extends string>(
  caller: { readonly viewer: Viewer; readonly log: RequestLogger },
  op: Op<I, T, F, M>,
  input: NoInfer<I>,
): Promise<T | FailureResponse<F> | ElysiaCustomStatusResponse<500, M>> {
  caller.log.set({
    action: caller.log.getContext().action ?? op.action,
    user: { id: caller.viewer.userId },
  });
  let failed: OpConfig<string> = op;
  let childAction: string | undefined;
  try {
    const settled = await evaluate(op as AnyOp, caller.viewer, input as never, caller.log);
    if (settled.kind !== "answer") {
      failed = settled.operation ?? op;
      childAction = settled.childAction;
    }
    const result = answer(settled) as Result<T, F>;
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
    logOperationError(
      caller.log,
      failed.action,
      error instanceof Error ? error : new Error(String(error)),
      childAction,
    );
    return status(500, failed.failure) as ElysiaCustomStatusResponse<500, M>;
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
