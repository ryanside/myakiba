import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Elysia } from "elysia";
import { initLogger } from "evlog";
import * as authSchema from "@myakiba/db/schema/auth";
import * as figureSchema from "@myakiba/db/schema/figure";
import { createTestDatabase } from "../../../test/database";

const { collection, item, item_release, order } = figureSchema;

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
const { default: calendarRouter } = await import("./index");
const app = new Elysia({ prefix: "/api" }).use(calendarRouter);

const userId = "user-1";

beforeEach(async () => {
  await db.execute('TRUNCATE "user", item CASCADE');
  await db.insert(authSchema.user).values([
    { id: userId, name: "Ryan", email: "r@example.com", username: "ryan" },
    { id: "user-2", name: "Aki", email: "a@example.com", username: "aki" },
  ]);
  await db.insert(item).values([
    { id: "item-1", externalId: 186, title: "Nendoroid Hatsune Miku" },
    { id: "item-2", externalId: 187, title: "Figma Rin" },
  ]);
  await db.insert(item_release).values([
    {
      id: "00000000-0000-0000-0000-000000000001",
      itemId: "item-1",
      date: "2026-03-31",
      price: 5000,
    },
    { id: "00000000-0000-0000-0000-000000000002", itemId: "item-2", date: "2026-03-01" },
    { id: "00000000-0000-0000-0000-000000000003", itemId: "item-1", date: "2026-04-01" },
  ]);
  await db.insert(order).values([
    { id: "order-1", userId, title: "March preorder", releaseDate: "2026-03-15", shippingFee: 500 },
    { id: "order-2", userId, title: "April preorder", releaseDate: "2026-04-15" },
    { id: "order-3", userId: "user-2", title: "Other user's order", releaseDate: "2026-03-15" },
  ]);
  await db.insert(collection).values([
    {
      id: "c-1",
      userId,
      itemId: "item-1",
      orderId: "order-1",
      releaseId: "00000000-0000-0000-0000-000000000001",
      price: 4000,
    },
    {
      id: "c-other",
      userId: "user-2",
      itemId: "item-2",
      orderId: "order-3",
      releaseId: "00000000-0000-0000-0000-000000000002",
    },
  ]);
});

const call = async (query: string) => {
  const response = await app.handle(
    new Request(`http://localhost/api/calendar?${query}`, { headers: { "x-test-user": userId } }),
  );
  return { status: response.status, body: await response.json() };
};

describe("the calendar answers as before", () => {
  test("the items view lists the viewer's releases in the month", async () => {
    expect(await call("view=items&month=3&year=2026")).toEqual({
      status: 200,
      body: {
        view: "items",
        month: 3,
        year: 2026,
        items: [
          {
            releaseId: "00000000-0000-0000-0000-000000000001",
            itemId: "item-1",
            itemExternalId: 186,
            title: "Nendoroid Hatsune Miku",
            image: null,
            category: null,
            price: 5000,
            priceCurrency: null,
            releaseDate: "2026-03-31",
          },
        ],
      },
    });
  });

  test("the orders view lists the viewer's orders released in the month", async () => {
    expect(await call("view=orders&month=3&year=2026")).toEqual({
      status: 200,
      body: {
        view: "orders",
        month: 3,
        year: 2026,
        orders: [
          {
            orderId: "order-1",
            title: "March preorder",
            shop: "",
            status: "Ordered",
            releaseDate: "2026-03-15",
            itemCount: "1",
            images: [],
            total: "4500",
          },
        ],
      },
    });
  });
});
