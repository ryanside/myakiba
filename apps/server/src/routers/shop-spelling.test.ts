import { afterAll, beforeEach, expect, mock, test } from "bun:test";
import { Elysia } from "elysia";
import { initLogger } from "evlog";
import Redis from "ioredis";
import { eq } from "drizzle-orm";
import type * as z from "zod";
import type { addCommitSchema } from "@myakiba/contracts/add/schema";
import type { FillItemsBody } from "@myakiba/contracts/collection/fill";
import type { FillOrdersBody } from "@myakiba/contracts/orders/fill";
import type { CascadeOptions, NewOrder, OrderEdit } from "@myakiba/contracts/orders/schema";
import * as authSchema from "@myakiba/db/schema/auth";
import { collection, item, order } from "@myakiba/db/schema/figure";
import type { CollectionUpdateType } from "./collection/model";
import { createTestDatabase } from "../../test/database";

initLogger({ enabled: false });

const redisUrl = process.env.TEST_REDIS_URL;
if (!redisUrl) {
  throw new Error(
    "Set TEST_REDIS_URL to a Redis server, such as redis://127.0.0.1:6379: Add commits count their rate limit there",
  );
}
const redis = new Redis(redisUrl);
afterAll(() => redis.disconnect());

await mock.module("@myakiba/auth/server", () => ({
  auth: {
    handler: () => new Response(null, { status: 404 }),
    api: {
      getSession: async ({ headers }: { headers: Headers }) => {
        const id = headers.get("x-test-user");
        if (!id) return null;
        return { user: { id, emailVerified: true, currency: "JPY" }, session: { id: `s-${id}` } };
      },
    },
  },
}));
await mock.module("@myakiba/redis/client", () => ({ redis }));

const db = await createTestDatabase();
const { default: addRouter } = await import("./add/index");
const { default: collectionRouter } = await import("./collection/index");
const { default: ordersRouter } = await import("./orders/index");
const app = new Elysia({ prefix: "/api" }).use(addRouter).use(collectionRouter).use(ordersRouter);

let userId = "";
let otherUserId = "";

beforeEach(async () => {
  await db.execute('TRUNCATE "user", item CASCADE');
  userId = `user-${crypto.randomUUID()}`;
  otherUserId = `other-${crypto.randomUUID()}`;
  await db.insert(authSchema.user).values([
    { id: userId, name: "Ryan", email: `${userId}@example.com`, username: userId },
    { id: otherUserId, name: "Aki", email: `${otherUserId}@example.com`, username: otherUserId },
  ]);
  await db.insert(item).values([
    { id: "item-1", ownerId: userId, externalId: 186, title: "Nendoroid Hatsune Miku" },
    { id: "item-2", ownerId: userId, externalId: 1860, title: "Figma Miku" },
  ]);
});

type RequestBody =
  | z.input<typeof addCommitSchema>
  | FillItemsBody
  | FillOrdersBody
  | CollectionUpdateType
  | { readonly order: OrderEdit; readonly cascadeOptions: CascadeOptions }
  | { readonly orderIds: string[]; readonly newOrder: NewOrder }
  | { readonly collectionIds: string[]; readonly newOrder: NewOrder };

