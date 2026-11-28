import { beforeAll, expect, mock, test } from "bun:test";
import { Elysia } from "elysia";
import { initLogger } from "evlog";
import * as authSchema from "@myakiba/db/schema/auth";
import { collection, item, item_release, order, wishlistItem } from "@myakiba/db/schema/figure";
import { format } from "date-fns";
import { createTestDatabase } from "../../test/database";

initLogger({ enabled: false });

const OWNER = "user-precision";

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
    "./calendar/index",
    "./collection/index",
    "./dashboard/index",
    "./expenses/index",
    "./item/index",
    "./orders/index",
    "./search/index",
    "./wishlist/index",
  ].map(async (path) => {
    const router = await import(path);
    return router.default;
  }),
);
const app = routers.reduce((built, router) => built.use(router), new Elysia({ prefix: "/api" }));

const JUNE = "2026-06-01";
const THIS_MONTH = format(new Date(), "yyyy-MM-01");
const RELEASE = "b0000000-0000-4000-8000-000000000001";

beforeAll(async () => {
  await db.insert(authSchema.user).values({
    id: OWNER,
    name: "Precision",
    email: "precision@example.com",
    username: "precision",
  });
  await db
    .insert(item)
    .values({ id: "item-june", ownerId: OWNER, externalId: 98_777, title: "June Figure" });
  await db.insert(item_release).values({
    id: RELEASE,
    itemId: "item-june",
    date: JUNE,
    datePrecision: "month",
    price: 15_000,
    priceCurrency: "JPY",
  });
  await db.insert(order).values({
    id: "order-june",
    userId: OWNER,
    title: "June order",
    shop: "Shop",
    paid: true,
    shippingFee: 500,
    releaseDate: JUNE,
    releaseDatePrecision: "month",
  });
  await db.insert(order).values({
    id: "order-this-month",
    userId: OWNER,
    title: "This month's order",
    releaseDate: THIS_MONTH,
    releaseDatePrecision: "month",
  });
  await db.insert(collection).values([
    {
      id: "col-june",
      userId: OWNER,
      itemId: "item-june",
      orderId: "order-june",
      releaseId: RELEASE,
      status: "Ordered",
      shop: "Shop",
      price: 1000,
    },
    { id: "col-owned", userId: OWNER, itemId: "item-june", releaseId: RELEASE, price: 1000 },
  ]);
  await db.insert(wishlistItem).values({ userId: OWNER, itemId: "item-june", position: 0 });
});

async function read(request: Request) {
  const response = await app.handle(request);
  return { status: response.status, text: await response.text() };
}

const get = (url: string) =>
  read(new Request(`http://localhost/api${url}`, { headers: { "x-test-user": OWNER } }));

type DraftBody =
  | { readonly orderIds: readonly string[] }
  | { readonly collectionIds: readonly string[] };

const post = (url: string, body: DraftBody) =>
  read(
    new Request(`http://localhost/api${url}`, {
      method: "POST",
      headers: { "x-test-user": OWNER, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

const MONTH_PAIR = /"start":"(\d{4}-\d{2}-01)","precision":"month"/gu;
const BARE_FIRST = new RegExp(`"(${JUNE}|${THIS_MONTH})"`, "gu");

const shownAsMonths = ({ status, text }: { readonly status: number; readonly text: string }) => {
  expect(status).toBe(200);
  const pairs = text.match(MONTH_PAIR)?.length ?? 0;
  expect(pairs).toBeGreaterThan(0);
  expect(text.match(BARE_FIRST)?.length ?? 0).toBe(pairs);
};

test.each([
  "/item/98777",
  "/item/item-june/releases",
  "/item/98777/orders",
  "/collection",
  "/collection/col-june",
  "/orders",
  "/orders/order-june",
  "/orders/order-june/items",
  "/orders/order-june/item-releases",
  "/calendar?view=items&month=6&year=2026",
  "/calendar?view=orders&month=6&year=2026",
  "/dashboard",
  "/dashboard/release-calendar?month=6&year=2026",
  "/dashboard/monthly?month=6&year=2026",
  "/wishlist?today=2026-05-01",
  "/search/items?query=June",
  "/add/items?ids=item-june",
  "/expenses/shops/shop:Shop/expansion?scope=orders",
])("GET %s answers a month-only date as its month, never as a day", async (url) => {
  shownAsMonths(await get(url));
});

test.each([
  ["/orders/merge-draft", { orderIds: ["order-june"] }],
  ["/orders/new-order-draft", { collectionIds: ["col-june"] }],
] as const)("POST %s drafts a month-only date as its month", async (url, body) => {
  shownAsMonths(await post(url, body));
});
