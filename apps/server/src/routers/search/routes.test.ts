import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Elysia } from "elysia";
import { initLogger } from "evlog";
import * as authSchema from "@myakiba/db/schema/auth";
import * as figureSchema from "@myakiba/db/schema/figure";
import { createTestDatabase } from "../../../test/database";

const { collection, entry, entry_to_item, item, item_release, order } = figureSchema;

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
const { default: searchRouter } = await import("./index");
const app = new Elysia({ prefix: "/api" }).use(searchRouter);

const userId = "user-1";

beforeEach(async () => {
  await db.execute('TRUNCATE "user", item, entry CASCADE');
  await db.insert(authSchema.user).values([
    { id: userId, name: "Ryan", email: "r@example.com", username: "ryan" },
    { id: "user-2", name: "Aki", email: "a@example.com", username: "aki" },
  ]);
  await db.insert(item).values([
    { id: "item-1", externalId: 186, title: "Nendoroid Hatsune Miku" },
    { id: "item-2", externalId: 1860, title: "Figma Miku" },
    { id: "item-3", externalId: 300, title: "Rin" },
    { id: "item-custom", externalId: null, source: "custom", title: "Custom Miku" },
  ]);
  await db.insert(item_release).values([
    { itemId: "item-1", date: "2026-01-01", price: 4000, priceCurrency: "JPY" },
    { itemId: "item-1", date: "2026-06-01", price: 4500, priceCurrency: "JPY" },
  ]);
  await db.insert(entry).values([
    { id: "entry-1", name: "Miku Artist", category: "Artists" },
    { id: "entry-2", name: "Another Miku", category: "Characters" },
    { id: "entry-custom", name: "Custom Miku", category: "Artists", source: "custom" },
  ]);
  await db.insert(entry_to_item).values({ entryId: "entry-1", itemId: "item-3", role: "" });
  await db.insert(order).values([
    { id: "order-1", userId, title: "Miku preorder" },
    { id: "order-2", userId, title: "Rin preorder" },
    { id: "order-3", userId: "user-2", title: "Other user's Miku order" },
  ]);
  await db.insert(collection).values([
    { id: "c-1", userId, itemId: "item-1", orderId: "order-1" },
    { id: "c-other", userId: "user-2", itemId: "item-2", orderId: "order-3" },
  ]);
});

const call = async (path: string) => {
  const response = await app.handle(
    new Request(`http://localhost/api/search${path}`, { headers: { "x-test-user": userId } }),
  );
  const json = response.headers.get("content-type")?.includes("json");
  return { status: response.status, body: json ? await response.json() : await response.text() };
};

describe("each search route answers as before", () => {
  test("command search finds only the viewer's collection items and orders", async () => {
    expect(await call("/command?search=miku")).toEqual({
      status: 200,
      body: {
        searchData: {
          collectionResults: [
            {
              itemId: "item-1",
              itemExternalId: 186,
              itemTitle: "Nendoroid Hatsune Miku",
              itemImage: null,
              itemCategory: null,
            },
          ],
          orderResults: [{ orderId: "order-1", orderTitle: "Miku preorder", itemImages: [] }],
        },
      },
    });
  });

  test("item database search ranks an exact id before a prefix, then a title, then an entry", async () => {
    const { status, body } = await call("/items?query=186");

    expect(status).toBe(200);
    expect(body).toEqual({
      items: [
        {
          itemId: "item-1",
          externalId: 186,
          title: "Nendoroid Hatsune Miku",
          image: null,
          category: null,
          latestRelease: { date: "2026-06-01", price: 4500, priceCurrency: "JPY" },
        },
        {
          itemId: "item-2",
          externalId: 1860,
          title: "Figma Miku",
          image: null,
          category: null,
          latestRelease: null,
        },
      ],
      totalCount: 2,
    });
    expect(await call("/items?query=artist")).toMatchObject({
      status: 200,
      body: { items: [{ itemId: "item-3" }] },
    });
  });

  test("item database search with no query lists every MFC item, newest first", async () => {
    expect(await call("/items?page=1&pageSize=2")).toMatchObject({
      status: 200,
      body: { items: [{}, {}], totalCount: 3 },
    });
  });

  test("item database search past the last page", async () => {
    expect(await call("/items?page=9&pageSize=2")).toEqual({
      status: 200,
      body: { items: [], totalCount: 3 },
    });
  });

  test("entry search finds MFC entries by name", async () => {
    expect(await call("/entries?search=miku")).toEqual({
      status: 200,
      body: {
        entries: [
          { id: "entry-2", name: "Another Miku", category: "Characters" },
          { id: "entry-1", name: "Miku Artist", category: "Artists" },
        ],
      },
    });
  });

  test("order search lists the viewer's orders, with or without a title", async () => {
    const all = await call("/orders");
    expect(all).toMatchObject({ status: 200, body: { orderIdsAndTitles: [{}, {}] } });
    expect(all.body).toEqual({
      orderIdsAndTitles: expect.arrayContaining([
        { id: "order-1", title: "Miku preorder" },
        { id: "order-2", title: "Rin preorder" },
      ]),
    });
    expect(await call("/orders?title=miku")).toEqual({
      status: 200,
      body: { orderIdsAndTitles: [{ id: "order-1", title: "Miku preorder" }] },
    });
  });
});
