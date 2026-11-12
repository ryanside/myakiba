import { beforeAll, expect, mock, test } from "bun:test";
import { Elysia } from "elysia";
import { initLogger } from "evlog";
import * as authSchema from "@myakiba/db/schema/auth";
import {
  collection,
  item,
  item_release,
  list,
  listMember,
  order,
  wishlistItem,
} from "@myakiba/db/schema/figure";
import { createTestDatabase } from "../../test/database";

initLogger({ enabled: false });

const OWNER = "user-pictures";

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
await mock.module("@myakiba/redis/client", () => ({ redis: { eval: async () => [1, 1800] } }));

const db = await createTestDatabase();
const routers = await Promise.all(
  [
    "./add/index",
    "./analytics/index",
    "./calendar/index",
    "./collection/index",
    "./dashboard/index",
    "./expenses/index",
    "./item/index",
    "./lists/index",
    "./orders/index",
    "./search/index",
    "./wishlist/index",
  ].map(async (path) => {
    const router = await import(path);
    return router.default;
  }),
);
const app = routers.reduce((built, router) => built.use(router), new Elysia({ prefix: "/api" }));

const KEY = `items/${"a".repeat(64)}.jpg`;
const KEYED_URL = `https://test.s3.us-east-1.amazonaws.com/${KEY}`;
const LEGACY_URL = "https://static.myakiba.app/98778-legacy.jpg";
const KEYED_RELEASE = "a0000000-0000-4000-8000-000000000001";
const LEGACY_RELEASE = "a0000000-0000-4000-8000-000000000002";

beforeAll(async () => {
  await db.insert(authSchema.user).values({
    id: OWNER,
    name: "Pictures",
    email: "pictures@example.com",
    username: "pictures",
  });
  await db.insert(item).values([
    { id: "keyed", ownerId: OWNER, externalId: 98_777, title: "Keyed Figure", imageKey: KEY },
    {
      id: "legacy",
      ownerId: OWNER,
      externalId: 98_778,
      title: "Legacy Figure",
      legacyImageUrl: LEGACY_URL,
    },
  ]);
  await db.insert(item_release).values([
    { id: KEYED_RELEASE, itemId: "keyed", date: "2026-06-15", price: 15_000, priceCurrency: "JPY" },
    {
      id: LEGACY_RELEASE,
      itemId: "legacy",
      date: "2026-06-20",
      price: 15_000,
      priceCurrency: "JPY",
    },
  ]);
  await db.insert(order).values({
    id: "order-1",
    userId: OWNER,
    title: "Spring order",
    shop: "Shop",
    releaseDate: "2026-06-15",
  });
  await db.insert(collection).values([
    {
      id: "col-keyed",
      userId: OWNER,
      itemId: "keyed",
      orderId: "order-1",
      shop: "Shop",
      price: 1000,
    },
    {
      id: "col-legacy",
      userId: OWNER,
      itemId: "legacy",
      orderId: "order-1",
      shop: "Shop",
      price: 1000,
    },
    ...(
      [
        { itemId: "keyed", releaseId: KEYED_RELEASE },
        { itemId: "legacy", releaseId: LEGACY_RELEASE },
      ] as const
    ).map(({ itemId, releaseId }) => ({
      id: `col-${itemId}-ordered`,
      userId: OWNER,
      itemId,
      orderId: "order-1",
      releaseId,
      status: "Ordered" as const,
      shop: "Shop",
      price: 1000,
    })),
  ]);
  await db.insert(list).values({ id: "list-1", userId: OWNER, title: "Shelf" });
  await db.insert(listMember).values([
    { id: "member-1", listId: "list-1", userId: OWNER, itemId: "keyed", position: 0 },
    { id: "member-2", listId: "list-1", userId: OWNER, collectionId: "col-legacy", position: 1 },
  ]);
  await db.insert(wishlistItem).values([
    { userId: OWNER, itemId: "keyed", position: 0 },
    { userId: OWNER, itemId: "legacy", position: 1 },
  ]);
});

async function get(url: string) {
  const response = await app.handle(
    new Request(`http://localhost/api${url}`, { headers: { "x-test-user": OWNER } }),
  );
  return { status: response.status, text: await response.text() };
}

const BOTH = [
  "/collection",
  "/orders",
  "/orders/order-1/items",
  "/lists",
  "/lists/list-1/members",
  "/wishlist?today=2026-06-01",
  "/search/items?query=Figure",
  "/search/command?search=Figure",
  "/calendar?view=items&month=6&year=2026",
  "/calendar?view=orders&month=6&year=2026",
  "/dashboard/release-calendar?month=6&year=2026",
  "/analytics/shops/items?match=Shop",
  "/expenses/shops/shop:Shop/expansion?scope=collection",
  "/add/items?ids=keyed&ids=legacy",
];

test.each(BOTH)(
  "%s shows a keyed picture by its URL and a legacy picture as stored",
  async (url) => {
    const { status, text } = await get(url);

    expect(status).toBe(200);
    expect(text).toContain(KEYED_URL);
    expect(text).toContain(LEGACY_URL);
    expect(text.replaceAll(KEYED_URL, "")).not.toContain(KEY);
  },
);

test.each([
  ["/item/98777", KEYED_URL],
  ["/item/98778", LEGACY_URL],
])("%s shows its own picture", async (url, picture) => {
  const { status, text } = await get(url);

  expect(status).toBe(200);
  expect(text).toContain(picture);
});
