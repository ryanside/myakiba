import { status } from "elysia";
import type { ElysiaCustomStatusResponse } from "elysia";
import type { RequestLogger } from "evlog";
import { SQL, asc, desc, is, sql } from "drizzle-orm";
import type { AnyColumn } from "drizzle-orm";
import type { AnyPgColumn, PgSelect } from "drizzle-orm/pg-core";
import { db } from "@myakiba/db/client";
import type { ReadTx, Tx } from "@myakiba/db/tx";
import type { Page, PageRequest } from "@myakiba/contracts/shared/pagination";
import type { Viewer } from "./viewer";

/**
 * The one way a route reads or writes user data. A domain module exports
 * operations built with `query` or `command`, and a route answers with
 * `serve(ctx, Module.op, input)`.
 *
 * A command runs in one transaction. A body that returns `fail(...)` or throws
 * rolls it back; `failAfterCommit(...)` saves its writes before answering a failure.
 * A query reads from the pool, so its parallel reads run on
 * separate connections and may see different commits; a query whose reads must
 * agree sets `snapshot: true` and reads one snapshot in one transaction. A
 * command whose slow work must not hold a connection does it in `before`, which
 * reads from the pool before the transaction opens. `serve` turns the outcome
 * into the response: the value, the failure's status and message, or a logged
 * 500 with the operation's `failure`.
 */

const FAILURE_STATUS = {
  bad_request: 400,
  forbidden: 403,
  conflict: 409,
  payload_too_large: 413,
  not_found: 404,
  too_many_requests: 429,
} as const;

type FailureCategory = keyof typeof FAILURE_STATUS;

type Ok<T> = { readonly ok: true; readonly value: T };
type Failure<C extends FailureCategory = FailureCategory, M extends string = string> = {
  readonly ok: false;
  readonly category: C;
  readonly message: M;
};
type Outcome<T, F extends Failure> = Ok<T> | F;
type CommittedFailure<F extends Failure = Failure> = { readonly afterCommit: F };
type CommandResult = Ok<unknown> | Failure | CommittedFailure;

type Proceed<P> = { readonly proceed: P };
type BeforeResult = Ok<unknown> | Failure | Proceed<unknown>;
type HandoffOf<B> = B extends Proceed<infer P> ? P : never;

/** Splits what a body returns, so a body that never fails has no failure entry. */
type ValueOf<R> = R extends Ok<infer T> ? T : never;
type FailureOf<R> = R extends CommittedFailure<infer F> ? F : Extract<R, Failure>;

/** A message keeps its literal type for Eden. Any other body keeps the shape it has. */
export function ok<const T extends string>(value: T): Ok<T>;
export function ok<T>(value: T): Ok<T>;
export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

/** An expected failure. The message is the response body. */
export function fail<const C extends FailureCategory, const M extends string>(
  category: C,
  message: M,
): Failure<C, M> {
  return { ok: false, category, message };
}

/** Commits a command's writes and effects, then answers with an expected failure. */
export function failAfterCommit<const C extends FailureCategory, const M extends string>(
  category: C,
  message: M,
): CommittedFailure<Failure<C, M>> {
  return { afterCommit: fail(category, message) };
}

/** Ends a command's `before` and runs its body in the transaction with `value`. */
export function proceed<P>(value: P): Proceed<P> {
  return { proceed: value };
}

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

export type CommandScope = Omit<ReadScope, "tx"> & {
  readonly tx: Tx;
  /** Runs only after this attempt commits, reading the pool. A rollback discards its callbacks. */
  readonly afterCommit: (effect: (scope: ReadScope) => Promise<void>) => void;
};

type RecoveryScope = Pick<ReadScope, "viewer" | "log"> & {
  readonly execute: <I, T, F extends Failure, M extends string>(
    op: Op<I, T, F, M>,
    input: NoInfer<I>,
  ) => Promise<Outcome<T, F>>;
};

type CommandConfig<I, R, M extends string> = OpConfig<M> & {
  /** Decides whether a thrown transaction should run again, starting at attempt 1. */
  readonly retry?: (error: Error, attempt: number) => boolean;
  /** Runs after rollback, including a failed before, with access only to fresh operations. */
  readonly recover?: (scope: RecoveryScope, input: I, error: Error) => Promise<R>;
};

