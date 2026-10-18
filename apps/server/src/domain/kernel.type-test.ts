/**
 * Each `@ts-expect-error` is a past mistake rewritten against the kernel, so
 * `tsc -b` fails if one of them compiles. `bun scripts/replay.ts --types kernel`
 * removes the directives and checks that each line fails with its own error.
 */
import { Elysia, status } from "elysia";
import { evlog } from "evlog/elysia";
import { createRequestLogger } from "evlog";
import { order } from "@myakiba/db/schema/figure";
import type { PageRequest } from "@myakiba/contracts/shared/pagination";
import { betterAuth } from "@/middleware/better-auth";
import { privateApi } from "@/boundary/private-api";
import { Orders } from "@/routers/orders/module";
import { command, fail, ok, paginate, query, serve } from "./kernel";

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
  const rows = scope.tx.select({ id: order.id }).from(order).$dynamic();
  const sortBy = { title: order.title, shop: order.shop };

  // @ts-expect-error a1f6ff78: pages ordered by a non-unique key repeated rows; end on a primary key
  void paginate(input, { rows, sortBy, tiebreak: [order.createdAt] });

  // @ts-expect-error a sort key without a column fell back to createdAt; sortBy names every key
  void paginate(input, { rows, sortBy: { title: order.title }, tiebreak: [order.id] });

  return ok(await paginate(input, { rows, sortBy, tiebreak: [order.createdAt, order.id] }));
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
