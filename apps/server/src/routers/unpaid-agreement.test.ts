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

const mixed = "user-mixed";
const paidApart = "user-paid-apart";
const ownedUnpaid = "user-owned-unpaid";
const detached = "user-detached";

async function seedMixed() {
  await db.insert(item).values([
    { id: "miku", ownerId: mixed, externalId: 101, title: "Miku", category: "Prepainted" },
    { id: "rin", ownerId: mixed, externalId: 102, title: "Rin", category: "Prepainted" },
    { id: "len", ownerId: mixed, externalId: 103, title: "Len", category: "Prepainted" },
    { id: "luka", ownerId: mixed, externalId: 104, title: "Luka", category: "Prepainted" },
  ]);
  await db.insert(order).values([
    {
      id: "unpaid-order",
      userId: mixed,
      title: "AmiAmi",
      shop: "AmiAmi",
      status: "Ordered",
      paid: false,
      orderDate: "2024-03-01",
      releaseDate: "2024-03-15",
      shippingFee: 500,
    },
    {
      id: "paid-order",
      userId: mixed,
      title: "HLJ",
      shop: "HLJ",
      status: "Ordered",
      paid: true,
      orderDate: "2024-03-02",
      paymentDate: "2024-03-05",
      releaseDate: "2024-03-20",
      shippingFee: 300,
      taxes: 200,
    },
  ]);
  await db.insert(collection).values([
    {
      id: "unpaid-order-miku",
      userId: mixed,
      itemId: "miku",
      orderId: "unpaid-order",
      status: "Ordered",
      price: 1000,
    },
    {
      id: "unpaid-order-rin",
      userId: mixed,
      itemId: "rin",
      orderId: "unpaid-order",
      status: "Ordered",
      price: 2000,
    },
    {
      id: "paid-order-len",
      userId: mixed,
      itemId: "len",
      orderId: "paid-order",
      status: "Ordered",
      price: 4000,
    },
    {
      id: "paid-order-luka",
      userId: mixed,
      itemId: "luka",
      orderId: "paid-order",
      status: "Owned",
      price: 8000,
    },
  ]);
}

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
      price: 3000,
    },
    {
      id: "ordered-paid-item",
      userId: paidApart,
      itemId: "gumi",
      orderId: "ordered-paid",
      status: "Ordered",
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
    paid: false,
    orderDate: "2024-05-01",
    collectionDate: "2024-06-01",
    shippingFee: 500,
  });
  await db.insert(collection).values([
    {
      id: "owned-in-unpaid-order",
      userId: ownedUnpaid,
      itemId: "kaito",
      orderId: "received-order",
      status: "Owned",
      price: 30_000,
      shop: "AmiAmi",
      collectionDate: "2024-06-01",
    },
    {
      id: "owned-outside-orders",
      userId: ownedUnpaid,
      itemId: "meiko",
      status: "Owned",
      price: 8000,
      shop: "AmiAmi",
      collectionDate: "2024-06-01",
    },
  ]);
}

async function seedDetached() {
  await db.insert(item).values({
    id: "nendo",
    ownerId: detached,
    externalId: 109,
    title: "Nendo",
    category: "Prepainted",
  });
  await db.insert(order).values({
    id: "pay-later",
    userId: detached,
    title: "Pay later",
    shop: "Mandarake",
    status: "Owned",
    paid: false,
    orderDate: "2024-07-01",
  });
  await db.insert(collection).values({
    id: "nendo-in-pay-later",
    userId: detached,
    itemId: "nendo",
    orderId: "pay-later",
    status: "Owned",
    price: 5000,
    shop: "Mandarake",
    collectionDate: "2024-07-01",
  });
}

beforeAll(async () => {
  await db.insert(authSchema.user).values([
    { id: mixed, name: "Ryan", email: "r@example.com", username: "ryan" },
    { id: paidApart, name: "Mei", email: "m@example.com", username: "mei" },
    { id: ownedUnpaid, name: "Yui", email: "y@example.com", username: "yui" },
    { id: detached, name: "Rei", email: "d@example.com", username: "rei" },
  ]);
  await seedMixed();
  await seedPaidApartFromStatus();
  await seedOwnedUnpaid();
  await seedDetached();
});

