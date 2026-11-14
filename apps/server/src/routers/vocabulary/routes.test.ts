import { beforeEach, describe, expect, mock, test } from "bun:test";
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
const { VOCABULARY_SHOP_LIMIT } = await import("./module");
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
        collectionUses: 2,
        orderUses: 1,
        lastUsedAt: at(5).toISOString(),
      },
      { value: "amiami", collectionUses: 1, orderUses: 1, lastUsedAt: at(1).toISOString() },
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

  test(`returns at most ${VOCABULARY_SHOP_LIMIT} Order shops, the most used first`, async () => {
    const shops = Array.from({ length: VOCABULARY_SHOP_LIMIT + 1 }, (_, index) =>
      orderRow(`o-${index}`, `Shop ${String(index).padStart(3, "0")}`, 1),
    );
    await db.insert(order).values(shops);
    await db.insert(order).values(orderRow("o-extra", "Shop 500", 1));

    const { body } = await read();

    expect(body.shops).toHaveLength(VOCABULARY_SHOP_LIMIT);
    expect(body.shops[0]?.value).toBe("Shop 500");
    expect(body.shops.at(-1)?.value).toBe("Shop 498");
  });

  test("keeps a Collection shop that busier Order shops would crowd out", async () => {
    const shops = Array.from({ length: VOCABULARY_SHOP_LIMIT + 1 }, (_, index) =>
      orderRow(`o-${index}`, `Shop ${String(index).padStart(3, "0")}`, 1),
    );
    await db
      .insert(order)
      .values([...shops, ...shops.map((row) => ({ ...row, id: `${row.id}-b` }))]);
    await db.insert(collection).values(collectionRow("c-quiet", "Quiet Shop", 1));

    const { body } = await read();

    expect(body.shops.find((shop) => shop.value === "Quiet Shop")).toMatchObject({
      collectionUses: 1,
      orderUses: 0,
    });
  });
});
