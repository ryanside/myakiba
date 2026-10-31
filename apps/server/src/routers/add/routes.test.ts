import { beforeEach, expect, mock, test } from "bun:test";
import { Elysia } from "elysia";
import { initLogger } from "evlog";
import { addItemsResponseSchema } from "@myakiba/contracts/add/schema";
import * as authSchema from "@myakiba/db/schema/auth";
import { collection, item, item_release, wishlistItem } from "@myakiba/db/schema/figure";
import { createTestDatabase } from "../../../test/database";

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
const { default: addRouter } = await import("./index");
const app = new Elysia({ prefix: "/api" }).use(addRouter);

const userId = "user-1";

beforeEach(async () => {
  await db.execute('TRUNCATE "user", item CASCADE');
  await db.insert(authSchema.user).values([
    { id: userId, name: "Ryan", email: "r@example.com", username: "ryan" },
    { id: "user-2", name: "Aki", email: "a@example.com", username: "aki" },
  ]);
  await db.insert(item).values([
    {
      id: "item-1",
      externalId: 186,
      title: "Nendoroid Hatsune Miku",
      image: "miku.jpg",
      category: "Prepainted",
    },
    { id: "item-custom", externalId: null, source: "custom", title: "Custom Rin" },
  ]);
  await db.insert(item_release).values([
    { itemId: "item-1", date: "2026-01-01", price: 4000, priceCurrency: "JPY" },
    {
      id: "00000000-0000-4000-8000-000000000002",
      itemId: "item-1",
      date: "2026-06-01",
      type: "Limited",
      barcode: "4580590174562",
      price: 4500,
      priceCurrency: "JPY",
    },
  ]);
  await db.insert(collection).values([
    { userId, itemId: "item-1" },
    { userId, itemId: "item-1", status: "Ordered" },
    { userId: "user-2", itemId: "item-custom" },
  ]);
  await db.insert(wishlistItem).values([
    { userId, itemId: "item-custom" },
    { userId: "user-2", itemId: "item-1" },
  ]);
});

const items = async (ids: string) => {
  const response = await app.handle(
    new Request(`http://localhost/api/add/items?ids=${ids}`, {
      headers: { "x-test-user": userId },
    }),
  );
  return { status: response.status, body: await response.json() };
};

test("items answers each known id in request order with its latest release and the viewer's badges", async () => {
  expect(await items("item-custom,item-gone,item-1")).toEqual({
    status: 200,
    body: {
      items: [
        {
          itemId: "item-custom",
          externalId: null,
          title: "Custom Rin",
          image: null,
          category: null,
          latestRelease: null,
          collectionCount: 0,
          onOrderCount: 0,
          wishlisted: true,
        },
        {
          itemId: "item-1",
          externalId: 186,
          title: "Nendoroid Hatsune Miku",
          image: "miku.jpg",
          category: "Prepainted",
          latestRelease: {
            id: "00000000-0000-4000-8000-000000000002",
            date: "2026-06-01",
            type: "Limited",
            barcode: "4580590174562",
            price: 4500,
            priceCurrency: "JPY",
          },
          collectionCount: 1,
          onOrderCount: 1,
          wishlisted: false,
        },
      ],
    },
  });
});

test("items answers unknown ids with no items", async () => {
  expect(await items("item-gone")).toEqual({ status: 200, body: { items: [] } });
});

test("items refuses more than 100 ids", async () => {
  const ids = Array.from({ length: 101 }, (_, index) => `item-${index}`).join(",");
  const refused = await items(ids);
  expect(refused.status).toBe(422);
});

test("items reads the ids Elysia splits from ?ids=a,b, each once", async () => {
  const { body } = await items("item-1,item-custom,item-1");
  expect(addItemsResponseSchema.parse(body).items.map((found) => found.itemId)).toEqual([
    "item-1",
    "item-custom",
  ]);
});
