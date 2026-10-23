/**
 * Each `@ts-expect-error` is a past mistake rewritten against the kernel, so
 * `tsc -b` fails if one of them compiles. `bun scripts/replay.ts --types kernel`
 * removes the directives and checks that each line fails with its own error.
 */
import { Elysia, status } from "elysia";
import { evlog } from "evlog/elysia";
import { createRequestLogger } from "evlog";
import { order } from "@myakiba/db/schema/figure";
import type { Tx } from "@myakiba/db/tx";
import type { PageRequest } from "@myakiba/contracts/shared/pagination";
import { betterAuth } from "@/middleware/better-auth";
import { privateApi } from "@/boundary/private-api";
import { Orders } from "@/routers/orders/module";
import { command, fail, failAfterCommit, ok, paginate, proceed, query, serve } from "./kernel";

const config = { action: "probe", failure: "Probe failed" };

// @ts-expect-error 58a5d423: a list query grew positional params; a body takes one input
query(config, async (_scope, _limit: number, _offset: number) => ok(1));

query(config, async (scope) => {
  // @ts-expect-error a read that starts writing; a query's ReadTx has no delete
  await scope.tx.delete(order);
  return ok(1);
});

// @ts-expect-error 87ebc2a0: a handler returned the status function; a body returns an Outcome
command(config, async () => status);

// @ts-expect-error b14fda39: a route matched a code nobody threw; categories are a closed set
command(config, async () => fail("not_fund", "Order item not found"));

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

  return ok(
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
void (ok("List order saved").value satisfies "List order saved");
ok({ listIds: ["l1"] }).value.listIds.push("l2");

query(config, async (scope) => {
  const owned = scope.tx.$with("owned").as(scope.tx.select({ id: order.id }).from(order));
  // @ts-expect-error a read that writes through a CTE; a ReadTx's with() only selects
  await scope.tx.with(owned).delete(order);
  return ok(await scope.tx.with(owned).select().from(owned));
});

command(
  {
    ...config,
    before: async (scope) => {
      // @ts-expect-error a slow step that writes before the transaction; its ReadTx has no insert
      await scope.tx.insert(order).values({ userId: "u1", title: "Order" });
      return proceed(1);
    },
  },
  async (_scope, input: number) => ok(input),
);

const writesBeforeTheTransaction = {
  ...config,
  before: async (scope: { readonly tx: Tx }) => {
    await scope.tx.insert(order).values({ userId: "u1", title: "Order" });
    return proceed(1);
  },
};
// @ts-expect-error a before held in a variable took a Tx, got the pool and committed its write early
command(writesBeforeTheTransaction, async () => ok(1));

type ValuesOf<O> = O extends { readonly "~types"?: { readonly value: infer T } } ? T : never;
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

const proceeds = command(
  { ...config, before: async (_scope, input: { readonly id: string }) => proceed(input.id) },
  async (_scope, id) => ok(id.length),
);
void (true satisfies Equal<ValuesOf<typeof proceeds>, number>);
void (true satisfies Equal<FailuresOf<typeof proceeds>, never>);

const mayFail = command(
  {
    ...config,
    before: async (_scope, input: { readonly id: string }) =>
      input.id ? proceed(input.id) : fail("bad_request", "No id"),
  },
  async (_scope, id) => ok(id.length),
);
void (true satisfies Equal<ValuesOf<typeof mayFail>, number>);
void (true satisfies Equal<
  FailuresOf<typeof mayFail>,
  { readonly ok: false; readonly category: "bad_request"; readonly message: "No id" }
>);

command(config, async (scope) => {
  scope.afterCommit(async (committed) => {
    // @ts-expect-error commit effects read the pool, never a transaction that can write
    await committed.tx.delete(order);
  });
  return ok(1);
});

const recovered = command(
  {
    ...config,
    recover: async (scope, input: { readonly found: boolean }) => {
      // @ts-expect-error recovery cannot reach a rolled-back transaction
      await scope.tx.delete(order);
      return input.found ? ok(false) : fail("not_found", "Recovery failed");
    },
  },
  async (_scope, input: { readonly found: boolean }) =>
    input.found ? ok("written") : fail("conflict", "Write failed"),
);
void (true satisfies Equal<ValuesOf<typeof recovered>, "written" | boolean>);
void (true satisfies Equal<
  FailuresOf<typeof recovered>,
  | ReturnType<typeof fail<"not_found", "Recovery failed">>
  | ReturnType<typeof fail<"conflict", "Write failed">>
>);

// @ts-expect-error only a command body can request a failure after commit
query(config, async () => failAfterCommit("conflict", "Saved failure"));

command(
  // @ts-expect-error before runs outside a transaction and cannot request a commit
  { ...config, before: async () => failAfterCommit("conflict", "Saved failure") },
  async () => ok(1),
);

command(
  // @ts-expect-error recovery runs fresh operations and cannot request a commit itself
  { ...config, recover: async () => failAfterCommit("conflict", "Saved failure") },
  async () => ok(1),
);

const committedFailure = command(config, async (_scope, input: { readonly found: boolean }) =>
  input.found ? ok(1) : failAfterCommit("conflict", "Saved failure"),
);
void (true satisfies Equal<ValuesOf<typeof committedFailure>, number>);
void (true satisfies Equal<
  FailuresOf<typeof committedFailure>,
  ReturnType<typeof fail<"conflict", "Saved failure">>
>);

// @ts-expect-error an unexpected 500 is always a throw, never an expected failure
command(config, async () => fail("internal_error", "Unexpected failure"));
