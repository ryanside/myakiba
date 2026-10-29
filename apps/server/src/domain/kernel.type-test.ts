import type { ExecutionFailed } from "./kernel";
/**
 * Each `@ts-expect-error` is a past mistake rewritten against the kernel, so
 * `tsc -b` fails if one of them compiles. `bun scripts/replay.ts --types kernel`
 * removes the directives and checks that each line fails with its own error.
 */
import { Elysia, status } from "elysia";
import type { ElysiaCustomStatusResponse } from "elysia";
import type { Treaty } from "@elysiajs/eden";
import { Panic, Result, UnhandledException } from "better-result";
import type { TaggedErrorInstance } from "better-result";
import { evlog } from "evlog/elysia";
import { createRequestLogger } from "evlog";
import { order } from "@myakiba/db/schema/figure";
import type { Tx } from "@myakiba/db/tx";
import type { PageRequest } from "@myakiba/contracts/shared/pagination";
import { betterAuth } from "@/middleware/better-auth";
import { privateApi } from "@/boundary/private-api";
import { DependencyUnavailable } from "@/lib/errors/dependency-unavailable";
import { Orders } from "@/routers/orders/module";
import { Failure } from "./failure";
import { command, compose, paginate, query, serve, stream } from "./kernel";
import { tagged } from "./tagged";

const config = { action: "probe", failure: "Probe failed" };

// @ts-expect-error 58a5d423: a list query grew positional params; a body takes one input
query(config, async (_scope, _limit: number, _offset: number) => Result.ok(1));

query(config, async (scope) => {
  // @ts-expect-error a read that starts writing; a query's ReadTx has no delete
  await scope.tx.delete(order);
  return Result.ok(1);
});

// @ts-expect-error 87ebc2a0: a handler returned the status function; a body returns a Result
command(config, async () => status);

// @ts-expect-error b14fda39: a route matched a code nobody threw; categories are a closed set
void Failure("Misspelled", "not_fund", "Order item not found");

new Elysia()
  .use(betterAuth)
  .use(evlog())
  // @ts-expect-error 5a51f519: a route without a session reached user data; it has no viewer
  .delete("/:orderId/items/:collectionId", (ctx) => serve(ctx, Orders.removeItem, ctx.params));

// @ts-expect-error a hand-built viewer; only the auth macro creates one
void serve({ viewer: { userId: "u1" }, log: createRequestLogger() }, Orders.removeItem, {
  orderId: "o1",
  collectionId: "c1",
});

query(config, async (scope, input: PageRequest<"title" | "shop">) => {
  const select = { id: order.id };
  const rows = (fields: typeof select) => scope.tx.select(fields).from(order).$dynamic();
  const sortBy = { title: order.title, shop: order.shop };

  // @ts-expect-error a1f6ff78: pages ordered by a non-unique key repeated rows; end on a primary key
  void paginate(scope, input, { select, rows, sortBy, tiebreak: [order.createdAt] });

  void paginate(scope, input, {
    select,
    rows,
    // @ts-expect-error a sort key without a column fell back to createdAt; sortBy names every key
    sortBy: { title: order.title },
    tiebreak: [order.id],
  });

  return Result.ok(
    await paginate(scope, input, { select, rows, sortBy, tiebreak: [order.createdAt, order.id] }),
  );
});

privateApi("/probe").delete("/:orderId/items/:collectionId", (ctx) =>
  serve(ctx, Orders.removeItem, ctx.params),
);

type FailuresOf<O> = O extends { readonly "~types"?: { readonly failure: infer F } } ? F : never;
// A body that never fails gives Eden no failure entry, so the list answers no 404.
void (true satisfies [FailuresOf<typeof Orders.list>] extends [never] ? true : false);

// A message body stays a literal, and an object body stays mutable, as a handler's return was.
void (Result.ok("List order saved" as const).value satisfies "List order saved");
Result.ok({ listIds: ["l1"] }).value.listIds.push("l2");

// @ts-expect-error better-result widens a string answer, which would hide its literal from Eden
command(config, async () => Result.ok("Saved"));

query(config, async (scope) => {
  const owned = scope.tx.$with("owned").as(scope.tx.select({ id: order.id }).from(order));
  // @ts-expect-error a read that writes through a CTE; a ReadTx's with() only selects
  await scope.tx.with(owned).delete(order);
  return Result.ok(await scope.tx.with(owned).select().from(owned));
});

command(
  {
    ...config,
    before: async (scope) => {
      // @ts-expect-error a slow step that writes before the transaction; its ReadTx has no insert
      await scope.tx.insert(order).values({ userId: "u1", title: "Order" });
      return scope.proceed(1);
    },
  },
  async (_scope, input: number) => Result.ok(input),
);

