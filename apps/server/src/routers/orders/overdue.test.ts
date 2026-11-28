import { beforeAll, expect, mock, test } from "bun:test";
import { Elysia } from "elysia";
import { initLogger } from "evlog";
import * as authSchema from "@myakiba/db/schema/auth";
import { order } from "@myakiba/db/schema/figure";
import { createTestDatabase } from "../../../test/database";

initLogger({ enabled: false });

const OWNER = "user-overdue";
const OTHER = "user-overdue-other";

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

beforeAll(async () => {
  await db.insert(authSchema.user).values([
    { id: OWNER, name: "Overdue", email: "overdue@example.com", username: "overdue" },
    { id: OTHER, name: "Other", email: "overdue-other@example.com", username: "overdueother" },
  ]);
  await db.insert(order).values([
    {
      id: "order-day",
      userId: OWNER,
      title: "June 15",
      releaseDate: "2026-06-15",
      releaseDatePrecision: "day",
    },
    {
      id: "order-month",
      userId: OWNER,
      title: "June",
      releaseDate: "2026-06-01",
      releaseDatePrecision: "month",
    },
    {
      id: "order-year",
      userId: OWNER,
      title: "2026",
      releaseDate: "2026-01-01",
      releaseDatePrecision: "year",
    },
    {
      id: "order-shipped",
      userId: OWNER,
      title: "Shipped in June",
      releaseDate: "2026-06-01",
      releaseDatePrecision: "month",
      status: "Shipped",
    },
    { id: "order-undated", userId: OWNER, title: "No date" },
    {
      id: "order-other",
      userId: OTHER,
      title: "Someone else's June",
      releaseDate: "2026-06-01",
      releaseDatePrecision: "month",
    },
  ]);
});

const request = (url: string, init: RequestInit = {}) =>
  app.handle(
    new Request(`http://localhost/api${url}`, {
      ...init,
      headers: { "x-test-user": OWNER, "content-type": "application/json" },
    }),
  );

const overdueOn = async (today: string) => {
  const response = await request(`/orders?overdue=true&today=${today}`);
  expect(response.status).toBe(200);
  const text = await response.text();
  return [...text.matchAll(/"orderId":"(order-[a-z]+)"/gu)].map((match) => match[1]).toSorted();
};

test("an Ordered Order is overdue from the 1st after its release month, or January 1 after its year", async () => {
  expect(await overdueOn("2026-06-30")).toEqual([]);
  expect(await overdueOn("2026-07-01")).toEqual(["order-day", "order-month"]);
  expect(await overdueOn("2026-12-31")).toEqual(["order-day", "order-month"]);
  expect(await overdueOn("2027-01-01")).toEqual(["order-day", "order-month", "order-year"]);
});

test("Overdue without today's date is refused", async () => {
  const response = await request("/orders?overdue=true");
  expect(response.status).toBe(422);
});

test("an Order moved to a later month leaves Overdue until that month ends", async () => {
  const moved = await request("/orders/order-month", {
    method: "PUT",
    body: JSON.stringify({
      order: { releaseDate: { start: "2026-08-01", precision: "month" } },
      cascadeOptions: [],
    }),
  });
  expect(moved.status).toBe(200);

  expect(await overdueOn("2026-07-01")).toEqual(["order-day"]);
  expect(await overdueOn("2026-08-31")).toEqual(["order-day"]);
  expect(await overdueOn("2026-09-01")).toEqual(["order-day", "order-month"]);
});
