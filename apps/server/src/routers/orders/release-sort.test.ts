import { beforeAll, expect, mock, test } from "bun:test";
import { Elysia } from "elysia";
import { initLogger } from "evlog";
import * as authSchema from "@myakiba/db/schema/auth";
import { collection, item, item_release, order } from "@myakiba/db/schema/figure";
import { createTestDatabase } from "../../../test/database";

initLogger({ enabled: false });

const OWNER = "user-release-sort";

await mock.module("@myakiba/auth/server", () => ({
  auth: {
    handler: () => new Response(null, { status: 404 }),
    api: {
      getSession: async ({ headers }: { headers: Headers }) => {
        const id = headers.get("x-test-user");
        return id ? { user: { id }, session: { id: `s-${id}` } } : null;
      },
    },
  },
}));

const db = await createTestDatabase();
const { default: ordersRouter } = await import("./index");
const app = new Elysia({ prefix: "/api" }).use(ordersRouter);

const MONTH_RELEASE = "c0000000-0000-4000-8000-000000000001";
const DAY_RELEASE = "c0000000-0000-4000-8000-000000000002";

beforeAll(async () => {
  await db
    .insert(authSchema.user)
    .values({ id: OWNER, name: "Sort", email: "sort@example.com", username: "sort" });
  await db.insert(order).values([
    {
      id: "order-month",
      userId: OWNER,
      title: "Month first",
      releaseDate: "2026-06-01",
      releaseDatePrecision: "month",
      createdAt: new Date("2026-01-01T00:00:00Z"),
    },
    {
      id: "order-day",
      userId: OWNER,
      title: "Day second",
      releaseDate: "2026-06-01",
      releaseDatePrecision: "day",
      createdAt: new Date("2026-01-02T00:00:00Z"),
    },
  ]);
  await db.insert(item).values({ id: "item-sort", ownerId: OWNER, externalId: 501, title: "Sort" });
  await db.insert(item_release).values([
    { id: MONTH_RELEASE, itemId: "item-sort", date: "2026-06-01", datePrecision: "month" },
    { id: DAY_RELEASE, itemId: "item-sort", date: "2026-06-01", datePrecision: "day" },
  ]);
  await db.insert(collection).values([
    {
      id: "col-month",
      userId: OWNER,
      itemId: "item-sort",
      orderId: "order-month",
      releaseId: MONTH_RELEASE,
      status: "Ordered",
      createdAt: new Date("2026-01-01T00:00:00Z"),
    },
    {
      id: "col-day",
      userId: OWNER,
      itemId: "item-sort",
      orderId: "order-month",
      releaseId: DAY_RELEASE,
      status: "Ordered",
      createdAt: new Date("2026-01-02T00:00:00Z"),
    },
  ]);
});

const idsOf = async (url: string, key: "orderId" | "id") => {
  const response = await app.handle(
    new Request(`http://localhost/api${url}`, { headers: { "x-test-user": OWNER } }),
  );
  const text = await response.text();
  return [...text.matchAll(new RegExp(`"${key}":"((?:order|col)-[a-z]+)"`, "gu"))].map(
    (match) => match[1],
  );
};

test("Orders sorted by Release Date fall back to when they were made, whatever their precision", async () => {
  expect(await idsOf("/orders?sort=releaseDate&order=asc", "orderId")).toEqual([
    "order-month",
    "order-day",
  ]);
});

test("an Order's items sorted by Release Date fall back to when they were added, whatever their precision", async () => {
  expect(await idsOf("/orders/order-month/items?sort=releaseDate&order=asc", "id")).toEqual([
    "col-month",
    "col-day",
  ]);
});