type OpConfig<M extends string> = {
  /** The wide event's `action`, such as "orders.delete_item". */
  readonly action: string;
  /** The 500 body when the body throws. */
  readonly failure: M;
};

type QueryConfig<M extends string> = OpConfig<M> & {
  /** Reads every statement from one snapshot, for a body whose reads must agree with each other. */
  readonly snapshot?: true;
};

/** Only `serve` and `run` can execute an operation, because its body lives in `bodies`. */
type Op<I, T, F extends Failure, M extends string> = OpConfig<M> & {
  /** Type-only: carries the operation's types for `serve`. Never set at runtime. */
  readonly "~types"?: {
    readonly input: (input: I) => void;
    readonly value: T;
    readonly failure: F;
  };
};

type AnyOp = Op<never, unknown, Failure, string>;

const bodies = new WeakMap<AnyOp, (scope: never, input: never) => Promise<CommandResult>>();

const befores = new WeakMap<AnyOp, Before<never, BeforeResult>>();

const retries = new WeakMap<AnyOp, (error: Error, attempt: number) => boolean>();
const recoveries = new WeakMap<
  AnyOp,
  (scope: RecoveryScope, input: never, error: Error) => Promise<Outcome<unknown, Failure>>
>();

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

/** A read. The body takes the scope and one input object, never positional params. */
export function query<
  I,
  R extends Ok<unknown> | Failure,
  const M extends string,
  const S extends true | undefined = undefined,
>(
  config: QueryConfig<M> & { readonly snapshot?: S },
  body: (scope: S extends true ? ReadScope : PoolScope, input: I) => Promise<R>,
): Op<I, ValueOf<R>, FailureOf<R>, M> {
  const op = { action: config.action, failure: config.failure };
  bodies.set(op, body);
  (config.snapshot ? snapshots : poolReads).add(op);
  return op;
}

type Before<I, B extends BeforeResult> = (scope: PoolScope, input: I) => Promise<B>;

/**
 * A write. Everything the body does through `scope.tx` commits together or not at all.
 * `before` runs first, for work such as parsing or a network call, and reads the pool
 * outside the transaction. A row it read can change before the body runs, so the body
 * must re-check inside the transaction anything it writes against. Its effects outside the
 * database, such as a stored file, are never rolled back. It returns `proceed(value)` to
 * run the body with `value`, or an outcome that answers without opening a transaction.
 * `retry` reruns a thrown transaction without repeating `before`. `recover` handles a
 * thrown preparation or exhausted attempt through fresh operations after rollback.
 * Commit effects run afterwards; their errors never retry or recover committed writes.
 */
export function command<
  I,
  B extends BeforeResult,
  R extends CommandResult,
  const M extends string,
  C extends Ok<unknown> | Failure = never,
>(
  config: CommandConfig<I, C, M> & { readonly before: Before<I, B> },
  body: (scope: CommandScope, input: HandoffOf<B>) => Promise<R>,
): Op<I, ValueOf<B | R | C>, FailureOf<B | R | C>, M>;
// Only the first overload takes a `before`: it reads the pool, so it can never be handed a Tx.
export function command<
  I,
  R extends CommandResult,
  const M extends string,
  C extends Ok<unknown> | Failure = never,
>(
  config: CommandConfig<I, C, M> & { readonly before?: never },
  body: (scope: CommandScope, input: I) => Promise<R>,
): Op<I, ValueOf<R | C>, FailureOf<R | C>, M>;
export function command(
  config: CommandConfig<never, Ok<unknown> | Failure, string> & {
    readonly before?: Before<never, BeforeResult>;
  },
  body: (scope: CommandScope, input: never) => Promise<CommandResult>,
): AnyOp {
  const op = { action: config.action, failure: config.failure };
  bodies.set(op, body);
  if (config.before) befores.set(op, config.before);
  if (config.retry) retries.set(op, config.retry);
  if (config.recover) recoveries.set(op, config.recover);
  return op;
}

