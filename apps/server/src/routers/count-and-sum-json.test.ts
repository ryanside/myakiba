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
const { default: calendarRouter } = await import("./calendar/index");
const { default: analyticsRouter } = await import("./analytics/index");
const app = new Elysia({ prefix: "/api" })
  .use(dashboardRouter)
  .use(ordersRouter)
  .use(calendarRouter)
  .use(analyticsRouter);

const userId = "user-counts";
const today = new Date();
const year = today.getUTCFullYear();
const month = today.getUTCMonth() + 1;
const midMonth = `${year}-${String(month).padStart(2, "0")}-15`;

beforeAll(async () => {
  await db.insert(authSchema.user).values({
    id: userId,
    name: "Ryan",
    email: "r@example.com",
    username: "ryan",
  });
  await db.insert(item).values([
    {
      id: "miku",
      ownerId: userId,
      externalId: 101,
      title: "Miku",
      category: "Prepainted",
    },
    {
      id: "rin",
      ownerId: userId,
      externalId: 102,
      title: "Rin",
      category: "Prepainted",
      scale: "1/7",
    },
    {
      id: "len",
      ownerId: userId,
      externalId: 103,
      title: "Len",
      category: "Prepainted",
      scale: "1/8",
    },
  ]);
  await db.insert(entry).values({
    id: "vocaloid",
    ownerId: userId,
    externalId: 9,
    category: "Characters",
    name: "Vocaloid",
  });
  await db.insert(entry_to_item).values([
    { ownerId: userId, entryId: "vocaloid", itemId: "rin" },
    { ownerId: userId, entryId: "vocaloid", itemId: "len" },
  ]);
  await db.insert(order).values([
    {
      id: "ordered",
      userId,
      title: "AmiAmi",
      shop: "AmiAmi",
      status: "Ordered",
      paid: false,
      orderDate: midMonth,
      releaseDate: midMonth,
      shippingFee: 500,
      taxes: 100,
    },
    {
      id: "owned",
      userId,
      title: "HLJ",
      shop: "HLJ",
      status: "Owned",
      paid: true,
      orderDate: midMonth,
      paymentDate: midMonth,
      releaseDate: midMonth,
      collectionDate: midMonth,
      shippingFee: 300,
      taxes: 200,
      duties: 20,
      tariffs: 5,
      miscFees: 1,
    },
  ]);
  await db.insert(collection).values([
    {
      id: "ordered-miku",
      userId,
      itemId: "miku",
      orderId: "ordered",
      status: "Ordered",
      price: 3000,
      shop: "AmiAmi",
    },
    {
      id: "owned-rin",
      userId,
      itemId: "rin",
      orderId: "owned",
      status: "Owned",
      price: 2000,
      shop: "HLJ",
    },
    {
      id: "owned-len",
      userId,
      itemId: "len",
      orderId: "owned",
      status: "Owned",
      price: 1000,
      shop: "HLJ",
    },
  ]);
});

const get = async <T>(path: string): Promise<T> => {
  const response = await app.handle(
    new Request(`http://localhost/api${path}`, {
      headers: { "x-test-user": userId },
    }),
  );
  expect(response.status).toBe(200);
  return (await response.json()) as T;
};

type ItemCount = { readonly orderId: string; readonly itemCount: unknown };
type Ranked = { readonly itemCount: unknown; readonly totalSpent: unknown };

