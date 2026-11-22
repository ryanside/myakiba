import { beforeAll, describe, expect, mock, test } from "bun:test";
import { Elysia } from "elysia";
import { initLogger } from "evlog";
import * as authSchema from "@myakiba/db/schema/auth";
import * as figureSchema from "@myakiba/db/schema/figure";
import { createTestDatabase } from "../../test/database";

const { collection, entry, entry_to_item, item, order } = figureSchema;

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
const { default: collectionRouter } = await import("./collection/index");
const { default: analyticsRouter } = await import("./analytics/index");
const app = new Elysia({ prefix: "/api" })
  .use(dashboardRouter)
  .use(ordersRouter)
  .use(expensesRouter)
  .use(collectionRouter)
  .use(analyticsRouter);

const oneOrder = "user-one-order";
const twoOrders = "user-two-orders";
const paidApart = "user-paid-apart";
const ownedUnpaid = "user-owned-unpaid";
const feesPaid = "user-fees-paid";

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
    { id: ownedUnpaid, name: "Yui", email: "y@example.com", username: "yui" },
    { id: feesPaid, name: "Ren", email: "n@example.com", username: "ren" },
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
  await seedOwnedUnpaid();
  await seedFeesPaid();
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

async function seedOwnedUnpaid() {
  await db.insert(item).values([
    {
      id: "kaito",
      ownerId: ownedUnpaid,
      externalId: 107,
      title: "Kaito",
      category: "Prepainted",
      scale: "1/7",
    },
    {
      id: "meiko",
      ownerId: ownedUnpaid,
      externalId: 108,
      title: "Meiko",
      category: "Prepainted",
      scale: "1/7",
    },
  ]);
  await db
    .insert(entry)
    .values({ id: "vocaloid", ownerId: ownedUnpaid, category: "Origins", name: "Vocaloid" });
  await db.insert(entry_to_item).values([
    { ownerId: ownedUnpaid, entryId: "vocaloid", itemId: "kaito" },
    { ownerId: ownedUnpaid, entryId: "vocaloid", itemId: "meiko" },
  ]);
  await db.insert(order).values({
    id: "received-order",
    userId: ownedUnpaid,
    title: "Received, paid later",
    shop: "AmiAmi",
    status: "Owned",
    paid: true,
    orderDate: "2024-05-01",
    paymentDate: "2024-05-02",
    collectionDate: "2024-06-01",
    shippingFee: 500,
  });
  await db.insert(collection).values([
    {
      id: "owned-unpaid-item",
      userId: ownedUnpaid,
      itemId: "kaito",
      orderId: "received-order",
      status: "Owned",
      paid: false,
      price: 30_000,
      shop: "AmiAmi",
      collectionDate: "2024-06-01",
    },
    {
      id: "owned-paid-item",
      userId: ownedUnpaid,
      itemId: "meiko",
      orderId: "received-order",
      status: "Owned",
      paid: true,
      price: 8000,
      shop: "AmiAmi",
      collectionDate: "2024-06-01",
    },
  ]);
}

async function seedFeesPaid() {
  await db.insert(item).values([
    { id: "una", ownerId: feesPaid, externalId: 109, title: "Una", category: "Prepainted" },
    { id: "ia", ownerId: feesPaid, externalId: 110, title: "IA", category: "Prepainted" },
    { id: "miki", ownerId: feesPaid, externalId: 111, title: "Miki", category: "Prepainted" },
  ]);
  await db.insert(order).values([
    {
      id: "fees-paid",
      userId: feesPaid,
      title: "Fees paid",
      shop: "AmiAmi",
      status: "Ordered",
      paid: true,
      orderDate: "2024-07-01",
      releaseDate: "2024-07-10",
      shippingFee: 500,
    },
    {
      id: "paid-in-full",
      userId: feesPaid,
      title: "Paid in full",
      shop: "HLJ",
      status: "Ordered",
      paid: true,
      orderDate: "2024-07-02",
      releaseDate: "2024-07-20",
      shippingFee: 300,
    },
    {
      id: "not-yet-priced",
      userId: feesPaid,
      title: "Not yet priced",
      shop: "HLJ",
      status: "Ordered",
      paid: false,
      orderDate: "2024-07-03",
      releaseDate: "2024-07-25",
    },
  ]);
  await db.insert(collection).values([
    {
      id: "fees-paid-una",
      userId: feesPaid,
      itemId: "una",
      orderId: "fees-paid",
      status: "Ordered",
      paid: false,
      price: 30_000,
    },
    {
      id: "fees-paid-ia",
      userId: feesPaid,
      itemId: "ia",
      orderId: "fees-paid",
      status: "Ordered",
      paid: false,
      price: 30_000,
    },
    {
      id: "paid-in-full-miki",
      userId: feesPaid,
      itemId: "miki",
      orderId: "paid-in-full",
      status: "Ordered",
      paid: true,
      price: 5000,
    },
  ]);
}