type FailureResponse<F extends Failure> =
  F extends Failure<infer C, infer M>
    ? ElysiaCustomStatusResponse<(typeof FAILURE_STATUS)[C], M>
    : never;

class Rollback {
  readonly failure: Failure;

  constructor(failure: Failure) {
    this.failure = failure;
  }
}

function bodyOf(op: AnyOp) {
  const body = bodies.get(op);
  if (!body) throw new Error(`${op.action} was not built by query() or command()`);
  return body;
}

/** Runs `op` and returns its outcome. Routes call `serve`; tests call this. */
export async function run<I, T, F extends Failure, M extends string>(
  viewer: Viewer,
  op: Op<I, T, F, M>,
  input: NoInfer<I>,
  log: RequestLogger,
): Promise<Outcome<T, F>> {
  const body = bodyOf(op as AnyOp);
  if (poolReads.has(op as AnyOp)) {
    const read = body as (scope: PoolScope, input: never) => Promise<Outcome<T, F>>;
    return read({ viewer, tx: pool, read: readPrepared, log }, input as never);
  }
  let outcome: Outcome<T, F>;
  let effects: ((scope: ReadScope) => Promise<void>)[] = [];
  try {
    const before = befores.get(op as AnyOp);
    let handoff: unknown = input;
    if (before) {
      const first = await before({ viewer, tx: pool, read: readPrepared, log }, input as never);
      if (!("proceed" in first)) return first as Outcome<T, F>;
      handoff = first.proceed;
    }
    const inTransaction = body as (
      scope: CommandScope,
      input: never,
    ) => Promise<Outcome<T, F> | CommittedFailure<F>>;
    for (let attempt = 1; ; attempt += 1) {
      const attemptEffects: ((scope: ReadScope) => Promise<void>)[] = [];
      try {
        outcome = await db.transaction(
          async (tx) => {
            const result = await inTransaction(
              {
                viewer,
                tx,
                log,
                afterCommit: (effect) => {
                  attemptEffects.push(effect);
                },
              },
              handoff as never,
            );
            if ("afterCommit" in result) return result.afterCommit;
            if (!result.ok) throw new Rollback(result);
            return result as Ok<T>;
          },
          snapshots.has(op as AnyOp) ? SNAPSHOT : undefined,
        );
        effects = attemptEffects;
        break;
      } catch (error) {
        if (error instanceof Rollback) return error.failure as F;
        if (
          retries.get(op as AnyOp)?.(
            error instanceof Error ? error : new Error(String(error)),
            attempt,
          )
        )
          continue;
        throw error;
      }
    }
  } catch (error) {
    const recover = recoveries.get(op as AnyOp);
    if (!recover) throw error;
    return (await recover(
      { viewer, log, execute: (next, value) => run(viewer, next, value, log) },
      input as never,
      error instanceof Error ? error : new Error(String(error)),
    )) as Outcome<T, F>;
  }
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
  return outcome;
}

/**
 * Runs `op` for the signed-in caller and answers with its value, its failure's
 * status and message, or a 500. Eden sees one entry per failure.
 */
export async function serve<I, T, F extends Failure, M extends string>(
  caller: { readonly viewer: Viewer; readonly log: RequestLogger },
  op: Op<I, T, F, M>,
  input: NoInfer<I>,
): Promise<T | FailureResponse<F> | ElysiaCustomStatusResponse<500, M>> {
  caller.log.set({
    action: caller.log.getContext().action ?? op.action,
    user: { id: caller.viewer.userId },
  });
  try {
    const outcome = await run(caller.viewer, op, input, caller.log);
    if (outcome.ok) {
      caller.log.set({ outcome: "success" });
      return outcome.value;
    }
    caller.log.set({ outcome: outcome.category });
    return status(FAILURE_STATUS[outcome.category], outcome.message) as FailureResponse<F>;
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
  if (!field) throw new Error(`${name} is not a named field`);
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
  if (reserved) throw new Error(`paginateBy reserves the field name ${reserved}`);
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
    throw new Error("paginateBy counts a DISTINCT source but cannot total its columns");
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
