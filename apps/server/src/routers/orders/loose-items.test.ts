import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Elysia } from "elysia";
import { initLogger } from "evlog";
import { asc, eq, sql } from "drizzle-orm";
import * as authSchema from "@myakiba/db/schema/auth";
import * as figureSchema from "@myakiba/db/schema/figure";
import { createTestDatabase } from "../../../test/database";

const { collection, item, order } = figureSchema;

initLogger({ enabled: false });

await mock.module("@myakiba/auth/server", () => ({
  auth: {
    handler: () => new Response(null, { status: 404 }),
    api: {
      getSession: async ({ headers }: { headers: Headers }) => {
        const id = headers.get("x-test-user");
        return id ? { user: { id }, session: { id: `session-${id}` } } : null;
      },
    },
  },
}));

const db = await createTestDatabase();
const { default: ordersRouter } = await import("./index");
const app = new Elysia({ prefix: "/api" }).use(ordersRouter);

const userId = "user-1";
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

beforeEach(async () => {
  await db.execute('TRUNCATE "user", item CASCADE');
  await db
    .insert(authSchema.user)
    .values({ id: userId, name: "Ryan", email: "r@example.com", username: "ryan" });
  await db
    .insert(item)
    .values({ id: "item-1", ownerId: userId, externalId: 186, title: "Nendoroid Hatsune Miku" });
  await db.insert(order).values([
    { id: "order-1", userId, title: "AmiAmi preorder" },
    { id: "order-2", userId, title: "HLJ preorder" },
  ]);
  await db
    .insert(collection)
    .values({ id: "c-owned", userId, itemId: "item-1", orderId: "order-1", status: "Owned" });
});

const send = async (method: string, path: string, body: string) => {
  const response = await app.handle(
    new Request(`http://localhost/api/orders${path}`, {
      method,
      headers: { "x-test-user": userId, "content-type": "application/json" },
      body,
    }),
  );
  return { status: response.status, body: await response.text() };
};

const readItems = () =>
  db
    .select({ id: collection.id, orderId: collection.orderId, status: collection.status })
    .from(collection)
    .orderBy(asc(collection.id));

async function holding(write: (tx: Tx) => Promise<void>) {
  const written = Promise.withResolvers<null>();
  const commit = Promise.withResolvers<null>();
  const open = db.transaction(async (tx) => {
    await write(tx);
    written.resolve(null);
    await commit.promise;
  });
  await written.promise;
  return async () => {
    commit.resolve(null);
    await open;
  };
}

async function waitForALockWait() {
  for (;;) {
    const [waiting] = await db.execute<{ count: number }>(
      sql`SELECT count(*)::int AS count FROM pg_stat_activity
        WHERE wait_event_type = 'Lock' AND datname = current_database()`,
    );
    if (waiting && waiting.count > 0) return;
    await Bun.sleep(10);
  }
}

const shipping = (id: string) => async (tx: Tx) => {
  await tx.update(collection).set({ status: "Shipped" }).where(eq(collection.id, id));
};
const addingOrdered = (orderId: string) => async (tx: Tx) => {
  await tx
    .insert(collection)
    .values({ id: "c-new", userId, itemId: "item-1", orderId, status: "Ordered" });
};

describe("deleting an Order never leaves an Ordered or Shipped Collection Item outside an Order", () => {
  test("an Owned Order Item shipped meanwhile is deleted with its Order", async () => {
    const commit = await holding(shipping("c-owned"));

    const deleted = send("DELETE", "/", JSON.stringify({ orderIds: ["order-1"] }));
    await waitForALockWait();
    await commit();

    expect(await deleted).toEqual({ status: 200, body: "Orders deleted successfully" });
    expect(await readItems()).toEqual([]);
  });

  test("an Ordered item added to the Order meanwhile is deleted with it", async () => {
    const commit = await holding(addingOrdered("order-1"));

    const deleted = send("DELETE", "/", JSON.stringify({ orderIds: ["order-1"] }));
    await waitForALockWait();
    await commit();

    expect(await deleted).toEqual({ status: 200, body: "Orders deleted successfully" });
    expect(await readItems()).toEqual([{ id: "c-owned", orderId: null, status: "Owned" }]);
  });
});

test("merging Orders moves an Ordered item added to one of them meanwhile", async () => {
  const commit = await holding(addingOrdered("order-2"));

  const merged = send(
    "POST",
    "/merge",
    JSON.stringify({
      orderIds: ["order-1", "order-2"],
      newOrder: {
        status: "Ordered",
        paid: false,
        title: "Combined shipment",
        shop: "AmiAmi",
        orderDate: null,
        releaseDate: null,
        paymentDate: null,
        shippingDate: null,
        collectionDate: null,
        shippingMethod: "EMS",
        shippingFee: 0,
        taxes: 0,
        duties: 0,
        tariffs: 0,
        miscFees: 0,
        notes: "",
      },
      cascadeOptions: [],
    }),
  );
  await waitForALockWait();
  await commit();

  expect(await merged).toEqual({ status: 200, body: "Orders merged successfully" });
  const [mergedOrder, ...others] = await db.select({ id: order.id }).from(order);
  if (!mergedOrder || others.length > 0) throw new Error("expected only the merged Order");
  expect(await readItems()).toEqual([
    { id: "c-new", orderId: mergedOrder.id, status: "Ordered" },
    { id: "c-owned", orderId: mergedOrder.id, status: "Owned" },
  ]);
});