type Dashboard = {
  readonly unpaidOrderCount: number;
  readonly ordersSummary: { readonly totalActiveOrderCount: number };
  readonly unpaidCosts: number;
  readonly collectionStats: { readonly totalSpent: number };
  readonly categoriesOwned: readonly { readonly name: string; readonly totalValue: number }[];
};
type CollectionList = { readonly totalValue: number; readonly paidItemCount: number };
type ExpensesCollection = {
  readonly summary: {
    readonly spend: number;
    readonly orderLinked: { readonly spend: number };
    readonly standalone: { readonly spend: number };
  };
  readonly kpis: { readonly averageItemCost: number };
  readonly breakdown: readonly { readonly spend: number }[];
  readonly spendingByPeriod: readonly { readonly collectionItems: number }[];
  readonly averageCostByPeriod: readonly { readonly collectionItems: number }[];
  readonly averageCostToDate: readonly { readonly collectionItems: number }[];
};
type AnalyticsOverview = {
  readonly analytics: {
    readonly entries: readonly {
      readonly category: string;
      readonly topBySpend: readonly { readonly totalSpent: number }[];
    }[];
    readonly shops: { readonly topBySpend: readonly { readonly totalSpent: number }[] };
    readonly scales: { readonly topBySpend: readonly { readonly totalSpent: number }[] };
  };
};
type AnalyticsSection = {
  readonly analytics: {
    readonly kpis: { readonly totalSpent: number; readonly averageSpent: number };
    readonly rows: readonly { readonly totalSpent: number }[];
  };
};
type OrdersList = {
  readonly items: readonly {
    readonly orderId: string;
    readonly title: string;
    readonly total: number;
    readonly payment: string;
    readonly unpaidCosts: number;
  }[];
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
  readonly items: readonly {
    readonly shop: string;
    readonly spend: number;
    readonly averageItemCost?: number;
  }[];
};
type Monthly = {
  readonly paidAmount: number;
  readonly unpaidAmount: number;
  readonly unpaidOrderCount: number;
  readonly orders: readonly { readonly orderId: string; readonly unpaidCosts: number }[];
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
    const orderTotals = orders.items.reduce((sum, row) => sum + row.total, 0);

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
      unpaidOrderCount: 2,
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
    }).toEqual({ paidAmount: 10_500, unpaidAmount: 5500, unpaidOrderCount: 2 });
  });
});

