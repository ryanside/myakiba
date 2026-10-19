import { status } from "elysia";
import type { ElysiaCustomStatusResponse } from "elysia";
import type { RequestLogger } from "evlog";
import { asc, desc } from "drizzle-orm";
import type { AnyColumn, SQL } from "drizzle-orm";
import type { AnyPgColumn, PgSelect } from "drizzle-orm/pg-core";
import { db } from "@myakiba/db/client";
import type { ReadTx, Tx } from "@myakiba/db/tx";
import type { PageRequest } from "@myakiba/contracts/shared/pagination";
import type { Viewer } from "./viewer";

/**
 * The one way a route reads or writes user data. A domain module exports
 * operations built with `query` or `command`, and a route answers with
 * `serve(ctx, Module.op, input)`.
 *
 * Every call runs in one transaction. A body that returns `fail(...)` or throws
 * rolls it back. `serve` turns the outcome into the response: the value, the
 * failure's status and message, or a logged 500 with the operation's `failure`.
 */

const FAILURE_STATUS = {
  not_found: 404,
} as const;

type FailureCategory = keyof typeof FAILURE_STATUS;

type Ok<T> = { readonly ok: true; readonly value: T };
type Failure<C extends FailureCategory = FailureCategory, M extends string = string> = {
  readonly ok: false;
  readonly category: C;
  readonly message: M;
};
type Outcome<T, F extends Failure> = Ok<T> | F;

/** Splits what a body returns, so a body that never fails has no failure entry. */
type ValueOf<R> = R extends Ok<infer T> ? T : never;
type FailureOf<R> = Extract<R, Failure>;

export function ok<const T>(value: T): Ok<T> {
  return { ok: true, value };
}

/** An expected failure. The message is the response body. */
export function fail<const C extends FailureCategory, const M extends string>(
  category: C,
  message: M,
): Failure<C, M> {
  return { ok: false, category, message };
}

type ReadScope = {
  readonly viewer: Viewer;
  readonly tx: ReadTx;
  /** The request's wide event. The kernel sets `action`, `user` and `outcome`. */
  readonly log: RequestLogger;
};

type Scope = Omit<ReadScope, "tx"> & { readonly tx: Tx };

type OpConfig<M extends string> = {
  /** The wide event's `action`, such as "orders.delete_item". */
  readonly action: string;
  /** The 500 body when the body throws. */
  readonly failure: M;
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

const bodies = new WeakMap<
  AnyOp,
  (scope: Scope, input: never) => Promise<Outcome<unknown, Failure>>
>();

/** A read. The body takes the scope and one input object, never positional params. */
export function query<I, R extends Ok<unknown> | Failure, const M extends string>(
  config: OpConfig<M>,
  body: (scope: ReadScope, input: I) => Promise<R>,
): Op<I, ValueOf<R>, FailureOf<R>, M> {
  const op = { action: config.action, failure: config.failure };
  bodies.set(op, body);
  return op;
}

/** A write. Everything the body does through `scope.tx` commits together or not at all. */
export function command<I, R extends Ok<unknown> | Failure, const M extends string>(
  config: OpConfig<M>,
  body: (scope: Scope, input: I) => Promise<R>,
): Op<I, ValueOf<R>, FailureOf<R>, M> {
  const op = { action: config.action, failure: config.failure };
  bodies.set(op, body);
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
  try {
    return await db.transaction(async (tx) => {
      const outcome = await body({ viewer, tx, log }, input as never);
      if (!outcome.ok) throw new Rollback(outcome);
      return outcome as Ok<T>;
    });
  } catch (error) {
    if (error instanceof Rollback) return error.failure as F;
    throw error;
  }
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
  caller.log.set({ action: op.action, user: { id: caller.viewer.userId } });
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

type SortColumn = AnyColumn | SQL;

/**
 * Orders `rows` by the requested sort, then by `tiebreak`, and cuts the page.
 * `sortBy` names a column for every sort key the contract accepts, and the
 * tiebreak ends in a primary key, so the order is total and pages never overlap.
 */
export function paginate<TSort extends string, TRows extends PgSelect>(
  request: PageRequest<TSort>,
  source: {
    readonly rows: TRows;
    readonly sortBy: { readonly [K in TSort]: SortColumn };
    readonly tiebreak: readonly [...SortColumn[], AnyPgColumn<{ isPrimaryKey: true }>];
  },
): TRows {
  const direction = request.order === "asc" ? asc : desc;
  const sort = source.sortBy[request.sort];
  const columns = [sort, ...source.tiebreak.filter((column) => column !== sort)];
  return source.rows
    .orderBy(...columns.map((column) => direction(column)))
    .limit(request.limit)
    .offset(request.offset);
}
