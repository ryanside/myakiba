import { beforeAll, describe, expect, mock, test } from "bun:test";
import { Elysia } from "elysia";
import { initLogger } from "evlog";
import * as authSchema from "@myakiba/db/schema/auth";
import * as figureSchema from "@myakiba/db/schema/figure";
import { createTestDatabase } from "../../test/database";

const { collection, entry, entry_to_item, item, order } = figureSchema;

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
const { default: ordersRouter } = await import("./orders/index");
const { default: collectionRouter } = await import("./collection/index");
const app = new Elysia({ prefix: "/api" }).use(ordersRouter).use(collectionRouter);

const userId = "user-1";

beforeAll(async () => {
  await db.insert(authSchema.user).values([
    { id: userId, name: "Ryan", email: "r@example.com", username: "ryan" },
    { id: "user-2", name: "Aki", email: "a@example.com", username: "aki" },
  ]);
  await db.insert(item).values([
    { id: "item-1", externalId: 101, title: "Miku", category: "Prepainted", scale: "1/7" },
    { id: "item-2", externalId: 102, title: "Rin", category: "Prepainted", scale: "1/8" },
    { id: "item-3", externalId: 103, title: "Len", category: "Prepainted", scale: "1/8" },
  ]);
  await db.insert(entry).values([
    { id: "entry-1", name: "Crypton", category: "Companies" },
    { id: "entry-2", name: "Good Smile", category: "Companies" },
    { id: "entry-3", name: "Hatsune Miku", category: "Characters" },
    { id: "entry-4", name: "Kagamine Rin", category: "Characters" },
  ]);
  await db.insert(entry_to_item).values([
    { entryId: "entry-1", itemId: "item-1", role: "Manufacturer" },
    { entryId: "entry-1", itemId: "item-2", role: "Manufacturer" },
    { entryId: "entry-2", itemId: "item-2", role: "Distributor" },
    { entryId: "entry-3", itemId: "item-1", role: "" },
    { entryId: "entry-4", itemId: "item-2", role: "" },
  ]);
  await db.insert(order).values([
    { id: "order-1", userId, title: "AmiAmi", shop: "AmiAmi", status: "Ordered", shippingFee: 500 },
    { id: "order-2", userId, title: "HLJ", shop: "HLJ", status: "Owned", shippingFee: 700 },
    { id: "order-3", userId, title: "Mandarake", shop: "Mandarake", status: "Paid" },
    { id: "order-4", userId: "user-2", title: "Other", shop: "AmiAmi", status: "Ordered" },
  ]);
  await db.insert(collection).values([
    { id: "c-1", userId, itemId: "item-1", orderId: "order-1", status: "Ordered", price: 1000 },
    { id: "c-2", userId, itemId: "item-2", orderId: "order-1", status: "Ordered", price: 2000 },
    {
      id: "c-3",
      userId,
      itemId: "item-1",
      orderId: "order-2",
      status: "Owned",
      price: 3000,
      shop: "HLJ",
    },
    { id: "c-4", userId, itemId: "item-2", status: "Owned", price: 4000, shop: "AmiAmi" },
    { id: "c-5", userId, itemId: "item-3", status: "Owned", price: 5000, shop: "HLJ" },
    { id: "c-6", userId, itemId: "item-1", status: "Owned", price: 6000, shop: "AmiAmi" },
    { id: "c-other", userId: "user-2", itemId: "item-1", orderId: "order-4", price: 9000 },
  ]);
});

const get = async (path: string) => {
  const response = await app.handle(
    new Request(`http://localhost/api${path}`, { headers: { "x-test-user": userId } }),
  );
  expect(response.status).toBe(200);
  return response.json();
};

const pastEnd = "limit=2&offset=100";

describe("a page past the end keeps the filtered set's totals", () => {
  test("GET /orders", async () => {
    const totals = { totalCount: 3, totalSpent: 3700, activeOrders: 2, unpaidCosts: 3500 };
    expect(await get("/orders?limit=2")).toMatchObject(totals);
    expect(await get(`/orders?${pastEnd}`)).toEqual({ items: [], ...totals });
  });

  test("GET /orders with a filter that matches nothing", async () => {
    expect(await get("/orders?search=nothing")).toEqual({
      items: [],
      totalCount: 0,
      totalSpent: 0,
      activeOrders: 0,
      unpaidCosts: 0,
    });
  });

  test("GET /orders/:orderId/items", async () => {
    expect(await get("/orders/order-1/items?limit=1")).toMatchObject({ totalCount: 2 });
    expect(await get(`/orders/order-1/items?${pastEnd}`)).toEqual({ items: [], totalCount: 2 });
  });

  test("GET /collection", async () => {
    const totals = { totalCount: 4, totalValue: 18_000 };
    expect(await get("/collection?limit=2")).toMatchObject(totals);
    expect(await get(`/collection?${pastEnd}`)).toMatchObject({ items: [], ...totals });
  });
});
