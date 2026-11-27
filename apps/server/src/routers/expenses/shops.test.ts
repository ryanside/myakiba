import { beforeAll, expect, mock, test } from "bun:test";
import { Elysia } from "elysia";
import { initLogger } from "evlog";
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
const { default: expensesRouter } = await import("./index");
const app = new Elysia({ prefix: "/api" }).use(expensesRouter);

const userId = "user-1";
const SHOP_COUNT = 20;
const shopNumbers = Array.from({ length: SHOP_COUNT }, (_, index) => index + 1);

beforeAll(async () => {
  await db
    .insert(authSchema.user)
    .values({ id: userId, name: "Ryan", email: "r@example.com", username: "ryan" });
  await db.insert(item).values(
    shopNumbers.map((n) => ({
      id: `item-${n}`,
      ownerId: userId,
      externalId: n,
      title: `Item ${n}`,
    })),
  );
  await db.insert(order).values(
    shopNumbers.map((n) => ({
      id: `order-${n}`,
      userId,
      title: `Order ${n}`,
      shop: `Shop ${n}`,
      status: "Owned" as const,
      paid: true,
      shippingFee: 100 * n,
    })),
  );
  await db.insert(collection).values(
    shopNumbers.map((n) => ({
      id: `c-${n}`,
      userId,
      itemId: `item-${n}`,
      orderId: `order-${n}`,
      status: "Owned" as const,
      paid: true,
      price: 1000 * n,
      shop: `Shop ${n}`,
    })),
  );
});

type ShopsResponse = { items: { shop: string; share: number }[] };

test.each(["collection", "orders", "shipping"])(
  "GET /expenses/shops?scope=%s returns all 20 shops, largest Spend first",
  async (scope) => {
    const response = await app.handle(
      new Request(`http://localhost/api/expenses/shops?scope=${scope}`, {
        headers: { "x-test-user": userId },
      }),
    );
    expect(response.status).toBe(200);
    const { items } = (await response.json()) as ShopsResponse;

    expect(items.map((row) => row.shop)).toEqual(shopNumbers.map((n) => `Shop ${21 - n}`));
    expect(items.reduce((sum, row) => sum + row.share, 0)).toBeCloseTo(100, 6);
  },
);
