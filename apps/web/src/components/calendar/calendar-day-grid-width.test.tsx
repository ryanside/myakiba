import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import type { CalendarResponse } from "@/queries/calendar";
import { Route as calendarRoute } from "@/routes/(app)/calendar";
import { signedInSession } from "../../../test/session";
import { stubFetch } from "../../../test/app-route";

const PHONE_WIDTH = 767;
const TABLET_WIDTH = 768;

const release = {
  itemId: "item",
  itemExternalId: null,
  image: null,
  category: "Prepainted" as const,
  price: null,
  priceCurrency: null,
};

const items: CalendarResponse = {
  view: "items",
  month: 11,
  year: 2026,
  items: [
    {
      ...release,
      releaseId: "release-month",
      title: "Figure Month",
      releaseDate: { start: "2026-11-01", precision: "month" },
    },
    {
      ...release,
      releaseId: "release-day",
      title: "Figure Day",
      releaseDate: { start: "2026-11-18", precision: "day" },
    },
  ],
};

const orders: CalendarResponse = {
  view: "orders",
  month: 11,
  year: 2026,
  orders: [
    {
      orderId: "order-month",
      title: "Order Month",
      shop: "AmiAmi",
      status: "Ordered",
      paid: false,
      releaseDate: { start: "2026-11-01", precision: "month" },
      itemCount: 1,
      images: [],
      total: 0,
    },
    {
      orderId: "order-day",
      title: "Order Day",
      shop: "AmiAmi",
      status: "Ordered",
      paid: false,
      releaseDate: { start: "2026-11-18", precision: "day" },
      itemCount: 1,
      images: [],
      total: 0,
    },
  ],
};

const queryClients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  for (const client of queryClients.splice(0)) client.clear();
  window.happyDOM.setInnerWidth(1024);
});

async function openCalendar(search: string): Promise<void> {
  stubFetch((request) =>
    Response.json(new URL(request.url).searchParams.get("view") === "orders" ? orders : items),
  );
  const root = createRootRoute({ component: Outlet });
  const app = createRoute({
    getParentRoute: () => root,
    id: "(app)",
    component: Outlet,
    beforeLoad: () => ({ session: signedInSession() }),
  });
  Object.assign(calendarRoute.options, {
    id: "/calendar",
    path: "/calendar",
    getParentRoute: () => app,
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClients.push(queryClient);
  const router = createRouter({
    routeTree: root.addChildren([app.addChildren([calendarRoute])]),
    history: createMemoryHistory({ initialEntries: [`/calendar?month=11&year=2026${search}`] }),
    context: { queryClient },
  });
  await router.load();
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

function showsDayGrid(): boolean {
  return screen.queryByRole("button", { name: /2026-11-18/ }) !== null;
}

describe.each([
  ["items", "", "Figure Month", "Figure Day"],
  ["orders", "&view=orders", "Order Month", "Order Day"],
])("the Calendar's %s view", (_view, viewSearch, monthOnly, dayDated) => {
  test("at phone width lists the month's releases with no day grid above them", async () => {
    window.happyDOM.setInnerWidth(PHONE_WIDTH);
    await openCalendar(viewSearch);

    await screen.findByText(monthOnly);
    expect(screen.queryByText(dayDated) !== null).toBe(true);
    expect(showsDayGrid()).toBe(false);
  });

  test("from tablet width shows the day grid with the list", async () => {
    window.happyDOM.setInnerWidth(TABLET_WIDTH);
    await openCalendar(viewSearch);

    await screen.findByText(monthOnly);
    expect(screen.queryByText(dayDated) !== null).toBe(true);
    expect(showsDayGrid()).toBe(true);
  });

  test("a day picked on the grid narrows the list only while the grid shows", async () => {
    window.happyDOM.setInnerWidth(TABLET_WIDTH);
    await openCalendar(`${viewSearch}&days=18`);

    await screen.findByText(dayDated);
    expect(showsDayGrid()).toBe(true);
    expect(screen.queryByText(monthOnly) === null).toBe(true);

    act(() => {
      window.happyDOM.setInnerWidth(PHONE_WIDTH);
    });
    expect(showsDayGrid()).toBe(false);
    expect(screen.queryByText(monthOnly) !== null).toBe(true);
    expect(screen.queryByText(dayDated) !== null).toBe(true);

    act(() => {
      window.happyDOM.setInnerWidth(TABLET_WIDTH);
    });
    expect(showsDayGrid()).toBe(true);
    expect(screen.queryByText(dayDated) !== null).toBe(true);
    expect(screen.queryByText(monthOnly) === null).toBe(true);
  });
});
