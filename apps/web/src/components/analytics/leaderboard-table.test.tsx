import { afterEach, expect, test } from "bun:test";
import { act, cleanup, render, screen } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { LeaderboardTable } from "./leaderboard-table";

afterEach(cleanup);

async function renderShops(shop: string) {
  const root = createRootRoute({ component: Outlet });
  const home = createRoute({
    getParentRoute: () => root,
    path: "/",
    component: () => (
      <LeaderboardTable
        rankedBy="itemCount"
        rows={[{ shop, itemCount: 123, totalSpent: 1_234_567 }]}
        columns={["shop", "itemCount", "totalSpent"]}
        rowIdKey="shop"
      />
    ),
  });
  const router = createRouter({
    routeTree: root.addChildren([home]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
}

test("a name cut short by its column keeps the full name in its title", async () => {
  await renderShops("MandarakeOnline");
  expect(screen.getByTitle("MandarakeOnline").textContent).toBe("MandarakeOnline");
});
