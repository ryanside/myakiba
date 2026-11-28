import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
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
import { ordersPageSearchSchema } from "@myakiba/contracts/orders/schema";
import { OrdersQuickFilters } from "./orders-quick-filters";
import { OrdersToolbar } from "./orders-toolbar";

afterEach(cleanup);

function OrdersPageControls() {
  return (
    <>
      <OrdersQuickFilters />
      <OrdersToolbar />
    </>
  );
}

test("Reset Filters lifts Releasing this month with every other filter", async () => {
  const root = createRootRoute({ component: Outlet });
  const app = createRoute({
    getParentRoute: () => root,
    id: "(app)",
    component: Outlet,
    beforeLoad: () => ({
      session: { user: { currency: "USD", dateFormat: "MM/DD/YYYY" } },
    }),
  });
  const orders = createRoute({
    getParentRoute: () => app,
    path: "/orders",
    component: OrdersPageControls,
    validateSearch: ordersPageSearchSchema,
  });
  const router = createRouter({
    routeTree: root.addChildren([app.addChildren([orders])]),
    history: createMemoryHistory({
      initialEntries: ['/orders?releaseMonth=this&status=["Owned"]&paid=true'],
    }),
  });
  await router.load();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  const releasing = await screen.findByRole("button", { name: "Releasing this month" });
  expect(releasing.getAttribute("aria-pressed")).toBe("true");

  await userEvent
    .setup({ delay: null })
    .click(screen.getByRole("button", { name: "Reset Filters" }));

  expect(router.state.location.search).toStrictEqual({});
  expect(
    screen.getByRole("button", { name: "Releasing this month" }).getAttribute("aria-pressed"),
  ).toBe("false");
});
