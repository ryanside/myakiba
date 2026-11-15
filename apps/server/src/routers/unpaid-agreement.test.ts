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
const { default: expensesRouter } = await import("./expenses/index");
const app = new Elysia({ prefix: "/api" })
  .use(dashboardRouter)
  .use(ordersRouter)
  .use(expensesRouter);

const oneOrder = "user-one-order";
const twoOrders = "user-two-orders";
const paidApart = "user-paid-apart";

async function seedOrderedOrder(userId: string) {
  await db.insert(item).values([
    {
      id: `${userId}-miku`,
      ownerId: userId,
      externalId: 101,
      title: "Miku",
      category: "Prepainted",
    },
    { id: `${userId}-rin`, ownerId: userId, externalId: 102, title: "Rin", category: "Prepainted" },
  ]);
  await db.insert(order).values({
    id: `${userId}-ordered`,
    userId,
    title: "AmiAmi",
    shop: "AmiAmi",
    status: "Ordered",
    paid: false,
    orderDate: "2024-03-01",
    releaseDate: "2024-03-15",
    shippingFee: 500,
  });
  await db.insert(collection).values([
    {
      id: `${userId}-ordered-item`,
      userId,
      itemId: `${userId}-miku`,
      orderId: `${userId}-ordered`,
      status: "Ordered",
      paid: false,
      price: 1000,
    },
    {
      id: `${userId}-paid-item`,
      userId,
      itemId: `${userId}-rin`,
      orderId: `${userId}-ordered`,
      status: "Ordered",
      paid: true,
      price: 2000,
    },
  ]);
}

beforeAll(async () => {
  await db.insert(authSchema.user).values([
    { id: oneOrder, name: "Ryan", email: "r@example.com", username: "ryan" },
    { id: twoOrders, name: "Aki", email: "a@example.com", username: "aki" },
    { id: paidApart, name: "Mei", email: "m@example.com", username: "mei" },
  ]);
  await seedOrderedOrder(oneOrder);
  await seedOrderedOrder(twoOrders);
  await db.insert(item).values([
    { id: "len", ownerId: twoOrders, externalId: 103, title: "Len", category: "Prepainted" },
    { id: "luka", ownerId: twoOrders, externalId: 104, title: "Luka", category: "Prepainted" },
  ]);
  await db.insert(order).values({
    id: "paid-order",
    userId: twoOrders,
    title: "HLJ",
    shop: "HLJ",
    status: "Ordered",
    paid: true,
    orderDate: "2024-03-02",
    paymentDate: "2024-03-05",
    releaseDate: "2024-03-20",
    shippingFee: 300,
    taxes: 200,
  });
  await db.insert(collection).values([
    {
      id: "paid-order-ordered-item",
      userId: twoOrders,
      itemId: "len",
      orderId: "paid-order",
      status: "Ordered",
      paid: false,
      price: 4000,
    },
    {
      id: "paid-order-owned-item",
      userId: twoOrders,
      itemId: "luka",
      orderId: "paid-order",
      status: "Owned",
      paid: true,
      price: 8000,
    },
  ]);
  await seedPaidApartFromStatus();
});

async function seedPaidApartFromStatus() {
  await db.insert(item).values([
    { id: "teto", ownerId: paidApart, externalId: 105, title: "Teto", category: "Prepainted" },
    { id: "gumi", ownerId: paidApart, externalId: 106, title: "Gumi", category: "Prepainted" },
  ]);
  await db.insert(order).values([
    {
      id: "shipped-unpaid",
      userId: paidApart,
      title: "Pay on delivery",
      shop: "AmiAmi",
      status: "Shipped",
      paid: false,
      orderDate: "2024-04-01",
      shippingFee: 700,
    },
    {
      id: "ordered-paid",
      userId: paidApart,
      title: "Paid up front",
      shop: "HLJ",
      status: "Ordered",
      paid: true,
      orderDate: "2024-04-02",
      paymentDate: "2024-04-02",
      shippingFee: 400,
    },
  ]);
  await db.insert(collection).values([
    {
      id: "shipped-unpaid-item",
      userId: paidApart,
      itemId: "teto",
      orderId: "shipped-unpaid",
      status: "Shipped",
      paid: false,
      price: 3000,
    },
    {
      id: "ordered-paid-item",
      userId: paidApart,
      itemId: "gumi",
      orderId: "ordered-paid",
      status: "Ordered",
      paid: true,
      price: 6000,
    },
  ]);
}

type Dashboard = { readonly unpaidCosts: number };
type OrdersList = {
  readonly items: readonly { readonly total: number | string }[];
  readonly totalSpent: number;
  readonly unpaidCosts: number;
};
type ExpensesOrders = {
  readonly summary: {
    readonly spend: number;
    readonly orderItems: { readonly spend: number };
    readonly fees: { readonly spend: number };
  };
  readonly kpis: {
    readonly paidOrderCount: number;
    readonly orderItemCount: number;
    readonly unpaidOrderCount: number;
    readonly unpaidCosts: number;
  };
};
type ExpenseShops = {
  readonly items: readonly { readonly shop: string; readonly spend: number }[];
};
type Monthly = {
  readonly paidAmount: number;
  readonly unpaidAmount: number;
  readonly unpaidOrderCount: number;
};

const get = async <T>(userId: string, path: string): Promise<T> => {
  const response = await app.handle(
    new Request(`http://localhost/api${path}`, { headers: { "x-test-user": userId } }),
  );
  expect(response.status).toBe(200);
  return (await response.json()) as T;
};

