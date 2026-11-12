/**
 * Each `@ts-expect-error` is a past mistake rewritten against the kernel, so
 * `tsc -b` fails if one of them compiles. `bun scripts/replay.ts --types kernel`
 * removes the directives and checks that each line fails with its own error.
 */
import { Elysia, status } from "elysia";
import type { ElysiaCustomStatusResponse } from "elysia";
import type { Treaty } from "@elysiajs/eden";
import { Panic, Result, UnhandledException } from "better-result";
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
import { command, paginate, query, serve } from "./kernel";
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
  .delete("/:orderId/items/:collectionId", (ctx) => {
    // @ts-expect-error 5a51f519: a route without a session reached user data; it has no viewer
    const sessionCaller: Parameters<typeof serve>[0] = ctx;
    return serve(sessionCaller, Orders.removeItem, ctx.params);
  });

// @ts-expect-error a hand-built viewer; only the auth macro creates one
const handBuiltViewer: Parameters<typeof serve>[0]["viewer"] = { userId: "u1" };
void serve({ viewer: handBuiltViewer, log: createRequestLogger() }, Orders.removeItem, {
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

command(
  {
    ...config,
    before: async (scope) => scope.proceed(1),
    reserve: async (tx, _viewer, input) => {
      await tx.insert(order).values({ userId: "u1", title: "Order" });
      return input;
    },
    store: async (input) => Result.ok(input),
  },
  async (_scope, input: number) => Result.ok(input),
);

command(
  {
    ...config,
    before: async (scope) => scope.proceed(1),
    reserve: async (_tx, _viewer, input) => input,
    store: async (...handed) => {
      // @ts-expect-error store runs outside any transaction: it is handed reserve's value and no Tx
      const [value, tx]: [number, Tx] = handed;
      return Result.ok(tx ? value : 0);
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

// @ts-expect-error an unexpected 500 is always a throw, never an expected failure
void Failure("Unexpected", "internal_error", "Unexpected failure");

// @ts-expect-error a thrown value is the kernel's to classify; a body never answers one
query(config, async () => Result.err(new UnhandledException({ cause: "boom" })));

const Absent = tagged("Absent");

// @ts-expect-error an internal error it does not list would reach serve as a 500 nobody chose
query(config, async () => Result.err(new Absent({ message: "gone" })));

// @ts-expect-error a command's internal error must be listed in operational
command(config, async (_scope, input: { readonly gone: boolean }) =>
  input.gone ? Result.err(new Absent({ message: "gone" })) : Result.ok(1),
);

command(
  {
    ...config,
    // @ts-expect-error an internal error from before must be listed in operational
    before: async (scope, input: number) =>
      input > 0 ? scope.proceed(input) : Result.err(new Absent({ message: "gone" })),
  },
  async (_scope, input) => Result.ok(input),
);

// @ts-expect-error a defect is thrown with panic(...); a body never returns a Panic as an Err
command(config, async () => Result.err(new Panic({ message: "defect" })));

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

declare function helper(): Promise<
  Result<number, InstanceType<typeof NoId> | DependencyUnavailable>
>;
const composed = command({ ...config, operational: [DependencyUnavailable] }, async () =>
  Result.gen(async function* () {
    const value = yield* Result.await(helper());
    return Result.ok(value);
  }),
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

const unreachable = () => new DependencyUnavailable({ dependency: "redis", reason: "down" });

// An operation that lists an internal error's class answers it with its logged 500.
const outage = query(
  { ...config, operational: [DependencyUnavailable] },
  async (_scope, input: number) => (input > 0 ? Result.ok(input) : Result.err(unreachable())),
);
void (true satisfies Equal<FailuresOf<typeof outage>, never>);
command({ ...config, operational: [DependencyUnavailable] }, async (_scope, input: number) =>
  input > 0 ? Result.ok(input) : Result.err(unreachable()),
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
  input > 0 ? Result.err(unreachable()) : Result.err(new Absent({ message: "gone" })),
);

command(
  { ...config, operational: [DependencyUnavailable] },
  // @ts-expect-error a command answers with its 500 only the errors it lists
  async (_scope, input: number) =>
    input > 0 ? Result.ok(input) : Result.err(new Absent({ message: "gone" })),
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