const writesBeforeTheTransaction = {
  ...config,
  before: async (scope: {
    readonly tx: Tx;
    readonly proceed: <P>(value: P) => Result<P, never>;
  }) => {
    await scope.tx.insert(order).values({ userId: "u1", title: "Order" });
    return scope.proceed(1);
  },
};
// @ts-expect-error a before held in a variable took a Tx, got the pool and committed its write early
command(writesBeforeTheTransaction, async () => Result.ok(1));

type ValuesOf<O> = O extends { readonly "~types"?: { readonly value: infer T } } ? T : never;
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

const proceeds = command(
  { ...config, before: async (scope, input: { readonly id: string }) => scope.proceed(input.id) },
  async (_scope, id) => Result.ok(id.length),
);
void (true satisfies Equal<ValuesOf<typeof proceeds>, number>);
void (true satisfies Equal<FailuresOf<typeof proceeds>, never>);

const NoId = Failure("NoId", "bad_request", "No id");
const mayFail = command(
  {
    ...config,
    before: async (scope, input: { readonly id: string }) =>
      input.id ? scope.proceed(input.id) : Result.err(new NoId()),
  },
  async (_scope, id) => Result.ok(id.length),
);
void (true satisfies Equal<ValuesOf<typeof mayFail>, number>);
void (true satisfies Equal<FailuresOf<typeof mayFail>, InstanceType<typeof NoId>>);

command(config, async (scope) => {
  scope.afterCommit(async (committed) => {
    // @ts-expect-error commit effects read the pool, never a transaction that can write
    await committed.tx.delete(order);
  });
  return Result.ok(1);
});

const RecoveryFailed = Failure("RecoveryFailed", "not_found", "Recovery failed");
const WriteFailed = Failure("WriteFailed", "conflict", "Write failed");
const recovered = command(
  config,
  async (_scope, input: { readonly found: boolean }) =>
    input.found ? Result.ok("written" as const) : Result.err(new WriteFailed()),
  {
    recover: async (scope, input) => {
      // @ts-expect-error recovery cannot reach a rolled-back transaction
      await scope.tx.delete(order);
      return input.found ? Result.ok(false) : Result.err(new RecoveryFailed());
    },
  },
);
void (true satisfies Equal<ValuesOf<typeof recovered>, "written" | boolean>);
void (true satisfies Equal<
  FailuresOf<typeof recovered>,
  InstanceType<typeof RecoveryFailed> | InstanceType<typeof WriteFailed>
>);

const SavedFailure = Failure("SavedFailure", "conflict", "Saved failure");
query(config, async (scope) =>
  // @ts-expect-error only a command body can request a failure after commit
  scope.failAfterCommit(new SavedFailure()),
);

command(
  {
    ...config,
    // @ts-expect-error before runs outside a transaction and cannot request a commit
    before: async (scope) => scope.failAfterCommit(new SavedFailure()),
  },
  async () => Result.ok(1),
);

command(config, async () => Result.ok(1), {
  // @ts-expect-error recovery runs fresh operations and cannot request a commit itself
  recover: async (scope) => scope.failAfterCommit(new SavedFailure()),
});

const committedFailure = command(config, async (scope, input: { readonly found: boolean }) =>
  input.found ? Result.ok(1) : scope.failAfterCommit(new SavedFailure()),
);
void (true satisfies Equal<ValuesOf<typeof committedFailure>, number>);
void (true satisfies Equal<FailuresOf<typeof committedFailure>, InstanceType<typeof SavedFailure>>);

// @ts-expect-error an unexpected 500 is always a throw, never an expected failure
void Failure("Unexpected", "internal_error", "Unexpected failure");

// @ts-expect-error a thrown value is the kernel's to classify; a body never answers one
query(config, async () => Result.err(new UnhandledException({ cause: "boom" })));

const Absent = tagged("Absent");
type AbsentError = TaggedErrorInstance<"Absent", { retryable: boolean; message: string }>;

// @ts-expect-error an internal error with no recover would reach serve as a 500 nobody chose
query(config, async () => Result.err(new Absent({ retryable: false, message: "gone" })));

// @ts-expect-error a command's internal error needs a recover to handle it
command(config, async (_scope, input: { readonly gone: boolean }) =>
  input.gone ? Result.err(new Absent({ retryable: false, message: "gone" })) : Result.ok(1),
);

command(
  {
    ...config,
    // @ts-expect-error an internal error from before needs a recover to handle it
    before: async (scope, input: number) =>
      input > 0
        ? scope.proceed(input)
        : Result.err(new Absent({ retryable: false, message: "gone" })),
  },
  async (_scope, input) => Result.ok(input),
);