describe("every count and sum the contracts call a number is a JSON number", () => {
  test("the Dashboard sends its Total Spent parts, Active Orders and categories as numbers", async () => {
    const overview = await get<{
      readonly collectionStats: { readonly totalSpent: unknown };
      readonly categoriesOwned: readonly { readonly totalValue: unknown }[];
      readonly ordersSummary: unknown;
      readonly monthlyOrders: readonly { readonly month: unknown }[];
    }>("/dashboard");

    expect({
      totalSpent: overview.collectionStats.totalSpent,
      categoryTotals: overview.categoriesOwned.map((row) => row.totalValue),
      ordersSummary: overview.ordersSummary,
      months: overview.monthlyOrders.map((row) => row.month),
    }).toEqual({
      totalSpent: 3000,
      categoryTotals: [3000],
      ordersSummary: {
        totalActiveOrderCount: 1,
        totalShippingAllTime: 300,
        totalTaxesAllTime: 200,
        totalDutiesAllTime: 20,
        totalTariffsAllTime: 5,
        totalMiscFeesAllTime: 1,
      },
      months: [month],
    });
  });

  test("the Dashboard month sends its counts, costs and shop totals as numbers", async () => {
    const monthly = await get<{
      readonly itemCount: unknown;
      readonly orderCount: unknown;
      readonly unpaidOrderCount: unknown;
      readonly paidAmount: unknown;
      readonly unpaidAmount: unknown;
      readonly costBreakdown: unknown;
      readonly shopBreakdown: unknown;
    }>(`/dashboard/monthly?month=${month}&year=${year}`);

    expect({
      itemCount: monthly.itemCount,
      orderCount: monthly.orderCount,
      unpaidOrderCount: monthly.unpaidOrderCount,
      paidAmount: monthly.paidAmount,
      unpaidAmount: monthly.unpaidAmount,
      costBreakdown: monthly.costBreakdown,
      shopBreakdown: monthly.shopBreakdown,
    }).toEqual({
      itemCount: 3,
      orderCount: 2,
      unpaidOrderCount: 1,
      paidAmount: 3526,
      unpaidAmount: 3600,
      costBreakdown: {
        items: 6000,
        shipping: 800,
        taxes: 300,
        duties: 20,
        tariffs: 5,
        miscFees: 1,
      },
      shopBreakdown: [
        { shopName: "AmiAmi", orderCount: 1, totalAmount: 3600 },
        { shopName: "HLJ", orderCount: 1, totalAmount: 3526 },
      ],
    });
  });

  test("the Orders page sends each Order's item count as a number", async () => {
    const page = await get<{ readonly items: readonly ItemCount[] }>(
      "/orders?sort=title&order=asc",
    );

    expect(page.items.map(({ orderId, itemCount }) => ({ orderId, itemCount }))).toEqual([
      { orderId: "ordered", itemCount: 1 },
      { orderId: "owned", itemCount: 2 },
    ]);
  });

  test("the Order page sends its item count as a number", async () => {
    const detail = await get<ItemCount>("/orders/owned");

    expect(detail.itemCount).toBe(2);
  });

  test("the Calendar sends each Order's item count as a number", async () => {
    const calendar = await get<{ readonly orders: readonly ItemCount[] }>(
      `/calendar?view=orders&month=${month}&year=${year}`,
    );

    expect(
      calendar.orders
        .map(({ orderId, itemCount }) => ({ orderId, itemCount }))
        .toSorted((left, right) => left.orderId.localeCompare(right.orderId)),
    ).toEqual([
      { orderId: "ordered", itemCount: 1 },
      { orderId: "owned", itemCount: 2 },
    ]);
  });

  test("Analytics sends each leaderboard's spend as a number", async () => {
    const overview = await get<{
      readonly analytics: {
        readonly entries: readonly {
          readonly category: string;
          readonly topByCount: readonly Ranked[];
          readonly topBySpend: readonly Ranked[];
        }[];
        readonly shops: {
          readonly topByCount: readonly Ranked[];
          readonly topBySpend: readonly Ranked[];
        };
        readonly scales: {
          readonly topByCount: readonly Ranked[];
          readonly topBySpend: readonly Ranked[];
        };
      };
    }>("/analytics");
    const characters = overview.analytics.entries.find((row) => row.category === "Characters");
    const ranked = (rows: readonly Ranked[] | undefined) =>
      rows?.map(({ itemCount, totalSpent }) => ({ itemCount, totalSpent }));

    expect({
      charactersByCount: ranked(characters?.topByCount),
      charactersBySpend: ranked(characters?.topBySpend),
      shopsByCount: ranked(overview.analytics.shops.topByCount),
      shopsBySpend: ranked(overview.analytics.shops.topBySpend),
      scalesByCount: ranked(overview.analytics.scales.topByCount),
      scalesBySpend: ranked(overview.analytics.scales.topBySpend),
    }).toEqual({
      charactersByCount: [{ itemCount: 2, totalSpent: 3000 }],
      charactersBySpend: [{ itemCount: 2, totalSpent: 3000 }],
      shopsByCount: [{ itemCount: 2, totalSpent: 3000 }],
      shopsBySpend: [{ itemCount: 2, totalSpent: 3000 }],
      scalesByCount: [
        { itemCount: 1, totalSpent: 2000 },
        { itemCount: 1, totalSpent: 1000 },
      ],
      scalesBySpend: [
        { itemCount: 1, totalSpent: 2000 },
        { itemCount: 1, totalSpent: 1000 },
      ],
    });
  });

  test.each([
    ["characters", { name: "Vocaloid", itemCount: 2, totalSpent: 3000 }],
    ["shops", { name: "HLJ", itemCount: 2, totalSpent: 3000 }],
    ["scales", { name: "1/7", itemCount: 1, totalSpent: 2000 }],
  ] as const)(
    "the Analytics %s page sends its totals and each row's count and spend as numbers",
    async (section, firstRow) => {
      const page = await get<{
        readonly analytics: {
          readonly kpis: unknown;
          readonly rows: readonly (Ranked & { readonly name: string })[];
        };
      }>(`/analytics/${section}?sort=totalSpent&order=desc`);
      const [first] = page.analytics.rows;

      expect({
        kpis: page.analytics.kpis,
        first: first && {
          name: first.name,
          itemCount: first.itemCount,
          totalSpent: first.totalSpent,
        },
      }).toEqual({
        kpis: {
          uniqueCount: section === "scales" ? 2 : 1,
          totalItemCount: 2,
          totalSpent: 3000,
          averageSpent: 1500,
        },
        first: firstRow,
      });
    },
  );
});
