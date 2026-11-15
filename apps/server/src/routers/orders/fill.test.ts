import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Elysia } from "elysia";
import { initLogger } from "evlog";
import { asc, sql } from "drizzle-orm";
import type { OrderFill } from "@myakiba/contracts/orders/fill";
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
const { default: collectionRouter } = await import("../collection/index");
const app = new Elysia({ prefix: "/api" }).use(ordersRouter).use(collectionRouter);

const userId = "user-1";
const createdAt = new Date("2026-01-05T10:20:30.456Z");
const FILLED = { status: 200, body: "Orders filled successfully" };

beforeEach(async () => {
  await db.execute('TRUNCATE "user", item CASCADE');
  await db
    .insert(authSchema.user)
    .values({ id: userId, name: "Ryan", email: "r@example.com", username: "ryan" });
  await db
    .insert(item)
    .values({ id: "item-1", ownerId: userId, externalId: 186, title: "Nendoroid Hatsune Miku" });
  await db.insert(order).values([
    {
      id: "order-1",
      userId,
      title: "AmiAmi preorder",
      shop: "AmiAmi",
      orderDate: "2026-01-01",
      createdAt,
      updatedAt: createdAt,
    },
    { id: "order-2", userId, title: "HLJ preorder", createdAt, updatedAt: createdAt },
    { id: "order-3", userId, title: "Left alone", createdAt, updatedAt: createdAt },
  ]);
  await db.insert(collection).values([
    { id: "c-1", userId, itemId: "item-1", orderId: "order-1", status: "Ordered", createdAt },
    { id: "c-2", userId, itemId: "item-1", orderId: "order-1", status: "Shipped", createdAt },
    { id: "c-3", userId, itemId: "item-1", orderId: "order-2", status: "Ordered", createdAt },
    { id: "c-4", userId, itemId: "item-1", orderId: "order-3", status: "Ordered", createdAt },
    { id: "c-5", userId, itemId: "item-1", status: "Owned", createdAt },
  ]);
});

type Json = string | number | boolean | null | readonly Json[] | JsonObject;
type JsonObject = { readonly [key: string]: Json };

