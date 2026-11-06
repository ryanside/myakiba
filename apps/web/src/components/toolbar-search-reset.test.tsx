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
    queryResetButton: () => screen.queryByRole("button", { name: "Reset Filters" }),
  };
}

describe.each(["/orders", "/collection"])("Reset Filters on %s", (path) => {
  test("is hidden while nothing is filtered, sorted or typed", async () => {
    const { queryResetButton } = await renderToolbar(path);
    expect(queryResetButton()).toBeNull();
  });

  test("shows as soon as text is typed before the search commits", async () => {
    const { user, router, input, queryResetButton } = await renderToolbar(path);
    await user.type(input(), "mi");

    expect(router.state.location.search.search).toBeUndefined();
    expect(queryResetButton()).not.toBeNull();
  });

  test("hides when an outside change clears a search typed and committed here", async () => {
    const { user, router, input, queryResetButton } = await renderToolbar(path);
    await user.type(input(), "mi");
    await wait(SETTLE_MS);
    expect(router.state.location.search.search).toBe("mi");
    await user.tab();
    await act(() => router.navigate({ to: path, search: {} }));
    await wait(SETTLE_MS);

    expect({
      search: router.state.location.search.search,
      shown: input().value,
      resetShown: queryResetButton() !== null,
    }).toEqual({ search: undefined, shown: "", resetShown: false });
  });

  test("keeps Reset while an outside clear is deferred by the focused search", async () => {
    const { user, router, input, queryResetButton } = await renderToolbar(path);
    await user.type(input(), "mi");
    await wait(SETTLE_MS);
    expect(router.state.location.search.search).toBe("mi");

    await act(() => router.navigate({ to: path, search: {} }));
    await wait(SETTLE_MS);

    expect(input().value).toBe("mi");
    expect(queryResetButton()).not.toBeNull();
  });

  test("clears a deferred search and the sort when Reset is clicked", async () => {
    const { user, router, input, queryResetButton, resetButton } = await renderToolbar(
      `${path}?order=asc`,
    );
    await user.type(input(), "mi");
    await wait(SETTLE_MS);
    expect(router.state.location.search.search).toBe("mi");

    await act(() => router.navigate({ to: path, search: { order: "asc" } }));
    await wait(SETTLE_MS);
    expect(input().value).toBe("mi");
    await user.click(resetButton());
    await wait(SETTLE_MS);

    expect({
      search: router.state.location.search.search,
      order: router.state.location.search.order,
      shown: input().value,
      resetShown: queryResetButton() !== null,
      searchFocused: document.activeElement === input(),
    }).toEqual({
      search: undefined,
      order: undefined,
      shown: "",
      resetShown: false,
      searchFocused: true,
    });
  });

  test("clears a deferred search and restores focus when Reset is shown only for its text", async () => {
    const { user, router, input, resetButton, queryResetButton } = await renderToolbar(path);
    await user.type(input(), "mi");
    await wait(SETTLE_MS);
    await act(() => router.navigate({ to: path, search: {} }));
    await wait(SETTLE_MS);

    expect(router.state.location.search.search).toBeUndefined();
    expect(input().value).toBe("mi");
    await user.click(resetButton());
    await wait(SETTLE_MS);

    expect({
      search: router.state.location.search.search,
      shown: input().value,
      resetShown: queryResetButton() !== null,
      searchFocused: document.activeElement === input(),
    }).toEqual({ search: undefined, shown: "", resetShown: false, searchFocused: true });
  });

  test("hides Reset when blur applies a deferred outside clear", async () => {
    const { user, router, input, queryResetButton } = await renderToolbar(path);
    await user.type(input(), "mi");
    await wait(SETTLE_MS);
    await act(() => router.navigate({ to: path, search: {} }));
    expect(queryResetButton()).not.toBeNull();

    await user.tab();

    expect(input().value).toBe("");
    expect(queryResetButton()).toBeNull();
  });

  test("hides Reset and restores search focus after resetting text typed after an outside change", async () => {
    const { user, router, input, resetButton, queryResetButton } = await renderToolbar(
      `${path}?search=Ram`,
    );
    await user.click(input());
    await act(() => router.navigate({ to: ".", search: (prev) => ({ ...prev, search: "Rem" }) }));
    await user.type(input(), "x");
    await user.click(resetButton());
    await wait(SETTLE_MS);

    expect(queryResetButton()).toBeNull();
    expect(document.activeElement).toBe(input());
  });

  test("hides Reset and restores search focus after resetting a first search within the debounce", async () => {
    const { user, input, resetButton, queryResetButton } = await renderToolbar(path);
    await user.type(input(), "mi");
    await user.click(resetButton());
    await wait(SETTLE_MS);

    expect(queryResetButton()).toBeNull();
    expect(document.activeElement).toBe(input());
  });

  test("drops text typed after an outside change when Reset comes within the debounce", async () => {
    const { user, router, input, resetButton, queryResetButton } = await renderToolbar(
      `${path}?search=Ram`,
    );
    await user.click(input());
    await act(() => router.navigate({ to: ".", search: (prev) => ({ ...prev, search: "Rem" }) }));
    await user.type(input(), "x");
    await user.click(resetButton());
    await wait(SETTLE_MS);

    expect({
      search: router.state.location.search.search,
      shown: input().value,
      resetShown: queryResetButton() !== null,
      searchFocused: document.activeElement === input(),
    }).toEqual({ search: undefined, shown: "", resetShown: false, searchFocused: true });
  });

  test("drops a first search typed just before Reset, though Reset leaves the search unchanged", async () => {
    const { user, router, input, resetButton, queryResetButton } = await renderToolbar(path);
    await user.type(input(), "mi");
    await user.click(resetButton());
    await wait(SETTLE_MS);

    expect({
      search: router.state.location.search.search,
      shown: input().value,
      resetShown: queryResetButton() !== null,
      searchFocused: document.activeElement === input(),
    }).toEqual({ search: undefined, shown: "", resetShown: false, searchFocused: true });
  });
});
