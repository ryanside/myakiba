import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import type { AnyRoute } from "@tanstack/react-router";
import { Route as analyticsSectionRoute } from "@/routes/(app)/analytics_.$sectionName";
import { Route as calendarRoute } from "@/routes/(app)/calendar";
import { Route as expensesRoute } from "@/routes/(app)/expenses";
import { Route as itemsRoute } from "@/routes/(app)/items";
import { Route as ordersRoute } from "@/routes/(app)/orders";
import { Route as wishlistRoute } from "@/routes/(app)/wishlist";

const realFetch = globalThis.fetch;
beforeAll(() => {
  globalThis.fetch = Object.assign(() => new Promise<Response>(() => {}), {
    preconnect: realFetch.preconnect,
  });
});
afterAll(() => {
  globalThis.fetch = realFetch;
});

const queryClients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  for (const client of queryClients.splice(0)) client.clear();
});

const session = { user: { currency: "USD", dateFormat: "MM/DD/YYYY", username: "test" } };

const root = createRootRoute({ component: Outlet });
const app = createRoute({
  getParentRoute: () => root,
  id: "(app)",
  component: Outlet,
  beforeLoad: () => ({ session }),
});
const start = createRoute({
  getParentRoute: () => app,
  path: "/start",
  component: () => <p>Start page</p>,
});
// The generated route tree places each file route the same way, under an (app) route without its session check.
function placeInApp<TRoute extends AnyRoute>(route: TRoute, id: string, path: string): TRoute {
  Object.assign(route.options, { id, path, getParentRoute: () => app });
  return route;
}
const pages = [
  placeInApp(analyticsSectionRoute, "/analytics_/$sectionName", "/analytics/$sectionName"),
  placeInApp(calendarRoute, "/calendar", "/calendar"),
  placeInApp(expensesRoute, "/expenses", "/expenses"),
  placeInApp(itemsRoute, "/items", "/items"),
  placeInApp(ordersRoute, "/orders", "/orders"),
  placeInApp(wishlistRoute, "/wishlist", "/wishlist"),
];
const routeTree = root.addChildren([app.addChildren([start, ...pages])]);

async function openFromStart(href: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ["/start"] }),
  });
  await router.load();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClients.push(queryClient);
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  await screen.findByText("Start page");
  await act(() => router.navigate({ href }));

  return { router, user: userEvent.setup({ delay: null }) };
}

type Opened = Awaited<ReturnType<typeof openFromStart>>;

async function pressBrowserBack({ router }: Opened) {
  await act(async () => {
    router.history.back();
  });
}

async function expectBackOnStart({ router }: Opened) {
  await waitFor(() => {
    expect(router.state.location.pathname).toBe("/start");
  });
}

describe("changing a page's own search state leaves Back pointing at the previous page", () => {
  test("analytics section search, then its Back link", async () => {
    const opened = await openFromStart("/analytics/artists");
    await opened.user.type(await screen.findByPlaceholderText("Search artists..."), "mi");
    await waitFor(() => {
      expect(opened.router.state.location.search).toMatchObject({ search: "mi" });
    });

    await opened.user.click(screen.getByRole("button", { name: "Back" }));

    await expectBackOnStart(opened);
  });

  test("orders search and Reset Filters, then browser Back", async () => {
    const opened = await openFromStart("/orders");
    await opened.user.type(await screen.findByPlaceholderText("Search"), "mi");
    await waitFor(() => {
      expect(opened.router.state.location.search).toMatchObject({ search: "mi" });
    });
    await opened.user.click(screen.getByRole("button", { name: "Reset Filters" }));
    await waitFor(() => {
      expect(opened.router.state.location.search).not.toHaveProperty("search");
    });

    await pressBrowserBack(opened);

    await expectBackOnStart(opened);
  });

  test("Item Database search, then browser Back", async () => {
    const opened = await openFromStart("/items");
    await opened.user.type(
      await screen.findByPlaceholderText("Search by title, MFC ID, or entry"),
      "mi",
    );
    await waitFor(() => {
      expect(opened.router.state.location.search).toMatchObject({ query: "mi" });
    });

    await pressBrowserBack(opened);

    await expectBackOnStart(opened);
  });

  test("Wishlist release filter, then browser Back", async () => {
    const opened = await openFromStart("/wishlist");
    await opened.user.click(await screen.findByRole("button", { name: "Upcoming" }));
    await waitFor(() => {
      expect(opened.router.state.location.search).toMatchObject({ releaseStatus: "upcoming" });
    });

    await pressBrowserBack(opened);

    await expectBackOnStart(opened);
  });

  test("Calendar month change, then browser Back", async () => {
    const opened = await openFromStart("/calendar?month=5&year=2026");
    await opened.user.click(await screen.findByRole("button", { name: "Next month" }));
    await waitFor(() => {
      expect(opened.router.state.location.search).toMatchObject({ month: 6 });
    });

    await pressBrowserBack(opened);

    await expectBackOnStart(opened);
  });

  test("Expenses date preset, then browser Back", async () => {
    const opened = await openFromStart("/expenses");
    await opened.user.click(await screen.findByRole("button", { name: "3M" }));
    await waitFor(() => {
      expect(opened.router.state.location.search).toHaveProperty("dateStart");
    });

    await pressBrowserBack(opened);

    await expectBackOnStart(opened);
  });
});

test("Calendar view tab still adds a history entry, so Back returns to the previous view", async () => {
  const opened = await openFromStart("/calendar?month=5&year=2026");
  await opened.user.click(await screen.findByRole("tab", { name: "Orders" }));
  await waitFor(() => {
    expect(opened.router.state.location.search).toMatchObject({ view: "orders" });
  });

  await pressBrowserBack(opened);

  await waitFor(() => {
    expect(opened.router.state.location).toMatchObject({
      pathname: "/calendar",
      search: { month: 5, year: 2026 },
    });
  });
  expect(opened.router.state.location.search).not.toHaveProperty("view");
});
