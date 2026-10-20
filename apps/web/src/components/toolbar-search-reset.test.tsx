import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, render, screen } from "@testing-library/react";
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
import { collectionSearchSchema } from "@myakiba/contracts/collection/schema";
import { searchSchema as ordersSearchSchema } from "@myakiba/contracts/orders/schema";
import { CollectionToolbar } from "./collection/collection-toolbar";
import { OrdersToolbar } from "./orders/orders-toolbar";

afterEach(cleanup);

// The app route awaits a session check on every navigation, so a reset reaches the search box only after the 200 ms debounce.
const SESSION_CHECK_MS = 250;
const SETTLE_MS = 1000;
const wait = (ms: number) =>
  act(
    () =>
      new Promise((resolve) => {
        setTimeout(resolve, ms);
      }),
  );

async function renderToolbar(url: string) {
  const root = createRootRoute({ component: Outlet });
  const app = createRoute({
    getParentRoute: () => root,
    id: "(app)",
    component: Outlet,
    beforeLoad: async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, SESSION_CHECK_MS);
      });
      return { session: { user: { currency: "USD", dateFormat: "MM/DD/YYYY" } } };
    },
  });
  const orders = createRoute({
    getParentRoute: () => app,
    path: "/orders",
    component: OrdersToolbar,
    validateSearch: ordersSearchSchema,
  });
  const collection = createRoute({
    getParentRoute: () => app,
    path: "/collection",
    component: CollectionToolbar,
    validateSearch: collectionSearchSchema,
  });
  const router = createRouter({
    routeTree: root.addChildren([app.addChildren([orders, collection])]),
    history: createMemoryHistory({ initialEntries: [url] }),
  });
  await router.load();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  await screen.findByPlaceholderText("Search");

  return {
    user: userEvent.setup({ delay: null }),
    router,
    input: () => screen.getByPlaceholderText<HTMLInputElement>("Search"),
    resetButton: () => screen.getByRole("button", { name: "Reset Filters" }),
  };
}

describe.each(["/orders", "/collection"])("Reset Filters on %s", (path) => {
  test("drops text typed after an outside change when Reset comes within the debounce", async () => {
    const { user, router, input, resetButton } = await renderToolbar(`${path}?search=Ram`);
    await user.click(input());
    await act(() => router.navigate({ to: ".", search: (prev) => ({ ...prev, search: "Rem" }) }));
    await user.type(input(), "x");
    await user.click(resetButton());
    await wait(SETTLE_MS);

    expect({
      search: router.state.location.search.search,
      shown: input().value,
      focused: document.activeElement === resetButton(),
    }).toEqual({ search: undefined, shown: "", focused: true });
  });

  test("drops a first search typed just before Reset, though Reset leaves the search unchanged", async () => {
    const { user, router, input, resetButton } = await renderToolbar(path);
    await user.type(input(), "mi");
    await user.click(resetButton());
    await wait(SETTLE_MS);

    expect({
      search: router.state.location.search.search,
      shown: input().value,
      focused: document.activeElement === resetButton(),
    }).toEqual({ search: undefined, shown: "", focused: true });
  });
});
