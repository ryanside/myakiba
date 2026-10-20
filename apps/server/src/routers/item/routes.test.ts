import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Elysia } from "elysia";
import { initLogger } from "evlog";
import * as authSchema from "@myakiba/db/schema/auth";
import * as figureSchema from "@myakiba/db/schema/figure";
import { createTestDatabase } from "../../../test/database";
import type { CustomItemInput } from "./model";

const { collection, entry, entry_to_item, item, item_release, order, wishlistItem } = figureSchema;

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
const { default: itemRouter } = await import("./index");
const app = new Elysia({ prefix: "/api" }).use(itemRouter);

const userId = "user-1";

beforeEach(async () => {
  await db.execute('TRUNCATE "user", item, entry CASCADE');
  await db.insert(authSchema.user).values([
    { id: userId, name: "Ryan", email: "r@example.com", username: "ryan" },
    { id: "user-2", name: "Aki", email: "a@example.com", username: "aki" },
  ]);
  await db.insert(item).values({ id: "item-1", externalId: 186, title: "Nendoroid Hatsune Miku" });
  await db.insert(item_release).values([
    { id: "00000000-0000-0000-0000-000000000001", itemId: "item-1", date: "2026-03-01" },
    { id: "00000000-0000-0000-0000-000000000002", itemId: "item-1", date: "2026-01-01" },
  ]);
  await db.insert(entry).values({ id: "entry-1", name: "Hatsune Miku", category: "Characters" });
  await db.insert(entry_to_item).values({ entryId: "entry-1", itemId: "item-1", role: "" });
  await db.insert(wishlistItem).values({ userId: "user-2", itemId: "item-1" });
  await db.insert(order).values([
    { id: "order-1", userId, title: "AmiAmi preorder" },
    { id: "order-2", userId: "user-2", title: "Other user's order" },
  ]);
  await db.insert(collection).values([
    { id: "c-1", userId, itemId: "item-1", orderId: "order-1", status: "Ordered" },
    { id: "c-other", userId: "user-2", itemId: "item-1", orderId: "order-2", status: "Ordered" },
  ]);
});

const call = async (method: string, path: string, body?: CustomItemInput) => {
  const response = await app.handle(
    new Request(`http://localhost/api/item${path}`, {
      method,
      headers: { "x-test-user": userId, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  const json = response.headers.get("content-type")?.includes("json");
  return { status: response.status, body: json ? await response.json() : await response.text() };
};

const counts = async () => ({
  items: await db.$count(item),
  entries: await db.$count(entry),
  links: await db.$count(entry_to_item),
  releases: await db.$count(item_release),
});

const customItem = {
  title: "Custom figure",
  category: "Prepainted",
  releases: [{ date: "2026-05-01", price: 1000 }],
} satisfies CustomItemInput;

describe("each item route answers as before", () => {
  test("create a custom item with a new entry and a release", async () => {
    const { status, body } = await call("POST", "/custom", {
      ...customItem,
      entries: [{ name: "New artist", category: "Artists", role: "Sculptor" }],
    });

    expect(status).toBe(200);
    expect(body).toMatchObject({
      item: {
        source: "custom",
        externalId: null,
        title: "Custom figure",
        releases: [{ date: "2026-05-01", price: 1000 }],
        entries: [
          { name: "New artist", category: "Artists", role: "Sculptor", roles: ["Sculptor"] },
        ],
      },
    });
    expect(await counts()).toEqual({ items: 2, entries: 2, links: 2, releases: 3 });
  });

  test("get an item with the viewer's wishlist flag and its releases newest first", async () => {
    expect(await call("GET", "/186")).toMatchObject({
      status: 200,
      body: {
        isWishlisted: false,
        item: {
          id: "item-1",
          externalId: 186,
          releases: [{ date: "2026-03-01" }, { date: "2026-01-01" }],
          entries: [{ id: "entry-1", name: "Hatsune Miku", roles: [] }],
        },
      },
    });
  });

  test("get a missing item", async () => {
    expect(await call("GET", "/999")).toEqual({ status: 404, body: "Item not found" });
  });

  test("list releases oldest first", async () => {
    expect(await call("GET", "/item-1/releases")).toMatchObject({
      status: 200,
      body: { releases: [{ date: "2026-01-01" }, { date: "2026-03-01" }] },
    });
  });

  test("related orders and collection show only the viewer's rows", async () => {
    expect(await call("GET", "/186/orders")).toMatchObject({
      status: 200,
      body: { orders: [{ id: "order-1" }] },
    });
    expect(await call("GET", "/186/collection")).toMatchObject({
      status: 200,
      body: { collection: [{ id: "c-1" }] },
    });
  });
});

describe("a custom item that fails after its insert leaves nothing behind", () => {
  test("an unknown entry id", async () => {
    const before = await counts();

    expect(
      await call("POST", "/custom", {
        ...customItem,
        entries: [{ entryId: "missing", category: "Artists" }],
      }),
    ).toEqual({ status: 404, body: "Entry not found" });
    expect(await counts()).toEqual(before);
  });

  test("an entry of another category", async () => {
    const before = await counts();

    expect(
      await call("POST", "/custom", {
        ...customItem,
        entries: [{ entryId: "entry-1", category: "Artists" }],
      }),
    ).toEqual({ status: 400, body: "Entry category mismatch" });
    expect(await counts()).toEqual(before);
  });
});
