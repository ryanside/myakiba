import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { asc, eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { initLogger } from "evlog";
import * as authSchema from "@myakiba/db/schema/auth";
import * as figureSchema from "@myakiba/db/schema/figure";
import { vocabularyResponseSchema } from "@myakiba/contracts/vocabulary/schema";
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
const { default: vocabularyRouter } = await import("./index");
const { VOCABULARY_LIMIT } = await import("./module");
const app = new Elysia({ prefix: "/api" }).use(vocabularyRouter);

const userId = "user-1";
const at = (day: number) => new Date(Date.UTC(2026, 0, day, 12));

beforeEach(async () => {
  await db.execute('TRUNCATE "user", item CASCADE');
  await db.insert(authSchema.user).values([
    { id: userId, name: "Ryan", email: "r@example.com", username: "ryan" },
    { id: "user-2", name: "Aki", email: "a@example.com", username: "aki" },
  ]);
  await db.insert(item).values([
    { id: "item-1", ownerId: userId, externalId: 1, title: "Miku" },
    { id: "item-2", ownerId: "user-2", externalId: 1, title: "Miku" },
  ]);
});

const rename = async (body: Readonly<Record<string, string>>, as = userId) => {
  const response = await app.handle(
    new Request("http://localhost/api/vocabulary/shops/rename", {
      method: "POST",
      headers: { "x-test-user": as, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  const json = response.headers.get("content-type")?.includes("json");
  return { status: response.status, body: json ? await response.json() : await response.text() };
};

const shopsOf = async (owner: string) => ({
  collection: await db
    .select({ id: collection.id, shop: collection.shop })
    .from(collection)
    .where(eq(collection.userId, owner))
    .orderBy(asc(collection.id)),
  orders: await db
    .select({ id: order.id, shop: order.shop })
    .from(order)
    .where(eq(order.userId, owner))
    .orderBy(asc(order.id)),
});

const read = async () => {
  const response = await app.handle(
    new Request("http://localhost/api/vocabulary", { headers: { "x-test-user": userId } }),
  );
  return { status: response.status, body: vocabularyResponseSchema.parse(await response.json()) };
};

const collectionRow = (id: string, shop: string, day: number, owner = userId) => ({
  id,
  userId: owner,
  itemId: owner === userId ? "item-1" : "item-2",
  shop,
  updatedAt: at(day),
});

const tagged = (id: string, tags: string[], day: number, owner = userId) => ({
  ...collectionRow(id, "", day, owner),
  tags,
});

const orderRow = (id: string, shop: string, day: number, owner = userId) => ({
  id,
  userId: owner,
  title: id,
  shop,
  updatedAt: at(day),
});

describe("GET /api/vocabulary", () => {
  test("counts each exact shop spelling across Collection Items and Orders", async () => {
    await db.insert(order).values([orderRow("o-1", "AmiAmi", 3), orderRow("o-2", "amiami", 1)]);
    await db
      .insert(collection)
      .values([
        collectionRow("c-1", "AmiAmi", 2),
        collectionRow("c-2", "AmiAmi", 5),
        collectionRow("c-3", "amiami", 1),
      ]);

    const { status, body } = await read();

    expect(status).toBe(200);
    expect(body.shops).toEqual([
      {
        value: "AmiAmi",
        uses: 3,
        ownedUses: 2,
        orderUses: 1,
        lastUsedAt: at(5).toISOString(),
      },
      { value: "amiami", uses: 2, ownedUses: 1, orderUses: 1, lastUsedAt: at(1).toISOString() },
    ]);
  });

  test("leaves out blank shops and other users' shops", async () => {
    await db
      .insert(order)
      .values([orderRow("o-1", "", 1), orderRow("o-2", "Their Shop", 1, "user-2")]);
    await db
      .insert(collection)
      .values([collectionRow("c-1", "", 1), collectionRow("c-2", "Other Shop", 1, "user-2")]);

    const { body } = await read();

    expect(body.shops).toEqual([]);
  });

  test("orders by total uses, then the latest use, then the shop", async () => {
    await db
      .insert(order)
      .values([
        orderRow("o-1", "Mandarake", 1),
        orderRow("o-2", "Mandarake", 2),
        orderRow("o-3", "Suruga-ya", 9),
        orderRow("o-4", "Beta", 4),
        orderRow("o-5", "Alpha", 4),
      ]);
    await db.insert(collection).values([collectionRow("c-1", "Suruga-ya", 3)]);

    const { body } = await read();

    expect(body.shops.map((shop) => shop.value)).toEqual([
      "Suruga-ya",
      "Mandarake",
      "Alpha",
      "Beta",
    ]);
  });

  test(`returns at most ${VOCABULARY_LIMIT} Order shops, the most used first`, async () => {
    const shops = Array.from({ length: VOCABULARY_LIMIT + 1 }, (_, index) =>
      orderRow(`o-${index}`, `Shop ${String(index).padStart(3, "0")}`, 1),
    );
    await db.insert(order).values(shops);
    await db.insert(order).values(orderRow("o-extra", "Shop 500", 1));

    const { body } = await read();

    expect(body.shops).toHaveLength(VOCABULARY_LIMIT);
    expect(body.shops[0]?.value).toBe("Shop 500");
    expect(body.shops.at(-1)?.value).toBe("Shop 498");
  });

  test("keeps a Collection shop that busier Order shops would crowd out", async () => {
    const shops = Array.from({ length: VOCABULARY_LIMIT + 1 }, (_, index) =>
      orderRow(`o-${index}`, `Shop ${String(index).padStart(3, "0")}`, 1),
    );
    await db
      .insert(order)
      .values([...shops, ...shops.map((row) => ({ ...row, id: `${row.id}-b` }))]);
    await db.insert(collection).values(collectionRow("c-quiet", "Quiet Shop", 1));

    const { body } = await read();

    expect(body.shops.find((shop) => shop.value === "Quiet Shop")).toMatchObject({
      ownedUses: 1,
      orderUses: 0,
    });
  });

  test("counts only Owned Collection Items, yet still suggests a preordered shop", async () => {
    await db
      .insert(collection)
      .values([
        collectionRow("c-owned", "AmiAmi", 1),
        { ...collectionRow("c-preorder", "AmiAmi", 2), status: "Ordered" as const },
        { ...collectionRow("c-only-preorder", "Plaza Japan", 3), status: "Ordered" as const },
      ]);

    const { body } = await read();

    expect(body.shops.map(({ value, ownedUses }) => ({ value, ownedUses }))).toEqual([
      { value: "AmiAmi", ownedUses: 1 },
      { value: "Plaza Japan", ownedUses: 0 },
    ]);
  });

  test("counts every Collection Item toward a shop's uses, owned or not", async () => {
    await db.insert(collection).values([
      ...["c-1", "c-2", "c-3"].map((id) => ({
        ...collectionRow(id, "HobbyLink", 1),
        status: "Ordered" as const,
      })),
      collectionRow("c-4", "hobby link", 2),
    ]);

    const { body } = await read();

    expect(body.shops.map(({ value, uses, ownedUses }) => ({ value, uses, ownedUses }))).toEqual([
      { value: "HobbyLink", uses: 3, ownedUses: 0 },
      { value: "hobby link", uses: 1, ownedUses: 1 },
    ]);
  });
});

describe("GET /api/vocabulary tags", () => {
  test("counts each exact tag spelling over every Collection Item and over Owned ones", async () => {
    await db
      .insert(collection)
      .values([
        tagged("c-1", ["Favorite", "limited"], 2),
        tagged("c-2", ["Favorite"], 5),
        { ...tagged("c-3", ["favorite"], 1), status: "Ordered" as const },
        tagged("c-4", ["fav orite"], 3),
      ]);

    const { body } = await read();

    expect(body.tags).toEqual([
      { value: "Favorite", uses: 2, ownedUses: 2, lastUsedAt: at(5).toISOString() },
      { value: "fav orite", uses: 1, ownedUses: 1, lastUsedAt: at(3).toISOString() },
      { value: "limited", uses: 1, ownedUses: 1, lastUsedAt: at(2).toISOString() },
      { value: "favorite", uses: 1, ownedUses: 0, lastUsedAt: at(1).toISOString() },
    ]);
  });

  test("counts a Collection Item once when it repeats a tag", async () => {
    await db.insert(collection).values(tagged("c-1", ["Favorite", "Favorite"], 1));

    const { body } = await read();

    expect(body.tags.map(({ value, uses, ownedUses }) => ({ value, uses, ownedUses }))).toEqual([
      { value: "Favorite", uses: 1, ownedUses: 1 },
    ]);
  });

  test("leaves out blank tags and other users' tags", async () => {
    await db
      .insert(collection)
      .values([tagged("c-1", ["", "  "], 1), tagged("c-2", ["Theirs"], 1, "user-2")]);

    const { body } = await read();

    expect(body.tags).toEqual([]);
  });

  test(`returns at most ${VOCABULARY_LIMIT} tags, the most used first`, async () => {
    const tags = Array.from(
      { length: VOCABULARY_LIMIT + 1 },
      (_, index) => `Tag ${String(index).padStart(3, "0")}`,
    );
    await db
      .insert(collection)
      .values([tagged("c-1", tags, 1), tagged("c-2", [`Tag ${VOCABULARY_LIMIT}`], 1)]);

    const { body } = await read();

    expect(body.tags).toHaveLength(VOCABULARY_LIMIT);
    expect(body.tags[0]?.value).toBe(`Tag ${VOCABULARY_LIMIT}`);
    expect(body.tags.at(-1)?.value).toBe(`Tag ${VOCABULARY_LIMIT - 2}`);
  });
});

describe("GET /api/vocabulary scales", () => {
  const scaled = (id: string, scale: string, owner = userId) => ({
    id,
    ownerId: owner,
    externalId: null,
    title: id,
    scale,
  });
  const owning = (id: string, itemId: string, owner = userId) => ({
    id,
    userId: owner,
    itemId,
  });

  test("counts the Owned Collection Items of each scale, leaving out scales only on unowned ones", async () => {
    await db
      .insert(item)
      .values([
        scaled("seventh-a", "1/7"),
        scaled("seventh-b", "1/7"),
        scaled("eighth", "1/8"),
        scaled("sixth", "1/6"),
      ]);
    await db
      .insert(collection)
      .values([
        owning("c-1", "seventh-a"),
        owning("c-2", "seventh-b"),
        owning("c-3", "eighth"),
        { ...owning("c-4", "eighth"), status: "Ordered" as const },
        { ...owning("c-5", "sixth"), status: "Shipped" as const },
        owning("c-6", "item-1"),
      ]);

    const { body } = await read();

    expect(body.scales).toEqual([
      { value: "1/7", ownedUses: 2 },
      { value: "1/8", ownedUses: 1 },
      { value: "n/a", ownedUses: 1 },
    ]);
  });

  test("leaves out other users' scales", async () => {
    await db.insert(item).values(scaled("theirs", "1/4", "user-2"));
    await db.insert(collection).values(owning("c-1", "theirs", "user-2"));

    const { body } = await read();

    expect(body.scales).toEqual([]);
  });

  test(`returns at most ${VOCABULARY_LIMIT} scales, the most owned first`, async () => {
    const items = Array.from({ length: VOCABULARY_LIMIT + 1 }, (_, index) =>
      scaled(`scale-${index}`, `1/${String(index).padStart(3, "0")}`),
    );
    await db.insert(item).values(items);
    await db
      .insert(collection)
      .values([
        ...items.map((row) => owning(`c-${row.id}`, row.id)),
        owning("c-extra", `scale-${VOCABULARY_LIMIT}`),
      ]);

    const { body } = await read();

    expect(body.scales).toHaveLength(VOCABULARY_LIMIT);
    expect(body.scales[0]).toEqual({ value: `1/${VOCABULARY_LIMIT}`, ownedUses: 2 });
    expect(body.scales.at(-1)?.value).toBe(`1/${VOCABULARY_LIMIT - 2}`);
  });
});

describe("POST /api/vocabulary/shops/rename", () => {
  beforeEach(async () => {
    await db
      .insert(collection)
      .values([
        collectionRow("c-1", "AmiAmi", 1),
        collectionRow("c-2", "amiami", 1),
        collectionRow("c-3", "Ami Ami", 1),
        collectionRow("c-4", "Mandarake", 1),
        collectionRow("c-other", "amiami", 1, "user-2"),
      ]);
    await db
      .insert(order)
      .values([
        orderRow("o-1", "amiami", 1),
        orderRow("o-2", "AmiAmi", 1),
        orderRow("o-other", "amiami", 1, "user-2"),
      ]);
  });

  test("renames a shop on every Collection Item and Order and answers how many changed", async () => {
    const { status, body } = await rename({ from: "Mandarake", to: "Mandarake Nakano" });

    const shops = await shopsOf(userId);

    expect(status).toBe(200);
    expect(body).toEqual({ collectionItems: 1, orders: 0 });
    expect(shops.collection).toContainEqual({ id: "c-4", shop: "Mandarake Nakano" });
  });

  test("renaming to a shop already in use merges the two", async () => {
    const { body } = await rename({ from: "amiami", to: "AmiAmi" });

    expect(body).toEqual({ collectionItems: 1, orders: 1 });
    expect(await shopsOf(userId)).toEqual({
      collection: [
        { id: "c-1", shop: "AmiAmi" },
        { id: "c-2", shop: "AmiAmi" },
        { id: "c-3", shop: "Ami Ami" },
        { id: "c-4", shop: "Mandarake" },
      ],
      orders: [
        { id: "o-1", shop: "AmiAmi" },
        { id: "o-2", shop: "AmiAmi" },
      ],
    });
  });

  test("leaves another user's identical shop alone", async () => {
    await rename({ from: "amiami", to: "AmiAmi" });

    expect(await shopsOf("user-2")).toEqual({
      collection: [{ id: "c-other", shop: "amiami" }],
      orders: [{ id: "o-other", shop: "amiami" }],
    });
  });

  test("matches the old name exactly, so a second run changes nothing", async () => {
    await rename({ from: "amiami", to: "AmiAmi" });
    const before = await shopsOf(userId);

    const { status, body } = await rename({ from: "amiami", to: "AmiAmi" });

    expect(status).toBe(200);
    expect(body).toEqual({ collectionItems: 0, orders: 0 });
    expect(await shopsOf(userId)).toEqual(before);
  });

  test("moves the renamed shop's uses into the shop it merged with", async () => {
    await rename({ from: "Ami Ami", to: "AmiAmi" });
    await rename({ from: "amiami", to: "AmiAmi" });

    const { body } = await read();

    expect(body.shops.map(({ value, uses }) => ({ value, uses }))).toEqual([
      { value: "AmiAmi", uses: 5 },
      { value: "Mandarake", uses: 1 },
    ]);
  });

  test("trims the new name and matches the old name exactly as saved", async () => {
    const { body: padded } = await rename({ from: "  Mandarake ", to: " Suruga-ya  " });
    const { body } = await rename({ from: "Mandarake", to: " Suruga-ya  " });

    const shops = await shopsOf(userId);

    expect(padded).toEqual({ collectionItems: 0, orders: 0 });
    expect(body).toEqual({ collectionItems: 1, orders: 0 });
    expect(shops.collection).toContainEqual({ id: "c-4", shop: "Suruga-ya" });
  });

  test("renames a shop saved with stray spaces", async () => {
    await db.update(collection).set({ shop: "Mandarake " }).where(eq(collection.id, "c-4"));

    const { body } = await rename({ from: "Mandarake ", to: "Mandarake" });

    const shops = await shopsOf(userId);

    expect(body).toEqual({ collectionItems: 1, orders: 0 });
    expect(shops.collection).toContainEqual({ id: "c-4", shop: "Mandarake" });
  });

  test.each([
    ["the same name", { from: "AmiAmi", to: "AmiAmi" }],
    ["the same name once trimmed", { from: "AmiAmi", to: " AmiAmi " }],
    ["a blank new name", { from: "AmiAmi", to: "   " }],
    ["a blank old name", { from: "", to: "AmiAmi" }],
    ["a new name over the shop limit", { from: "AmiAmi", to: "a".repeat(201) }],
    ["a missing name", { from: "AmiAmi" }],
    ["an extra field", { from: "AmiAmi", to: "Ami", userId: "user-2" }],
  ])("refuses %s and changes nothing", async (_case, body) => {
    const before = await shopsOf(userId);

    const { status } = await rename(body);

    expect(status).toBe(422);
    expect(await shopsOf(userId)).toEqual(before);
  });

  describe("when the commit fails", () => {
    beforeEach(async () => {
      await db.execute(`
        CREATE FUNCTION refuse_order_shop() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.shop = 'Refused' THEN RAISE EXCEPTION 'refused at commit'; END IF;
          RETURN NEW;
        END $$;
        CREATE CONSTRAINT TRIGGER refuse_order_shop AFTER UPDATE ON "order"
          DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION refuse_order_shop();
      `);
    });

    afterEach(async () => {
      await db.execute(`
        DROP TRIGGER IF EXISTS refuse_order_shop ON "order";
        DROP FUNCTION IF EXISTS refuse_order_shop();
      `);
    });

    test("renames neither the Collection Items nor the Orders", async () => {
      const before = await shopsOf(userId);

      const { status } = await rename({ from: "amiami", to: "Refused" });

      expect(status).toBe(500);
      expect(await shopsOf(userId)).toEqual(before);
    });
  });
});