describe("an Unpaid Order holding an unpaid item, a paid item and a shipping fee", () => {
  test("the Dashboard, the Orders page and Expenses show the same Unpaid Costs with no filter", async () => {
    const dashboard = await get<Dashboard>(oneOrder, "/dashboard");
    const orders = await get<OrdersList>(oneOrder, "/orders?limit=10");
    const expenses = await get<ExpensesOrders>(oneOrder, "/expenses/orders");

    expect({
      dashboard: dashboard.unpaidCosts,
      orders: orders.unpaidCosts,
      expenses: expenses.kpis.unpaidCosts,
    }).toEqual({ dashboard: 1500, orders: 1500, expenses: 1500 });
  });

  test("an Expenses date range does not hide an Unpaid Order", async () => {
    const expenses = await get<ExpensesOrders>(
      oneOrder,
      "/expenses/orders?dateStart=2025-01-01&dateEnd=2025-12-31",
    );

    expect({
      unpaidOrderCount: expenses.kpis.unpaidOrderCount,
      unpaidCosts: expenses.kpis.unpaidCosts,
    }).toEqual({ unpaidOrderCount: 1, unpaidCosts: 1500 });
  });

  test("an Expenses Shop filter for another Shop leaves no Unpaid Costs", async () => {
    const expenses = await get<ExpensesOrders>(oneOrder, "/expenses/orders?shop=HLJ");

    expect({
      unpaidOrderCount: expenses.kpis.unpaidOrderCount,
      unpaidCosts: expenses.kpis.unpaidCosts,
    }).toEqual({ unpaidOrderCount: 0, unpaidCosts: 0 });
  });
});

describe("each item's price follows its own Paid and each Order's fees follow the Order's", () => {
  test("Spend and Unpaid Costs on the Orders page add up to its Order Totals", async () => {
    const orders = await get<OrdersList>(twoOrders, "/orders?limit=10");
    const orderTotals = orders.items.reduce((sum, row) => sum + Number(row.total), 0);

    expect(orderTotals).toBe(16_000);
    expect(orders.totalSpent + orders.unpaidCosts).toBe(orderTotals);
  });

  test("an unpaid item on a Paid Order counts as Unpaid Costs on every page", async () => {
    const dashboard = await get<Dashboard>(twoOrders, "/dashboard");
    const orders = await get<OrdersList>(twoOrders, "/orders?limit=10");
    const expenses = await get<ExpensesOrders>(twoOrders, "/expenses/orders");

    expect({
      dashboard: dashboard.unpaidCosts,
      orders: orders.unpaidCosts,
      expenses: expenses.kpis.unpaidCosts,
    }).toEqual({ dashboard: 5500, orders: 5500, expenses: 5500 });
  });

  test("Expenses counts a paid item on an Unpaid Order as Order Item Spend, and an unpaid item on a Paid Order as neither", async () => {
    const orders = await get<OrdersList>(twoOrders, "/orders?limit=10");
    const expenses = await get<ExpensesOrders>(twoOrders, "/expenses/orders");

    expect({
      orderSpend: expenses.summary.spend,
      orderItemSpend: expenses.summary.orderItems.spend,
      feeSpend: expenses.summary.fees.spend,
      orderItemCount: expenses.kpis.orderItemCount,
      paidOrderCount: expenses.kpis.paidOrderCount,
      unpaidOrderCount: expenses.kpis.unpaidOrderCount,
    }).toEqual({
      orderSpend: orders.totalSpent,
      orderItemSpend: 10_000,
      feeSpend: 500,
      orderItemCount: 2,
      paidOrderCount: 1,
      unpaidOrderCount: 1,
    });
  });

  test("Scoped Shop Spend for Orders adds up to Order Spend", async () => {
    const expenses = await get<ExpensesOrders>(twoOrders, "/expenses/orders");
    const shops = await get<ExpenseShops>(twoOrders, "/expenses/shops?scope=orders");
    const spendByShop = Object.fromEntries(shops.items.map((row) => [row.shop, row.spend]));

    expect(spendByShop).toEqual({ AmiAmi: 2000, HLJ: 8500 });
    expect(shops.items.reduce((sum, row) => sum + row.spend, 0)).toBe(expenses.summary.spend);
  });

  test("the Dashboard month splits its Orders' amounts the same way", async () => {
    const monthly = await get<Monthly>(twoOrders, "/dashboard/monthly?month=3&year=2024");

    expect({
      paidAmount: monthly.paidAmount,
      unpaidAmount: monthly.unpaidAmount,
      unpaidOrderCount: monthly.unpaidOrderCount,
    }).toEqual({ paidAmount: 10_500, unpaidAmount: 5500, unpaidOrderCount: 1 });
  });
});

describe("Paid is apart from the Acquisition Status", () => {
  test("a Shipped Order that is unpaid counts as Unpaid Costs and not Spend, and an Ordered Order that is paid counts as Spend", async () => {
    const dashboard = await get<Dashboard>(paidApart, "/dashboard");
    const orders = await get<OrdersList>(paidApart, "/orders?limit=10");
    const expenses = await get<ExpensesOrders>(paidApart, "/expenses/orders");

    expect({
      dashboard: dashboard.unpaidCosts,
      orders: orders.unpaidCosts,
      expenses: expenses.kpis.unpaidCosts,
      ordersSpend: orders.totalSpent,
      expensesSpend: expenses.summary.spend,
      paidOrderCount: expenses.kpis.paidOrderCount,
      unpaidOrderCount: expenses.kpis.unpaidOrderCount,
    }).toEqual({
      dashboard: 3700,
      orders: 3700,
      expenses: 3700,
      ordersSpend: 6400,
      expensesSpend: 6400,
      paidOrderCount: 1,
      unpaidOrderCount: 1,
    });
  });
});