command(
  config,
  async (_scope, input: { readonly gone: boolean }) =>
    input.gone ? Result.err(new Absent({ retryable: true, message: "gone" })) : Result.ok(1),
  {
    retry: (error, attempt) => {
      void (true satisfies Equal<typeof error, AbsentError | UnhandledException>);
      return error._tag === "Absent" && error.retryable && attempt < 3;
    },
    recover: async (_scope, _input, error) => {
      // @ts-expect-error recover's match must name every error it can receive
      error.match({ Absent: () => true });
      return Result.ok(error.match({ Absent: () => 0, UnhandledException: () => 1 }));
    },
  },
);

command(config, async () => Result.ok(1), {
  // @ts-expect-error recovery answers only with Failures, which the client may see
  recover: async () => Result.err(new Absent({ retryable: false, message: "gone" })),
});

// @ts-expect-error a defect is thrown with panic(...); a body never returns a Panic as an Err
command(config, async () => Result.err(new Panic({ message: "defect" })));

command(config, async () => Result.ok(1), {
  // @ts-expect-error a defect is thrown with panic(...); recover never returns a Panic as an Err
  recover: async () => Result.err(new Panic({ message: "defect" })),
});

const handoff = command(
  {
    ...config,
    before: async (scope, input: { readonly id: string; readonly page: string }) =>
      input.page === ""
        ? Result.ok({ saved: "existing" as const })
        : scope.proceed({ ...input, length: 1 }),
  },
  async (_scope, input) => {
    void (true satisfies Equal<typeof input, { id: string; page: string; length: number }>);
    return Result.ok({ saved: "created" as const, length: input.length });
  },
);
void (true satisfies Equal<
  ValuesOf<typeof handoff>,
  { saved: "existing" } | { saved: "created"; length: number }
>);

declare function helper(): Promise<Result<number, InstanceType<typeof NoId> | AbsentError>>;
const composed = command(
  config,
  async () =>
    Result.gen(async function* () {
      const value = yield* Result.await(helper());
      return Result.ok(value);
    }),
  { retry: (error) => Absent.is(error), recover: async () => Result.ok(0) },
);
void (true satisfies Equal<FailuresOf<typeof composed>, InstanceType<typeof NoId>>);

// @ts-expect-error a Failure's class fixes its message, so a site cannot answer other text
void new NoId({ message: "other" });

const PROBLEM = { challenge: "Security check", wrong_item: "Different item" } as const;
class PageRefused extends Failure(
  "PageRefused",
  "bad_request",
  (props: { readonly problem: keyof typeof PROBLEM }) => PROBLEM[props.problem],
) {}
void (true satisfies Equal<
  InstanceType<typeof PageRefused>["message"],
  "Security check" | "Different item"
>);
// @ts-expect-error a message computed from props needs those props
void new PageRefused();

/** The literals Eden reads come from a real Elysia route and the installed Eden client. */
const Missing = Failure("Missing", "not_found", "Missing row");
declare const caller: Parameters<typeof serve>[0];
const answers = command(config, async (_scope, input: { readonly id: string }) =>
  input.id ? Result.ok("saved" as const) : Result.err(new Missing()),
);
void (true satisfies Equal<
  Awaited<
    ReturnType<
      typeof serve<{ readonly id: string }, "saved", InstanceType<typeof Missing>, "Probe failed">
    >
  >,
  | "saved"
  | ElysiaCustomStatusResponse<404, "Missing row">
  | ElysiaCustomStatusResponse<500, "Probe failed">
>);
const routes = new Elysia()
  .get("/probe", () => serve(caller, answers, { id: "a" }))
  .get("/page", () => serve(caller, handoff, { id: "a", page: "" }))
  .get("/plain", () => serve(caller, proceeds, { id: "a" }));
declare const client: Treaty.Create<typeof routes>;
type ErrorOf<R> = NonNullable<Awaited<R> extends { readonly error: infer E } ? E : never>;
type ProbeError = ErrorOf<ReturnType<typeof client.probe.get>>;
void (true satisfies Equal<
  Extract<ProbeError, { status: 404 }>,
  { status: 404; value: "Missing row" }
>);
// Eden folds its own 500 into every route, so a 500 body reads as string whatever serve answers.
void (true satisfies Equal<Extract<ProbeError, { status: 500 }>, { status: 500; value: string }>);
void (true satisfies Equal<Extract<ProbeError, { status: 409 }>, never>);
type ProbeData = NonNullable<Awaited<ReturnType<typeof client.probe.get>>["data"]>;
void (true satisfies Equal<ProbeData, "saved">);
type PlainError = ErrorOf<ReturnType<typeof client.plain.get>>;
void (true satisfies Equal<Extract<PlainError, { status: 404 }>, never>);

