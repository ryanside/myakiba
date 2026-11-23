import { beforeAll, expect, mock, test } from "bun:test";
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
const { default: ordersRouter } = await import("./orders/index");
const { default: expensesRouter } = await import("./expenses/index");
const app = new Elysia({ prefix: "/api" }).use(ordersRouter).use(expensesRouter);

const userId = "user-1";

beforeAll(async () => {
  await db
    .insert(authSchema.user)
    .values({ id: userId, name: "Ryan", email: "r@example.com", username: "ryan" });
  await db.insert(item).values(
    ["miku", "rin", "len"].map((id, index) => ({
      id,
      ownerId: userId,
      externalId: 101 + index,
      title: id,
      category: "Prepainted" as const,
    })),
  );
  await db.insert(order).values([
    { id: "open", userId, title: "Unpaid, two items", shop: "AmiAmi", paid: false },
    { id: "fees", userId, title: "Paid, fees only", shop: "AmiAmi", paid: true, shippingFee: 500 },
    { id: "paid", userId, title: "Paid, two items", shop: "AmiAmi", paid: true },
  ]);
  await db.insert(collection).values([
    { id: "open-miku", userId, itemId: "miku", orderId: "open", price: 2000 },
    { id: "open-rin", userId, itemId: "rin", orderId: "open", price: 1000 },
    { id: "paid-rin", userId, itemId: "rin", orderId: "paid", price: 3000 },
    { id: "paid-free", userId, itemId: "len", orderId: "paid", price: 0 },
  ]);
});

const get = async <T>(path: string): Promise<T> => {
  const response = await app.handle(
    new Request(`http://localhost/api${path}`, { headers: { "x-test-user": userId } }),
  );
  expect(response.status).toBe(200);
  return (await response.json()) as T;
};

type OrdersList = { readonly items: readonly { readonly title: string }[] };
type ExpensesOrders = { readonly kpis: { readonly orderItemCount: number } };

test("the Orders page lists every Order that holds an item the Expenses Order Items count counts", async () => {
  const expenses = await get<ExpensesOrders>("/expenses/orders");
  const holding = await get<OrdersList>("/orders?limit=10&paidItemsMin=1");

  expect({
    orderItemCount: expenses.kpis.orderItemCount,
    holding: holding.items.map((row) => row.title).toSorted(),
  }).toEqual({
    orderItemCount: 2,
    holding: ["Paid, two items"],
  });
});
