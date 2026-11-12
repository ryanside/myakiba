import { status } from "elysia";
import type { ElysiaCustomStatusResponse } from "elysia";
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

import {
  FAILURE_STATUS,
  isProceed,
  isFailure,
  bodies,
  poolBodies,
  befores,
  operationals,
  SNAPSHOT,
  snapshots,
  proceeding,
} from "./operations";
import type {
  Statement,
  AnyResult,
  AnyOp,
  CommandScope,
  Op,
  Prepared,
  Placeholders,
} from "./operations";

export { query, command } from "./operations";
export type { Op } from "./operations";

/**
 * The one way a route reads or writes user data. A domain module exports
 * operations built with `query` or `command`, and a route answers with
 * `serve(ctx, Module.op, input)`.
 *
 * A body returns a better-result `Result`. Every error a client may see is a
 * `Failure`, a class that carries its own category and literal message. Any other
 * Err is internal, and the operation must list its class in `operational`. A
 * deliberate `panic` is a defect: it answers a logged 500. Any other throw also
 * answers that 500, and so does an operational error.
 *
 * A command runs in one transaction. Any Err or throw rolls it back.
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

/** Carries an Err out of the transaction callback, so that the transaction rolls back. */
class Stop {
  readonly result: Err<unknown, AnyTaggedError>;

  constructor(result: Err<unknown, AnyTaggedError>) {
    this.result = result;
  }
}

/** How an operation ended, before `run` turns it into a Result or a throw. */
type Settled =
  | { readonly kind: "answer"; readonly result: Result<unknown, AnyFailure> }
  /** A deliberate `panic` or `unwrap`. */
  | { readonly kind: "defect"; readonly panic: Panic }
  /** An internal Err or a thrown value. */
  | { readonly kind: "left"; readonly error: AnyTaggedError };

function classify(cause: unknown): Exclude<Settled, { readonly kind: "answer" }> {
  if (Panic.is(cause)) return { kind: "defect", panic: cause };
  if (UnhandledException.is(cause)) return { kind: "left", error: cause };
  return { kind: "left", error: new UnhandledException({ cause }) };
}

/** Sorts what a body or `before` returned. A returned Panic is a defect. */
function settle(result: AnyResult): Settled {
  if (result.isOk()) return { kind: "answer", result: Result.ok(result.value) };
  if (Panic.is(result.error)) return { kind: "defect", panic: result.error };
  if (isFailure(result.error)) return { kind: "answer", result: Result.err(result.error) };
  return { kind: "left", error: result.error };
}

function bodyOf(op: AnyOp) {
  const body = bodies.get(op);
  if (!body) panic(`${op.action} was not built by query() or command(), so it has no body to run`);
  return body;
}

/** Runs a query that reads the pool, one autocommit statement at a time. */
async function readPool(op: AnyOp, viewer: Viewer, input: never, log: RequestLogger) {
  const body = poolBodies.get(op);
  if (!body) panic(`${op.action} has no pool query body to run`);
  try {
    return settle(await body({ viewer, tx: pool, read: readPrepared, log }, input));
  } catch (error) {
    return classify(error);
  }
}

/** Runs `before`, if any, then the body in one transaction. */
async function runInTransaction(
  op: AnyOp,
  viewer: Viewer,
  input: never,
  log: RequestLogger,
): Promise<Settled> {
  let handoff: unknown = input;
  const before = befores.get(op);
  if (before) {
    let first: AnyResult;
    const commits = { made: 0, open: true, running: false };
    try {
      first = await before(
        {
          viewer,
          tx: pool,
          read: readPrepared,
          log,
          proceed: (value) => Result.ok(proceeding(value)),
          commitFirst: (write) => {
            if (!commits.open) {
              panic(
                `commitFirst ran after before returned in ${op.action}; only before may commit`,
              );
            }
            commits.made += 1;
            if (commits.made > 1)
              panic(`commitFirst ran twice in ${op.action}; one run commits once`);
            commits.running = true;
            const committed = db.transaction(async (tx) => {
              const written = await write(tx);
              if (!commits.open) {
                panic(
                  `commitFirst's write finished after before returned in ${op.action}; it rolls back`,
                );
              }
              return written;
            });
            // The error reaches before when it awaits; unawaited, the run answers its own defect.
            committed
              .finally(() => {
                commits.running = false;
              })
              .catch(() => {});
            return committed;
          },
        },
        input,
      );
    } catch (error) {
      return classify(error);
    } finally {
      commits.open = false;
    }
    if (commits.running) {
      return {
        kind: "defect",
        panic: new Panic({
          message: `before returned in ${op.action} while commitFirst ran; before must await it`,
        }),
      };
    }
    if (!isProceed(first)) return settle(first);
    handoff = first.value["~proceed"];
  }
  const body = bodyOf(op);
  try {
    const result = await db.transaction(
      async (tx) => {
        const scope: CommandScope = { viewer, tx, log };
        const answered = await body(scope as never, handoff as never);
        if (answered.isErr()) throw new Stop(answered);
        return answered;
      },
      snapshots.has(op) ? SNAPSHOT : undefined,
    );
    return settle(result);
  } catch (error) {
    return error instanceof Stop ? settle(error.result) : classify(error);
  }
}

async function evaluate(
  op: AnyOp,
  viewer: Viewer,
  input: never,
  log: RequestLogger,
): Promise<Settled> {
  const settled = poolBodies.has(op)
    ? await readPool(op, viewer, input, log)
    : await runInTransaction(op, viewer, input, log);
  if (
    settled.kind === "left" &&
    !UnhandledException.is(settled.error) &&
    !operationals.get(op)?.some((declared) => settled.error instanceof declared)
  ) {
    return {
      kind: "defect",
      panic: new Panic({
        message: `${op.action} answered an internal error it does not list in operational; only a public failure may reach serve`,
        cause: settled.error,
      }),
    };
  }
  return settled;
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
 * Expected failures come back as Err. A defect throws its Panic, a throw throws the
 * value originally thrown, and an operational error throws itself.
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
function logOperationError(log: RequestLogger, action: string, error: Error): void {
  log.error(error, { step: action });
  const causes = errorCauses(error);
  if (causes.length > 0) log.set({ errorCauses: causes });
  log.set({ outcome: "error" });
}

type Caller = { readonly viewer: Viewer; readonly log: RequestLogger };

/**
 * Runs `op` for the signed-in caller and answers with its value, its failure's
 * status and message, or a 500. Eden sees one entry per Failure class.
 */
export async function serve<I, T, F extends AnyFailure, M extends string>(
  caller: Caller,
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
      // An operation may name its own outcome in place of "success".
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
      op.action,
      error instanceof Error ? error : new Error(String(error)),
    );
    return status(500, op.failure) as ElysiaCustomStatusResponse<500, M>;
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
