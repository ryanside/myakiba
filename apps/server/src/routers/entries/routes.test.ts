import { beforeAll, expect, mock, test } from "bun:test";
import { Elysia } from "elysia";
import { initLogger } from "evlog";
import * as authSchema from "@myakiba/db/schema/auth";
import * as figureSchema from "@myakiba/db/schema/figure";
import { createTestDatabase } from "../../../test/database";

const { collection, entry, entry_to_item, item, order, wishlistItem } = figureSchema;

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
const { default: entriesRouter } = await import("./index");
const { default: analyticsRouter } = await import("../analytics/index");
const app = new Elysia({ prefix: "/api" }).use(entriesRouter).use(analyticsRouter);

const ALICE = "user-alice";
const BOB = "user-bob";
const MIKU = "entry-miku";

const ITEMS = [
  ["item-owned", "Miku Owned"],
  ["item-ordered", "Miku Ordered"],
  ["item-shipped", "Miku Shipped"],
  ["item-wished", "Miku Wished"],
  ["item-both", "Miku Both"],
  ["item-elsewhere", "Rin Owned"],
] as const;

beforeAll(async () => {
  await db.insert(authSchema.user).values([
    { id: ALICE, name: "Alice", email: "alice@example.com", username: "alice" },
    { id: BOB, name: "Bob", email: "bob@example.com", username: "bob" },
  ]);
  await db.insert(item).values(
    ITEMS.map(([id, title], index) => ({
      id,
      ownerId: ALICE,
      externalId: 1000 + index,
      title,
      category: "Prepainted" as const,
    })),
  );
  await db.insert(entry).values([
    { id: MIKU, ownerId: ALICE, category: "Characters", name: "Hatsune Miku" },
    { id: "entry-rin", ownerId: ALICE, category: "Characters", name: "Kagamine Rin" },
  ]);
  await db.insert(entry_to_item).values([
    ...ITEMS.filter(([id]) => id !== "item-elsewhere").map(([itemId]) => ({
      ownerId: ALICE,
      entryId: MIKU,
      itemId,
    })),
    { ownerId: ALICE, entryId: "entry-rin", itemId: "item-elsewhere" },
  ]);
  await db.insert(order).values({ id: "order-1", userId: ALICE, title: "Preorders" });
  await db.insert(collection).values([
    { id: "c-owned-1", userId: ALICE, itemId: "item-owned", status: "Owned" },
    { id: "c-owned-2", userId: ALICE, itemId: "item-owned", status: "Owned" },
    { id: "c-both", userId: ALICE, itemId: "item-both", status: "Owned" },
    {
      id: "c-ordered",
      userId: ALICE,
      itemId: "item-ordered",
      orderId: "order-1",
      status: "Ordered",
    },
    {
      id: "c-shipped",
      userId: ALICE,
      itemId: "item-shipped",
      orderId: "order-1",
      status: "Shipped",
    },
    { id: "c-elsewhere", userId: ALICE, itemId: "item-elsewhere", status: "Owned" },
  ]);
  await db.insert(wishlistItem).values([
    { id: "w-wished", userId: ALICE, itemId: "item-wished" },
    { id: "w-both", userId: ALICE, itemId: "item-both" },
  ]);
});

async function call(as: string, path: string) {
  const response = await app.handle(
    new Request(`http://localhost/api${path}`, { headers: { "x-test-user": as } }),
  );
  const json = response.headers.get("content-type")?.includes("json");
  return { status: response.status, body: json ? await response.json() : await response.text() };
}

type ItemsPage = {
  readonly items: readonly { readonly id: string; readonly title: string }[];
  readonly totalCount: number;
};

async function itemsOf(as: string, state: string, query = ""): Promise<ItemsPage> {
  const answered = await call(as, `/entries/${MIKU}/items?state=${state}${query}`);
  expect(answered.status).toBe(200);
  return answered.body as ItemsPage;
}

test("an Item Entry's page names it for its owner", async () => {
  expect(await call(ALICE, `/entries/${MIKU}`)).toEqual({
    status: 200,
    body: { entry: { id: MIKU, name: "Hatsune Miku", category: "Characters" } },
  });
});

test.each([
  ["an unknown Item Entry", ALICE, "entry-missing"],
  ["another user's Item Entry", BOB, MIKU],
])("%s answers 404", async (_case, as, entryId) => {
  expect(await call(as, `/entries/${entryId}`)).toEqual({
    status: 404,
    body: "Item Entry not found",
  });
});

test("Owned lists each Owned Collection Item of the Item Entry's Items", async () => {
  const owned = await itemsOf(ALICE, "owned");
  expect(owned.items.map((shown) => shown.id)).toEqual(["item-both", "item-owned", "item-owned"]);
  expect(owned.totalCount).toBe(3);
});

test("Ordered lists the Ordered and Shipped Order Items, not the Owned ones", async () => {
  const ordered = await itemsOf(ALICE, "ordered");
  expect(ordered.items.map((shown) => shown.id)).toEqual(["item-ordered", "item-shipped"]);
});

test("Wishlist lists the Wishlist Items, with an Owned Item that is also wished", async () => {
  const wished = await itemsOf(ALICE, "wishlist");
  expect(wished.items.map((shown) => shown.id)).toEqual(["item-both", "item-wished"]);
});

test("a page of Owned keeps the whole count", async () => {
  const page = await itemsOf(ALICE, "owned", "&limit=2&offset=2");
  expect(page.items.map((shown) => shown.id)).toEqual(["item-owned"]);
  expect(page.totalCount).toBe(3);
});

test("Owned counts as many Collection Items as the Analytics row shows", async () => {
  const section = await call(ALICE, "/analytics/characters");
  const { rows } = (section.body as { analytics: { rows: { id: string; itemCount: number }[] } })
    .analytics;
  const miku = rows.find((row) => row.id === MIKU);
  const owned = await itemsOf(ALICE, "owned");
  expect(miku?.itemCount).toBe(owned.totalCount);
});

test.each(["owned", "ordered", "wishlist"])(
  "another user's Item Entry lists no %s Items",
  async (state) => {
    expect(await itemsOf(BOB, state)).toEqual({ items: [], totalCount: 0 });
  },
);

test("an unknown state answers 422", async () => {
  const answered = await call(ALICE, `/entries/${MIKU}/items?state=shipped`);
  expect(answered.status).toBe(422);
});