// A recover that only rethrows still handles an internal error: rethrowing answers the 500.
command(
  config,
  async (_scope, input: { readonly gone: boolean }) =>
    input.gone ? Result.err(new Absent({ retryable: false, message: "gone" })) : Result.ok(1),
  {
    recover: async (_scope, _input, error) => {
      throw error;
    },
  },
);

const unreachable = () => new DependencyUnavailable({ dependency: "redis", reason: "down" });

// An operation that lists an internal error's class answers it with its logged 500.
const outage = query(
  { ...config, operational: [DependencyUnavailable] },
  async (_scope, input: number) => (input > 0 ? Result.ok(input) : Result.err(unreachable())),
);
void (true satisfies Equal<FailuresOf<typeof outage>, never>);
command(
  { ...config, operational: [DependencyUnavailable] },
  async (_scope, input: number) => (input > 0 ? Result.ok(input) : Result.err(unreachable())),
  {
    retry: (error) => {
      void (true satisfies Equal<typeof error, DependencyUnavailable | UnhandledException>);
      return false;
    },
  },
);
command(
  {
    ...config,
    operational: [DependencyUnavailable],
    before: async (scope, input: number) =>
      input > 0 ? scope.proceed(input) : Result.err(unreachable()),
  },
  async (_scope, input) => Result.ok(input),
);

// @ts-expect-error an operation answers with its 500 only the internal errors it lists
query({ ...config, operational: [DependencyUnavailable] }, async (_scope, input: number) =>
  input > 0
    ? Result.err(unreachable())
    : Result.err(new Absent({ retryable: false, message: "gone" })),
);

command(
  { ...config, operational: [DependencyUnavailable] },
  // @ts-expect-error a command without recover answers with its 500 only the errors it lists
  async (_scope, input: number) =>
    input > 0 ? Result.ok(input) : Result.err(new Absent({ retryable: false, message: "gone" })),
);

// @ts-expect-error a Failure answers its own status, so it is never listed as operational
query({ ...config, operational: [NoId] }, async () => Result.err(new NoId()));

query({ ...config, operational: [Panic] }, async () =>
  // @ts-expect-error a defect is thrown with panic(...), even from an operation that lists Panic
  Result.err(new Panic({ message: "defect" })),
);

query({ ...config, operational: [UnhandledException] }, async () =>
  // @ts-expect-error a thrown value is the kernel's to classify, even for an operation that lists it
  Result.err(new UnhandledException({ cause: "boom" })),
);

// @ts-expect-error a bare tagged class reads as any to TS, which would list every internal error
query({ ...config, operational: [Absent] }, async () => Result.ok(1));

const composedStep = query(
  { action: "types.step", failure: "Step failed" },
  async (_scope, input: { readonly count: number }) =>
    input.count > 0 ? Result.ok(input.count) : Result.err(new NoId()),
);
const composedWorkflow = compose(
  {
    action: "types.composed",
    failure: "Plan failed",
    steps: [composedStep],
    before: async (_scope, input: { readonly count: number }) => Result.ok(input),
  },
  (scope, input) => scope.execute(composedStep, input),
);
const composedAnswer = () => serve(caller, composedWorkflow, { count: 1 });
void (true satisfies Equal<
  Awaited<ReturnType<typeof composedAnswer>>,
  | number
  | ElysiaCustomStatusResponse<400, "No id">
  | ElysiaCustomStatusResponse<500, "Plan failed" | "Step failed">
>);
const eventStream = stream(
  { action: "types.stream", failure: "Stream failed", onError: () => 0 },
  async function* (_scope, input: { readonly count: number }) {
    yield input.count;
  },
);
const servedStream = () => serve(caller, eventStream, { count: 1 });
void (true satisfies Equal<
  ReturnType<typeof servedStream>,
  AsyncGenerator<number, ReturnType<() => void> | ElysiaCustomStatusResponse<500, "Stream failed">>
>);

const recoveryChild = query({ action: "types.child", failure: "Child failed" }, async () => {
  throw new Error("child unavailable");
});
const recoveryParent = command(
  { action: "types.recovery", failure: "Recovery failed" },
  async () => {
    throw new Error("recover me");
  },
  { recover: (scope) => scope.execute(recoveryChild, {}) },
);
const recoveryAnswer = () => serve(caller, recoveryParent, {});
void (true satisfies Equal<
  Awaited<ReturnType<typeof recoveryAnswer>>,
  ElysiaCustomStatusResponse<500, "Recovery failed">
>);

type CanConstruct<T> = T extends abstract new (...args: never[]) => object ? true : false;
void (false satisfies CanConstruct<typeof ExecutionFailed>);