describe("an Order whose Order Fees are paid and whose two Order Items are not is Partly paid", () => {
  test("it counts as unpaid beside its Unpaid Costs, as an Order marked unpaid with nothing priced does", async () => {
    const dashboard = await get<Dashboard>(feesPaid, "/dashboard");
    const monthly = await get<Monthly>(feesPaid, "/dashboard/monthly?month=7&year=2024");
    const expenses = await get<ExpensesOrders>(feesPaid, "/expenses/orders");

    expect({
      dashboard: [dashboard.unpaidOrderCount, dashboard.unpaidCosts],
      monthly: [monthly.unpaidOrderCount, monthly.unpaidAmount],
      expenses: [expenses.kpis.unpaidOrderCount, expenses.kpis.unpaidCosts],
      paidOrderCount: expenses.kpis.paidOrderCount,
    }).toEqual({
      dashboard: [2, 60_000],
      monthly: [2, 60_000],
      expenses: [2, 60_000],
      paidOrderCount: 2,
    });
  });

  test("the Unpaid filter lists it and the Paid filter lists only the Order paid in full", async () => {
    const unpaid = await get<OrdersList>(
      feesPaid,
      "/orders?limit=10&sort=title&order=asc&paid=false",
    );
    const paid = await get<OrdersList>(feesPaid, "/orders?limit=10&paid=true");

    expect({
      unpaid: unpaid.items.map((row) => [row.title, row.payment]),
      unpaidCosts: unpaid.unpaidCosts,
      paid: paid.items.map((row) => [row.title, row.payment]),
    }).toEqual({
      unpaid: [
        ["Fees paid", "partly"],
        ["Not yet priced", "unpaid"],
      ],
      unpaidCosts: 60_000,
      paid: [["Paid in full", "paid"]],
    });
  });

  test("an Expenses Paid Orders count links to every Order whose own Paid is yes", async () => {
    const expenses = await get<ExpensesOrders>(feesPaid, "/expenses/orders");
    const linked = await get<OrdersList>(
      feesPaid,
      "/orders?limit=10&sort=title&order=asc&feesPaid=true",
    );

    expect(linked.items.map((row) => row.title)).toEqual(["Fees paid", "Paid in full"]);
    expect(linked.items.length).toBe(expenses.kpis.paidOrderCount);
  });

  test("with the fee filter cleared, the list holds the Order whose fees are unpaid again", async () => {
    const linked = await get<OrdersList>(feesPaid, "/orders?limit=10&feesPaid=true");
    const cleared = await get<OrdersList>(feesPaid, "/orders?limit=10");

    expect({
      linked: linked.items.some((row) => row.title === "Not yet priced"),
      cleared: cleared.items.some((row) => row.title === "Not yet priced"),
    }).toEqual({ linked: false, cleared: true });
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

describe("the Orders page lists the Orders behind Unpaid Costs", () => {
  test("Unpaid Costs of at least 1 and the Unpaid filter both keep a Paid Order that holds an unpaid item", async () => {
    const everyOrder = await get<OrdersList>(twoOrders, "/orders?limit=10");
    const owing = await get<OrdersList>(twoOrders, "/orders?limit=10&unpaidCostsMin=1");
    const unpaidOrders = await get<OrdersList>(twoOrders, "/orders?limit=10&paid=false");

    expect({
      owing: owing.items.map((row) => row.title).toSorted(),
      owingUnpaidCosts: owing.unpaidCosts,
      unpaidOrders: unpaidOrders.items.map((row) => row.title).toSorted(),
      unpaidOrdersUnpaidCosts: unpaidOrders.unpaidCosts,
    }).toEqual({
      owing: ["AmiAmi", "HLJ"],
      owingUnpaidCosts: everyOrder.unpaidCosts,
      unpaidOrders: ["AmiAmi", "HLJ"],
      unpaidOrdersUnpaidCosts: everyOrder.unpaidCosts,
    });
  });

  test("Unpaid Costs of at least 1 leaves out an Order with nothing unpaid", async () => {
    const owing = await get<OrdersList>(paidApart, "/orders?limit=10&unpaidCostsMin=1");

    expect(owing.items.map((row) => row.title)).toEqual(["Pay on delivery"]);
  });

  test("an Unpaid Costs range keeps only the Orders inside it", async () => {
    const small = await get<OrdersList>(twoOrders, "/orders?limit=10&unpaidCostsMax=2000");

    expect(small.items.map((row) => row.title)).toEqual(["AmiAmi"]);
  });
});

describe("the Orders page lists the Orders behind Order Spend", () => {
  test("Order Spend of at least 1 keeps an Unpaid Order that holds a paid item, which the Paid Orders link leaves out", async () => {
    const everyOrder = await get<OrdersList>(twoOrders, "/orders?limit=10");
    const spent = await get<OrdersList>(twoOrders, "/orders?limit=10&orderSpendMin=1");
    const paidOrders = await get<OrdersList>(twoOrders, "/orders?limit=10&feesPaid=true");

    expect({
      spent: spent.items.map((row) => row.title).toSorted(),
      spentTotalSpent: spent.totalSpent,
      paidOrders: paidOrders.items.map((row) => row.title),
      paidOrdersTotalSpent: paidOrders.totalSpent,
    }).toEqual({
      spent: ["AmiAmi", "HLJ"],
      spentTotalSpent: everyOrder.totalSpent,
      paidOrders: ["HLJ"],
      paidOrdersTotalSpent: 8500,
    });
  });

  test("Order Spend of at least 1 leaves out an Order with nothing paid", async () => {
    const spent = await get<OrdersList>(paidApart, "/orders?limit=10&orderSpendMin=1");

    expect(spent.items.map((row) => row.title)).toEqual(["Paid up front"]);
  });

  test("an Order Spend range keeps only the Orders inside it", async () => {
    const small = await get<OrdersList>(twoOrders, "/orders?limit=10&orderSpendMax=3000");

    expect(small.items.map((row) => row.title)).toEqual(["AmiAmi"]);
  });
});

describe("an Owned Order Item that is still unpaid", () => {
  test("counts as Unpaid Costs and in no page's Spend", async () => {
    const collectionPage = await get<CollectionList>(ownedUnpaid, "/collection?limit=10");
    const dashboard = await get<Dashboard>(ownedUnpaid, "/dashboard");
    const expenses = await get<ExpensesCollection>(ownedUnpaid, "/expenses/collection");
    const expenseShops = await get<ExpenseShops>(ownedUnpaid, "/expenses/shops?scope=collection");
    const { analytics } = await get<AnalyticsOverview>(ownedUnpaid, "/analytics");
    const { analytics: origins } = await get<AnalyticsSection>(ownedUnpaid, "/analytics/origins");
    const { analytics: shops } = await get<AnalyticsSection>(ownedUnpaid, "/analytics/shops");
    const { analytics: scales } = await get<AnalyticsSection>(ownedUnpaid, "/analytics/scales");
    const sum = (rows: readonly { readonly collectionItems: number }[]) =>
      rows.reduce((total, row) => total + row.collectionItems, 0);

    expect({
      collectionPage: collectionPage.totalValue,
      dashboardCategories: dashboard.categoriesOwned.map((row) => row.totalValue),
      dashboardUnpaidCosts: dashboard.unpaidCosts,
      dashboardTotalSpent: dashboard.collectionStats.totalSpent,
      expenses: expenses.summary.spend,
      expensesOrderLinked: expenses.summary.orderLinked.spend,
      expensesStandalone: expenses.summary.standalone.spend,
      expensesByPeriod: sum(expenses.spendingByPeriod),
      expensesByCategory: expenses.breakdown.map((row) => row.spend),
      expenseShops: expenseShops.items.map((row) => row.spend),
      analyticsOrigins: analytics.entries
        .find((row) => row.category === "Origins")
        ?.topBySpend.map((row) => row.totalSpent),
      analyticsShops: analytics.shops.topBySpend.map((row) => row.totalSpent),
      analyticsScales: analytics.scales.topBySpend.map((row) => row.totalSpent),
      originsSection: [origins.kpis.totalSpent, ...origins.rows.map((row) => row.totalSpent)],
      shopsSection: [shops.kpis.totalSpent, ...shops.rows.map((row) => row.totalSpent)],
      scalesSection: [scales.kpis.totalSpent, ...scales.rows.map((row) => row.totalSpent)],
    }).toEqual({
      collectionPage: 8000,
      dashboardCategories: [8000],
      dashboardUnpaidCosts: 30_000,
      dashboardTotalSpent: 8000,
      expenses: 8000,
      expensesOrderLinked: 8000,
      expensesStandalone: 0,
      expensesByPeriod: 8000,
      expensesByCategory: [8000],
      expenseShops: [8000],
      analyticsOrigins: [8000],
      analyticsShops: [8000],
      analyticsScales: [8000],
      originsSection: [8000, 8000],
      shopsSection: [8000, 8000],
      scalesSection: [8000, 8000],
    });
  });

  test("its Owned Order, whose fees are paid, counts as unpaid on the Dashboard though it is not active", async () => {
    const dashboard = await get<Dashboard>(ownedUnpaid, "/dashboard");

    expect({
      unpaidOrderCount: dashboard.unpaidOrderCount,
      activeOrders: dashboard.ordersSummary.totalActiveOrderCount,
      unpaidCosts: dashboard.unpaidCosts,
    }).toEqual({ unpaidOrderCount: 1, activeOrders: 0, unpaidCosts: 30_000 });
  });

  test("Collection Spend, Fee Spend and Unpaid Costs add up to the Order Total", async () => {
    const orders = await get<OrdersList>(ownedUnpaid, "/orders?limit=10");
    const collectionExpenses = await get<ExpensesCollection>(ownedUnpaid, "/expenses/collection");
    const orderExpenses = await get<ExpensesOrders>(ownedUnpaid, "/expenses/orders");
    const orderTotal = orders.items.reduce((total, row) => total + row.total, 0);

    expect(orderTotal).toBe(38_500);
    expect(orders.totalSpent + orders.unpaidCosts).toBe(orderTotal);
    expect(orderExpenses.summary.spend + orderExpenses.kpis.unpaidCosts).toBe(orderTotal);
    expect(
      collectionExpenses.summary.orderLinked.spend +
        orderExpenses.summary.fees.spend +
        orderExpenses.kpis.unpaidCosts,
    ).toBe(orderTotal);
  });

  test("averages divide Collection Spend by the paid items it sums", async () => {
    const collectionPage = await get<CollectionList>(ownedUnpaid, "/collection?limit=10");
    const expenses = await get<ExpensesCollection>(ownedUnpaid, "/expenses/collection");
    const expenseShops = await get<ExpenseShops>(ownedUnpaid, "/expenses/shops?scope=collection");
    const sections = await Promise.all(
      ["origins", "shops", "scales"].map((name) =>
        get<AnalyticsSection>(ownedUnpaid, `/analytics/${name}`),
      ),
    );
    const nonZero = (rows: readonly { readonly collectionItems: number }[]) =>
      rows.map((row) => row.collectionItems).filter((value) => value > 0);

    expect({
      collectionPagePaidItems: collectionPage.paidItemCount,
      expenses: expenses.kpis.averageItemCost,
      expensesByPeriod: nonZero(expenses.averageCostByPeriod),
      expensesToDate: nonZero(expenses.averageCostToDate),
      expenseShops: expenseShops.items.map((row) => row.averageItemCost),
      analyticsSections: sections.map(({ analytics }) => analytics.kpis.averageSpent),
    }).toEqual({
      collectionPagePaidItems: 1,
      expenses: 8000,
      expensesByPeriod: [8000],
      expensesToDate: [8000],
      expenseShops: [8000],
      analyticsSections: [8000, 8000, 8000],
    });
  });
});

describe("each Order's own Unpaid Costs", () => {
  const users = [oneOrder, twoOrders, paidApart, ownedUnpaid, feesPaid];

  test.each(users)(
    "%s: each row's Unpaid Costs is that Order's share of the page's, and the rows add up to it",
    async (userId) => {
      const orders = await get<OrdersList>(userId, "/orders?limit=10");
      const shares = await Promise.all(
        orders.items.map(async (row) => {
          const alone = await get<OrdersList>(
            userId,
            `/orders?limit=10&search=${encodeURIComponent(row.title)}`,
          );
          const detail = await get<{ readonly unpaidCosts: number }>(
            userId,
            `/orders/${row.orderId}`,
          );
          return { row: row.unpaidCosts, share: alone.unpaidCosts, detail: detail.unpaidCosts };
        }),
      );

      expect(orders.items.length).toBeGreaterThan(0);
      for (const { row, share, detail } of shares)
        expect({ row, detail }).toEqual({ row: share, detail: share });
      expect(orders.items.reduce((sum, row) => sum + row.unpaidCosts, 0)).toBe(orders.unpaidCosts);
    },
  );

  test("a Partly paid, a paid and an unpaid Order with nothing priced each carry their own Unpaid Costs", async () => {
    const orders = await get<OrdersList>(feesPaid, "/orders?limit=10&sort=title&order=asc");

    expect(orders.items.map((row) => [row.title, row.payment, row.unpaidCosts])).toEqual([
      ["Fees paid", "partly", 60_000],
      ["Not yet priced", "unpaid", 0],
      ["Paid in full", "paid", 0],
    ]);
  });

  test("the Dashboard board shows each Order the Unpaid Costs the Orders page does", async () => {
    const board = async (userId: string, month: number) => {
      const monthly = await get<Monthly>(userId, `/dashboard/monthly?month=${month}&year=2024`);
      return Object.fromEntries(monthly.orders.map((row) => [row.orderId, row.unpaidCosts]));
    };
    const page = async (userId: string) => {
      const orders = await get<OrdersList>(userId, "/orders?limit=10");
      return Object.fromEntries(orders.items.map((row) => [row.orderId, row.unpaidCosts]));
    };

    expect({ twoOrders: await board(twoOrders, 3), feesPaid: await board(feesPaid, 7) }).toEqual({
      twoOrders: await page(twoOrders),
      feesPaid: await page(feesPaid),
    });
  });
});