const put = async (path: string, body: JsonObject) => {
  const response = await app.handle(
    new Request(`http://localhost/api${path}`, {
      method: "PUT",
      headers: { "x-test-user": userId, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: response.status, body: await response.text() };
};
const fill = (body: JsonObject) => put("/orders/fill", body);

const readState = async () => ({
  orders: await db.select().from(order).orderBy(asc(order.id)),
  items: await db.select().from(collection).orderBy(asc(collection.id)),
});
const withoutUpdatedAt = <Row extends { readonly updatedAt: Date }>(rows: readonly Row[]) =>
  rows.map(({ updatedAt: _updatedAt, ...row }) => row);

const FILLS = [
  [{ field: "status", value: "Owned" }, "Owned"],
  [{ field: "paid", value: true }, true],
  [{ field: "shop", value: " Mandarake " }, "Mandarake"],
  [{ field: "shop", value: "" }, ""],
  [{ field: "orderDate", value: "2026-03-01" }, "2026-03-01"],
  [{ field: "orderDate", value: null }, null],
  [{ field: "paymentDate", value: "2026-03-02" }, "2026-03-02"],
  [{ field: "shippingDate", value: "2026-03-03" }, "2026-03-03"],
  [{ field: "collectionDate", value: "2026-03-04" }, "2026-03-04"],
  [{ field: "shippingMethod", value: "DHL" }, "DHL"],
] as const satisfies readonly (readonly [OrderFill, unknown])[];

describe("an Order fill writes its field to every listed Order and cascades it to their items", () => {
  test.each(FILLS)("%o", async (sent, stored) => {
    const before = await readState();
    const filledOrder = new Set(["order-1", "order-2"]);
    const filledItem = new Set(["c-1", "c-2", "c-3"]);

    expect(await fill({ orderIds: ["order-2", "order-1"], fill: sent })).toEqual(FILLED);

    const after = await readState();
    expect(withoutUpdatedAt(after.orders)).toEqual(
      withoutUpdatedAt(before.orders).map((row) =>
        filledOrder.has(row.id) ? { ...row, [sent.field]: stored } : row,
      ),
    );
    expect(after.orders.map(({ id, updatedAt }) => [id, updatedAt > createdAt])).toEqual([
      ["order-1", true],
      ["order-2", true],
      ["order-3", false],
    ]);
    expect(after.items).toEqual(
      before.items.map((row) => (filledItem.has(row.id) ? { ...row, [sent.field]: stored } : row)),
    );
  });
});

test("a paid fill leaves status alone on the Orders and their items, and a status fill leaves paid alone", async () => {
  const paidAndStatus = async () => {
    const { orders, items } = await readState();
    return [...orders, ...items]
      .filter(({ id }) => id === "order-1" || id === "c-1" || id === "c-2")
      .map(({ id, status, paid }) => ({ id, status, paid }));
  };

  expect(await fill({ orderIds: ["order-1"], fill: { field: "paid", value: true } })).toEqual(
    FILLED,
  );
  expect(await paidAndStatus()).toEqual([
    { id: "order-1", status: "Ordered", paid: true },
    { id: "c-1", status: "Ordered", paid: true },
    { id: "c-2", status: "Shipped", paid: true },
  ]);

  expect(await fill({ orderIds: ["order-1"], fill: { field: "status", value: "Owned" } })).toEqual(
    FILLED,
  );
  expect(await paidAndStatus()).toEqual([
    { id: "order-1", status: "Owned", paid: true },
    { id: "c-1", status: "Owned", paid: true },
    { id: "c-2", status: "Owned", paid: true },
  ]);
});

test("an Order with no items is filled", async () => {
  await db.insert(order).values({ id: "order-empty", userId, title: "No items yet" });

  expect(
    await fill({ orderIds: ["order-empty"], fill: { field: "shippingMethod", value: "EMS" } }),
  ).toEqual(FILLED);

  const { orders } = await readState();
  expect(orders.find(({ id }) => id === "order-empty")?.shippingMethod).toBe("EMS");
});

test.each([
  [
    "an extra key in the body",
    { orderIds: ["order-1"], fill: { field: "paid", value: true }, userId },
  ],
  [
    "Cascade to Items options",
    { orderIds: ["order-1"], fill: { field: "paid", value: true }, cascadeOptions: [] },
  ],
  [
    "an extra key in the fill",
    { orderIds: ["order-1"], fill: { field: "paid", value: true, x: 1 } },
  ],
  ["a value of another field's type", { orderIds: ["order-1"], fill: { field: "shop", value: 1 } }],
  [
    "a field Orders have no fill for",
    { orderIds: ["order-1"], fill: { field: "price", value: 1 } },
  ],
  ["an Order's own field", { orderIds: ["order-1"], fill: { field: "title", value: "Renamed" } }],
])("a fill with %s answers 422 and changes nothing", async (_, body) => {
  const before = await readState();

  expect(await fill(body)).toMatchObject({ status: 422 });

  expect(await readState()).toEqual(before);
});

async function waitForLockWaits(count: number) {
  for (;;) {
    const [waiting] = await db.execute<{ count: number }>(
      sql`SELECT count(*)::int AS count FROM pg_stat_activity
        WHERE wait_event_type = 'Lock' AND query ILIKE 'select%for no key update%'`,
    );
    if (waiting && waiting.count >= count) return;
    await Bun.sleep(10);
  }
}

test("an Order fill and a fill of its items, each given in reverse id order, both finish", async () => {
  const locked = Promise.withResolvers<null>();
  const release = Promise.withResolvers<null>();
  const holding = db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM collection WHERE id = 'c-2' FOR UPDATE`);
    locked.resolve(null);
    await release.promise;
  });
  await locked.promise;

  const orders = fill({ orderIds: ["order-2", "order-1"], fill: { field: "paid", value: true } });
  const items = put("/collection/fill", {
    ids: ["c-3", "c-2", "c-1"],
    fill: { field: "notes", value: "Checked" },
  });
  await waitForLockWaits(2);
  release.resolve(null);
  await holding;

  expect(await Promise.all([orders, items])).toEqual([
    FILLED,
    { status: 200, body: "Collection items filled successfully" },
  ]);
  const { items: rows } = await readState();
  expect(
    rows.filter(({ id }) => id <= "c-3").map(({ id, paid, notes }) => ({ id, paid, notes })),
  ).toEqual([
    { id: "c-1", paid: true, notes: "Checked" },
    { id: "c-2", paid: true, notes: "Checked" },
    { id: "c-3", paid: true, notes: "Checked" },
  ]);
});