async function send(method: string, path: string, body: RequestBody) {
  const response = await app.handle(
    new Request(`http://localhost/api${path}`, {
      method,
      headers: { "x-test-user": userId, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  expect(response.status).toBe(200);
}

const newOrder = (shop: string): NewOrder => ({
  status: "Ordered",
  paid: false,
  title: "Preorder",
  shop,
  orderDate: null,
  releaseDate: null,
  paymentDate: null,
  shippingDate: null,
  collectionDate: null,
  shippingMethod: "n/a",
  shippingFee: 0,
  taxes: 0,
  duties: 0,
  tariffs: 0,
  miscFees: 0,
  notes: "",
});

async function saveOrder(id: string, shop: string, owner = userId) {
  await db.insert(order).values({ id, userId: owner, title: id, shop });
}

async function saveItem(id: string, shop: string, orderId: string | null = null) {
  await db.insert(collection).values({
    id,
    userId,
    itemId: "item-1",
    orderId,
    status: orderId ? "Ordered" : "Owned",
    shop,
  });
}

async function orderShop(id: string) {
  const [row] = await db.select({ shop: order.shop }).from(order).where(eq(order.id, id));
  return row?.shop;
}

async function itemShop(id: string) {
  const [row] = await db
    .select({ shop: collection.shop })
    .from(collection)
    .where(eq(collection.id, id));
  return row?.shop;
}

async function orderShops() {
  const rows = await db.select({ shop: order.shop }).from(order).where(eq(order.userId, userId));
  return rows.map((row) => row.shop).toSorted();
}

async function itemShops() {
  const rows = await db
    .select({ shop: collection.shop })
    .from(collection)
    .where(eq(collection.userId, userId));
  return rows.map((row) => row.shop).toSorted();
}

async function addToNewOrder(shop: string) {
  await send("POST", "/add/commit", {
    commitId: crypto.randomUUID(),
    rows: [{ itemId: "item-2", price: null }],
    ownership: { kind: "order", order: { kind: "new", fields: newOrder(shop) } },
    wishlist: false,
  });
}

test("an Add commit to a new Order stores the Shop's existing spelling", async () => {
  await saveOrder("order-1", "AmiAmi");

  await send("POST", "/add/commit", {
    commitId: crypto.randomUUID(),
    rows: [{ itemId: "item-1", price: null }],
    ownership: { kind: "order", order: { kind: "new", fields: newOrder("amiami.com") } },
    wishlist: false,
  });

  expect(await orderShops()).toEqual(["AmiAmi", "AmiAmi"]);
  expect(await itemShops()).toEqual(["AmiAmi"]);
});

test("an Add commit to the Collection stores the existing spelling of the shared and each row's Shop", async () => {
  await saveOrder("order-1", "AmiAmi");
  await saveItem("c-1", "Mandarake");

  await send("POST", "/add/commit", {
    commitId: crypto.randomUUID(),
    rows: [
      { itemId: "item-1", price: null },
      { itemId: "item-2", price: null, shop: "MANDARAKE" },
    ],
    ownership: {
      kind: "collection",
      shared: {
        shop: "Ami Ami",
        collectionDate: null,
        shippingMethod: "n/a",
        condition: "New",
        count: 1,
      },
    },
    wishlist: false,
  });

  expect(await itemShops()).toEqual(["AmiAmi", "Mandarake", "Mandarake"]);
});

test("a Shop with no existing spelling, and one a person would call different, stays as typed", async () => {
  await saveOrder("order-1", "AmiAmi");

  await addToNewOrder("www.amiami.com");
  await addToNewOrder("HLJ");

  expect(await orderShops()).toEqual(["AmiAmi", "HLJ", "www.amiami.com"]);
});

test("an Order edit stores the existing spelling, here and on the items it cascades to", async () => {
  await saveOrder("order-1", "AmiAmi");
  await saveOrder("order-2", "HLJ");
  await saveItem("c-1", "HLJ", "order-2");

  await send("PUT", "/orders/order-2", {
    order: { shop: "AMIAMI" },
    cascadeOptions: ["shop"],
  });

  expect(await orderShop("order-2")).toBe("AmiAmi");
  expect(await itemShop("c-1")).toBe("AmiAmi");
});

test("an Order edit re-spells a Shop that only it and the items it cascades to hold", async () => {
  await saveOrder("order-1", "amiami");
  await saveItem("c-1", "amiami", "order-1");

  await send("PUT", "/orders/order-1", { order: { shop: "AmiAmi" }, cascadeOptions: ["shop"] });

  expect(await orderShop("order-1")).toBe("AmiAmi");
  expect(await itemShop("c-1")).toBe("AmiAmi");
});

test("an Order edit that leaves an item's own spelling counts that item as existing", async () => {
  await saveOrder("order-1", "amiami");
  await saveItem("c-1", "amiami", "order-1");

  await send("PUT", "/orders/order-1", { order: { shop: "AmiAmi" }, cascadeOptions: [] });

  expect(await orderShop("order-1")).toBe("amiami");
});

test("an Order fill stores the existing spelling on the Orders and their items", async () => {
  await saveOrder("order-1", "AmiAmi");
  await saveOrder("order-2", "HLJ");
  await saveItem("c-1", "HLJ", "order-2");

  await send("PUT", "/orders/fill", {
    orderIds: ["order-2"],
    fill: { field: "shop", value: "amiami.com" },
  });

  expect(await orderShop("order-2")).toBe("AmiAmi");
  expect(await itemShop("c-1")).toBe("AmiAmi");
});

test("an Order fill re-spells a Shop that only the filled Orders and their items hold", async () => {
  await saveOrder("order-1", "amiami");
  await saveOrder("order-2", "amiami");
  await saveItem("c-1", "amiami", "order-1");

  await send("PUT", "/orders/fill", {
    orderIds: ["order-1", "order-2"],
    fill: { field: "shop", value: "AmiAmi" },
  });

  expect(await orderShops()).toEqual(["AmiAmi", "AmiAmi"]);
  expect(await itemShop("c-1")).toBe("AmiAmi");
});

test("a merge and a split store the existing spelling on the new Order", async () => {
  await saveOrder("order-1", "AmiAmi");
  await saveOrder("order-2", "HLJ");
  await saveOrder("order-3", "HLJ");
  await saveItem("c-1", "HLJ", "order-2");
  await saveItem("c-2", "HLJ", "order-3");

  await send("POST", "/orders/merge", {
    orderIds: ["order-2", "order-3"],
    newOrder: newOrder("amiami"),
  });
  const [merged] = await db.select({ id: order.id }).from(order).where(eq(order.title, "Preorder"));
  await send("POST", "/orders/split", { collectionIds: ["c-1"], newOrder: newOrder("ami ami") });

  expect(merged && (await orderShop(merged.id))).toBe("AmiAmi");
  expect(await orderShops()).toEqual(["AmiAmi", "AmiAmi", "AmiAmi"]);
});

async function editItem(id: string, shop: string) {
  const [row] = await db.select().from(collection).where(eq(collection.id, id));
  if (!row) throw new Error(`No Collection Item ${id}`);
  await send("PUT", `/collection/${id}`, {
    status: row.status,
    count: row.count,
    score: row.score,
    price: row.price,
    shop,
    orderDate: row.orderDate,
    paymentDate: row.paymentDate,
    shippingDate: row.shippingDate,
    collectionDate: row.collectionDate,
    shippingMethod: row.shippingMethod,
    tags: row.tags,
    notes: row.notes,
    releaseId: row.releaseId,
    condition: row.condition,
  });
}

test("a Collection Item edit stores the existing spelling", async () => {
  await saveOrder("order-1", "AmiAmi");
  await saveItem("c-1", "HLJ");

  await editItem("c-1", "ＡｍｉＡｍｉ");

  expect(await itemShop("c-1")).toBe("AmiAmi");
});

test("a Collection Item edit re-spells a Shop only it holds", async () => {
  await saveItem("c-1", "amiami");

  await editItem("c-1", "AmiAmi");

  expect(await itemShop("c-1")).toBe("AmiAmi");
});

test("a Collection fill stores the existing spelling, and re-spells one only the filled items hold", async () => {
  await saveOrder("order-1", "AmiAmi");
  await saveItem("c-1", "HLJ");
  await saveItem("c-2", "hlj");

  await send("PUT", "/collection/fill", {
    ids: ["c-1"],
    fill: { field: "shop", value: "amiami.com" },
  });
  await send("PUT", "/collection/fill", { ids: ["c-2"], fill: { field: "shop", value: "Hlj" } });

  expect(await itemShop("c-1")).toBe("AmiAmi");
  expect(await itemShop("c-2")).toBe("Hlj");
});

test("the spelling most used wins, then the one used last", async () => {
  await saveOrder("order-1", "amiami");
  await saveOrder("order-2", "AmiAmi");
  await saveItem("c-1", "AmiAmi");
  await db.insert(order).values({
    id: "order-3",
    userId,
    title: "Recent",
    shop: "HLJ",
    updatedAt: new Date("2026-02-01"),
  });
  await db.insert(order).values({
    id: "order-4",
    userId,
    title: "Older",
    shop: "hlj",
    updatedAt: new Date("2026-01-01"),
  });

  await addToNewOrder("AMIAMI");
  await addToNewOrder("hlj.com");

  expect(await orderShops()).toEqual(["AmiAmi", "AmiAmi", "HLJ", "HLJ", "amiami", "hlj"]);
});

test("another user's spelling of a Shop never changes the viewer's", async () => {
  await saveOrder("theirs", "AmiAmi", otherUserId);

  await addToNewOrder("amiami");

  expect(await orderShops()).toEqual(["amiami"]);
  expect(await orderShop("theirs")).toBe("AmiAmi");
});
