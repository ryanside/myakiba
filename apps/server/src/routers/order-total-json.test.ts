import { beforeAll, describe, expect, mock, test } from "bun:test";
import { Elysia } from "elysia";
import { initLogger } from "evlog";
import * as authSchema from "@myakiba/db/schema/auth";
import * as figureSchema from "@myakiba/db/schema/figure";
import { createTestDatabase } from "../../test/database";

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
const { default: dashboardRouter } = await import("./dashboard/index");
const { default: ordersRouter } = await import("./orders/index");
const { default: calendarRouter } = await import("./calendar/index");
const app = new Elysia({ prefix: "/api" })
  .use(dashboardRouter)
  .use(ordersRouter)
  .use(calendarRouter);

const userId = "user-money";
const today = new Date();
const year = today.getUTCFullYear();
const month = today.getUTCMonth() + 1;
const midMonth = `${year}-${String(month).padStart(2, "0")}-15`;

beforeAll(async () => {
  await db
    .insert(authSchema.user)
    .values({ id: userId, name: "Ryan", email: "r@example.com", username: "ryan" });
  await db.insert(item).values({
    id: "miku",
    ownerId: userId,
    externalId: 101,
    title: "Miku",
    category: "Prepainted",
  });
  await db.insert(order).values({
    id: "order-1",
    userId,
    title: "AmiAmi",
    shop: "AmiAmi",
    status: "Ordered",
    paid: false,
    orderDate: midMonth,
    releaseDate: midMonth,
    shippingFee: 500,
  });
  await db.insert(collection).values({
    id: "order-1-item",
    userId,
    itemId: "miku",
    orderId: "order-1",
    status: "Ordered",
    price: 3000,
  });
});

type Total = { readonly total: unknown };

const get = async <T>(path: string): Promise<T> => {
  const response = await app.handle(
    new Request(`http://localhost/api${path}`, { headers: { "x-test-user": userId } }),
  );
  expect(response.status).toBe(200);
  return (await response.json()) as T;
};

describe("an Order's money is a JSON number on every page that shows it", () => {
  test("the Orders page sends each Order Total and its Spend and Unpaid Costs as numbers", async () => {
    const page = await get<{
      readonly items: readonly Total[];
      readonly totalSpent: unknown;
      readonly unpaidCosts: unknown;
    }>("/orders?limit=10");

    expect({
      total: page.items.map((row) => row.total),
      totalSpent: page.totalSpent,
      unpaidCosts: page.unpaidCosts,
    }).toEqual({ total: [3500], totalSpent: 0, unpaidCosts: 3500 });
  });

  test("the Order page sends its Order Total as a number", async () => {
    const detail = await get<Total>("/orders/order-1");

    expect(detail.total).toBe(3500);
  });

  test("the Dashboard sends each kanban Order Total as a number", async () => {
    const overview = await get<{ readonly orders: readonly Total[] }>("/dashboard");

    expect(overview.orders.map((row) => row.total)).toEqual([3500]);
  });

  test("the Dashboard month sends each kanban Order Total as a number", async () => {
    const monthly = await get<{ readonly orders: readonly Total[] }>(
      `/dashboard/monthly?month=${month}&year=${year}`,
    );

    expect(monthly.orders.map((row) => row.total)).toEqual([3500]);
  });

  test("the Calendar sends each Order Total as a number", async () => {
    const calendar = await get<{ readonly orders: readonly Total[] }>(
      `/calendar?view=orders&month=${month}&year=${year}`,
    );

    expect(calendar.orders.map((row) => row.total)).toEqual([3500]);
  });
});
