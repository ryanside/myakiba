import { afterEach, expect, test } from "bun:test";
import type { ReactNode } from "react";
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

async function renderInRouter(table: ReactNode) {
  const root = createRootRoute({ component: Outlet });
  const home = createRoute({ getParentRoute: () => root, path: "/", component: () => table });
  const router = createRouter({
    routeTree: root.addChildren([home]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
}

const renderShops = (shop: string) =>
  renderInRouter(
    <LeaderboardTable
      rankedBy="itemCount"
      rows={[{ shop, itemCount: 123, totalSpent: 1_234_567 }]}
      columns={["shop", "itemCount", "totalSpent"]}
      rowIdKey="shop"
    />,
  );

test("a name cut short by its column keeps the full name in its title", async () => {
  await renderShops("MandarakeOnline");
  expect(screen.getByTitle("MandarakeOnline").textContent).toBe("MandarakeOnline");
});

test("shows every row it is given and scales the bars to the largest", async () => {
  await renderInRouter(
    <LeaderboardTable
      rankedBy="itemCount"
      rows={[
        { shop: "AmiAmi", itemCount: 8, totalSpent: 0 },
        { shop: "Mandarake", itemCount: 4, totalSpent: 0 },
        { shop: "Suruga-ya", itemCount: 2, totalSpent: 0 },
      ]}
      columns={["shop", "itemCount"]}
      rowIdKey="shop"
    />,
  );
  const bodyRows = screen.getAllByRole("row").slice(1);
  expect(bodyRows.map((row) => row.textContent)).toEqual([
    "1AmiAmi8",
    "2Mandarake4",
    "3Suruga-ya2",
  ]);
  const bars = bodyRows.map(
    (row) => row.querySelector<HTMLElement>("[aria-hidden] > span")?.style.width,
  );
  expect(bars).toEqual(["100%", "50%", "25%"]);
});
