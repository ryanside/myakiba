import { afterAll, beforeAll, expect, mock, setSystemTime, test } from "bun:test";
import { Elysia } from "elysia";
import { initLogger } from "evlog";
import * as authSchema from "@myakiba/db/schema/auth";
import { order } from "@myakiba/db/schema/figure";
import { createTestDatabase } from "../../../test/database";

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
const { default: dashboardRouter } = await import("./index");
const app = new Elysia({ prefix: "/api" }).use(dashboardRouter);

const userId = "user-chart";

beforeAll(async () => {
  setSystemTime(new Date("2026-11-15T12:00:00Z"));
  await db.insert(authSchema.user).values({
    id: userId,
    name: "Ryan",
    email: "chart@example.com",
    username: "chart",
  });
  await db.insert(order).values(
    [
      ["day-before-window", "2026-08-31"],
      ["first-day", "2026-09-01"],
      ["this-month", "2026-11-20"],
      ["next-year", "2027-02-10"],
      ["next-year-too", "2027-02-28"],
      ["last-day", "2027-08-31"],
      ["day-after-window", "2027-09-01"],
    ].map(([id = "", releaseDate]) => ({
      id,
      userId,
      title: id,
      status: "Ordered" as const,
      releaseDate,
    })),
  );
});

afterAll(() => {
  setSystemTime();
});

test("in November the Orders chart runs from September to next August, each month with its year", async () => {
  const response = await app.handle(
    new Request("http://localhost/api/dashboard", { headers: { "x-test-user": userId } }),
  );
  expect(response.status).toBe(200);
  const { monthlyOrders } = (await response.json()) as {
    readonly monthlyOrders: readonly { year: number; month: number; orderCount: number }[];
  };

  expect(
    monthlyOrders.map(({ year, month, orderCount }) => `${year}-${month}:${orderCount}`),
  ).toEqual([
    "2026-9:1",
    "2026-10:0",
    "2026-11:1",
    "2026-12:0",
    "2027-1:0",
    "2027-2:2",
    "2027-3:0",
    "2027-4:0",
    "2027-5:0",
    "2027-6:0",
    "2027-7:0",
    "2027-8:1",
  ]);
});
