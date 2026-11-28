import { afterEach, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { CalendarOrderRow } from "./calendar/calendar-order-row";
import { OverviewTab } from "./dashboard/overview-tab";
import type { CalendarOrder } from "@/queries/calendar";
import type { DashboardResponse } from "@/queries/dashboard";

afterEach(cleanup);

async function renderInApp(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { enabled: false } } });
  const router = createRouter({
    routeTree: createRootRoute({ component: () => ui }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

const dashboard = {
  collectionStats: { totalItems: 2, totalSpent: 3000 },
  categoriesOwned: [{ name: "Prepainted", count: 2, totalValue: 3000 }],
  orders: [],
  ordersSummary: {
    totalActiveOrderCount: 1,
    totalShippingAllTime: 300,
    totalTaxesAllTime: 200,
    totalDutiesAllTime: 20,
    totalTariffsAllTime: 5,
    totalMiscFeesAllTime: 1,
  },
  unpaidOrderCount: 1,
  unpaidCosts: 3600,
  monthlyOrders: [{ year: 2026, month: 11, orderCount: 2 }],
} satisfies DashboardResponse;

test("the Dashboard's Total Spent adds paid Collection Items and paid Order fees", async () => {
  await renderInApp(
    <OverviewTab
      data={dashboard}
      dataUpdatedAt={0}
      isLoading={false}
      isError={false}
      error={null}
      currency="USD"
      locale="en-US"
      dateFormat="MM/DD/YYYY"
    />,
  );

  const figure = (title: string) =>
    screen.getByText(title).nextElementSibling?.firstElementChild?.textContent;
  expect({ totalSpent: figure("Total Spent"), activeOrders: figure("Active Orders") }).toEqual({
    totalSpent: "$35.26",
    activeOrders: "1",
  });
});

const calendarOrder = {
  orderId: "order-1",
  title: "Miku order",
  shop: "AmiAmi",
  images: [],
  itemCount: 1,
  status: "Ordered",
  paid: false,
  releaseDate: "2026-11-15",
  total: 3600,
} satisfies CalendarOrder;

test.each([
  [1, "1 item"],
  [2, "2 items"],
])("a Calendar Order holding %i Collection Items reads %p", async (itemCount, label) => {
  await renderInApp(
    <CalendarOrderRow order={{ ...calendarOrder, itemCount }} currency="USD" locale="en-US" />,
  );

  expect(screen.getByText(label)).not.toBeNull();
});