type Dashboard = {
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
  readonly items: readonly { readonly title: string; readonly total: number }[];
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
};

const get = async <T>(userId: string, path: string): Promise<T> => {
  const response = await app.handle(
    new Request(`http://localhost/api${path}`, { headers: { "x-test-user": userId } }),
  );
  expect(response.status).toBe(200);
  return (await response.json()) as T;
};

const titles = (list: OrdersList) => list.items.map((row) => row.title).toSorted();

describe("a Paid Order and an Unpaid Order, each holding items that carry no Paid of their own", () => {
  test("the Dashboard, the Orders page and Expenses show the Unpaid Order's whole Order Total as Unpaid Costs", async () => {
    const dashboard = await get<Dashboard>(mixed, "/dashboard");
    const orders = await get<OrdersList>(mixed, "/orders?limit=10");
    const expenses = await get<ExpensesOrders>(mixed, "/expenses/orders");

    expect({
      dashboard: dashboard.unpaidCosts,
      orders: orders.unpaidCosts,
      expenses: expenses.kpis.unpaidCosts,
    }).toEqual({ dashboard: 3500, orders: 3500, expenses: 3500 });
  });

  test("the Paid Order's whole Order Total is Spend, and Spend plus Unpaid Costs is every Order Total", async () => {
    const orders = await get<OrdersList>(mixed, "/orders?limit=10");
    const orderTotals = orders.items.reduce((sum, row) => sum + row.total, 0);

    expect({ orderTotals, totalSpent: orders.totalSpent, unpaidCosts: orders.unpaidCosts }).toEqual(
      { orderTotals: 16_000, totalSpent: 12_500, unpaidCosts: 3500 },
    );
  });

  test("Expenses counts the Paid Order's items and fees as Order Spend, and one Paid Order and one Unpaid Order", async () => {
    const orders = await get<OrdersList>(mixed, "/orders?limit=10");
    const expenses = await get<ExpensesOrders>(mixed, "/expenses/orders");

    expect({
      orderSpend: expenses.summary.spend,
      orderItemSpend: expenses.summary.orderItems.spend,
      feeSpend: expenses.summary.fees.spend,
      orderItemCount: expenses.kpis.orderItemCount,
      paidOrderCount: expenses.kpis.paidOrderCount,
      unpaidOrderCount: expenses.kpis.unpaidOrderCount,
    }).toEqual({
      orderSpend: orders.totalSpent,
      orderItemSpend: 12_000,
      feeSpend: 500,
      orderItemCount: 2,
      paidOrderCount: 1,
      unpaidOrderCount: 1,
    });
  });

  test("Scoped Shop Spend for Orders names only the Paid Order's Shop and adds up to Order Spend", async () => {
    const expenses = await get<ExpensesOrders>(mixed, "/expenses/orders");
    const shops = await get<ExpenseShops>(mixed, "/expenses/shops?scope=orders");
    const spendByShop = Object.fromEntries(shops.items.map((row) => [row.shop, row.spend]));

    expect(spendByShop).toEqual({ HLJ: 12_500 });
    expect(shops.items.reduce((sum, row) => sum + row.spend, 0)).toBe(expenses.summary.spend);
  });

  test("the Dashboard month splits its Orders' amounts the same way", async () => {
    const monthly = await get<Monthly>(mixed, "/dashboard/monthly?month=3&year=2024");

    expect({
      paidAmount: monthly.paidAmount,
      unpaidAmount: monthly.unpaidAmount,
      unpaidOrderCount: monthly.unpaidOrderCount,
    }).toEqual({ paidAmount: 12_500, unpaidAmount: 3500, unpaidOrderCount: 1 });
  });

  test("an Expenses date range does not hide the Unpaid Order, and a Shop filter for the other Shop leaves no Unpaid Costs", async () => {
    const dated = await get<ExpensesOrders>(
      mixed,
      "/expenses/orders?dateStart=2025-01-01&dateEnd=2025-12-31",
    );
    const otherShop = await get<ExpensesOrders>(mixed, "/expenses/orders?shop=HLJ");

    expect({
      dated: [dated.kpis.unpaidOrderCount, dated.kpis.unpaidCosts],
      otherShop: [otherShop.kpis.unpaidOrderCount, otherShop.kpis.unpaidCosts],
    }).toEqual({ dated: [1, 3500], otherShop: [0, 0] });
  });

  test("the Orders page's money filters and its Paid and Unpaid filters keep the same Orders", async () => {
    const owing = await get<OrdersList>(mixed, "/orders?limit=10&unpaidCostsMin=1");
    const unpaid = await get<OrdersList>(mixed, "/orders?limit=10&paid=false");
    const spent = await get<OrdersList>(mixed, "/orders?limit=10&orderSpendMin=1");
    const paid = await get<OrdersList>(mixed, "/orders?limit=10&paid=true");
    const holdingPaidItems = await get<OrdersList>(mixed, "/orders?limit=10&paidItemsMin=1");

    expect({
      owing: [titles(owing), owing.unpaidCosts],
      unpaid: [titles(unpaid), unpaid.unpaidCosts],
      spent: [titles(spent), spent.totalSpent],
      paid: [titles(paid), paid.totalSpent],
      holdingPaidItems: titles(holdingPaidItems),
    }).toEqual({
      owing: [["AmiAmi"], 3500],
      unpaid: [["AmiAmi"], 3500],
      spent: [["HLJ"], 12_500],
      paid: [["HLJ"], 12_500],
      holdingPaidItems: ["HLJ"],
    });
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

describe("an Owned item in an Unpaid Order beside an Owned item outside any Order", () => {
  test("the item in the Unpaid Order counts as Unpaid Costs, and only the item outside any Order is Collection Spend", async () => {
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
      dashboardUnpaidCosts: 30_500,
      dashboardTotalSpent: 8000,
      expenses: 8000,
      expensesOrderLinked: 0,
      expensesStandalone: 8000,
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

  test("Order Spend and Unpaid Costs add up to the Order Total", async () => {
    const orders = await get<OrdersList>(ownedUnpaid, "/orders?limit=10");
    const collectionExpenses = await get<ExpensesCollection>(ownedUnpaid, "/expenses/collection");
    const orderExpenses = await get<ExpensesOrders>(ownedUnpaid, "/expenses/orders");
    const orderTotal = orders.items.reduce((total, row) => total + row.total, 0);

    expect(orderTotal).toBe(30_500);
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

describe("an Owned item removed from an Unpaid Order", () => {
  test("leaves Unpaid Costs and becomes Collection Spend, since it is now outside any Order", async () => {
    const before = await get<Dashboard>(detached, "/dashboard");
    const removed = await app.handle(
      new Request("http://localhost/api/orders/pay-later/items/nendo-in-pay-later", {
        method: "DELETE",
        headers: { "x-test-user": detached },
      }),
    );
    expect(removed.status).toBe(200);
    const after = await get<Dashboard>(detached, "/dashboard");
    const collectionPage = await get<CollectionList>(detached, "/collection?limit=10");

    expect({
      before: [before.unpaidCosts, before.collectionStats.totalSpent],
      after: [after.unpaidCosts, after.collectionStats.totalSpent],
      collectionPage: collectionPage.totalValue,
    }).toEqual({ before: [5000, 0], after: [0, 5000], collectionPage: 5000 });
  });
});

describe("a Collection Item edit from a tab opened before Paid left the items", () => {
  test("still sends paid, so the strict contract answers 422 and the item keeps its price", async () => {
    const edited = await app.handle(
      new Request("http://localhost/api/collection/owned-outside-orders", {
        method: "PUT",
        headers: { "x-test-user": ownedUnpaid, "content-type": "application/json" },
        body: JSON.stringify({
          status: "Owned",
          paid: false,
          count: 1,
          score: "0",
          price: 1,
          shop: "AmiAmi",
          orderDate: null,
          paymentDate: null,
          shippingDate: null,
          collectionDate: "2024-06-01",
          shippingMethod: "n/a",
          tags: [],
          notes: "",
          releaseId: null,
          condition: "New",
        }),
      }),
    );
    const collectionPage = await get<CollectionList>(ownedUnpaid, "/collection?limit=10");

    expect({ status: edited.status, totalValue: collectionPage.totalValue }).toEqual({
      status: 422,
      totalValue: 8000,
    });
  });
});
