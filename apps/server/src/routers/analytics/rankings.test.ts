import { beforeAll, expect, mock, test } from "bun:test";
import { Elysia } from "elysia";
import { initLogger } from "evlog";
import * as authSchema from "@myakiba/db/schema/auth";
import * as figureSchema from "@myakiba/db/schema/figure";
import { createTestDatabase } from "../../../test/database";

const { collection, item } = figureSchema;

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
const { default: analyticsRouter } = await import("./index");
const app = new Elysia({ prefix: "/api" }).use(analyticsRouter);

const userId = "user-1";
const SHOPS = ["Shop A", "Shop B", "Shop C", "Shop D", "Shop E", "Shop F"] as const;

beforeAll(async () => {
  await db
    .insert(authSchema.user)
    .values({ id: userId, name: "Ryan", email: "r@example.com", username: "ryan" });
  await db
    .insert(item)
    .values({ id: "item-1", externalId: 101, title: "Miku", category: "Prepainted", scale: "1/7" });
  await db.insert(collection).values(
    SHOPS.flatMap((shop, index) =>
      Array.from({ length: SHOPS.length - index }, (_, copy) => ({
        id: `c-${index}-${copy}`,
        userId,
        itemId: "item-1",
        status: "Owned" as const,
        price: (index + 1) ** 3 * 100,
        shop,
      })),
    ),
  );
});

const get = async <T>(path: string): Promise<T> => {
  const response = await app.handle(
    new Request(`http://localhost/api${path}`, { headers: { "x-test-user": userId } }),
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as { readonly analytics: T };
  return body.analytics;
};

type ShopRanking = readonly { readonly shop: string }[];

test("the overview ranks the top five shops by count and by spend", async () => {
  const { shops } = await get<{
    readonly shops: {
      readonly uniqueOwned: number;
      readonly topByCount: ShopRanking;
      readonly topBySpend: ShopRanking;
    };
  }>("/analytics");
  expect(shops.uniqueOwned).toBe(6);
  expect(shops.topByCount.map((row) => row.shop)).toEqual(SHOPS.slice(0, 5));
  expect(shops.topBySpend.map((row) => row.shop)).toEqual([
    "Shop E",
    "Shop F",
    "Shop D",
    "Shop C",
    "Shop B",
  ]);
});

test("the shops section still lists every shop past the overview's five", async () => {
  const section = await get<{ readonly totalCount: number; readonly rows: readonly unknown[] }>(
    "/analytics/shops?limit=10",
  );
  expect(section.totalCount).toBe(6);
  expect(section.rows).toHaveLength(6);
});

test.each(["%2C", "a,b"])("a section search for %s answers with no rows", async (search) => {
  const section = await get<{ readonly totalCount: number }>(`/analytics/shops?search=${search}`);
  expect(section.totalCount).toBe(0);
});
