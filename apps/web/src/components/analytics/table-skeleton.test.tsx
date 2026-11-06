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
import { ANALYTICS_LEADERBOARD_SIZE } from "@myakiba/contracts/analytics/schema";
import type { AnalyticsSectionRow } from "@/queries/analytics";
import { LeaderboardTable } from "./leaderboard-table";
import { SectionTable } from "./section-table";

afterEach(cleanup);

const PAGE_SIZE = 24;
const noEntries: readonly { name: string; itemCount: number; totalSpent: number }[] = [];

async function renderInApp(ui: ReactNode) {
  const root = createRootRoute({ component: Outlet });
  const app = createRoute({
    getParentRoute: () => root,
    id: "(app)",
    component: Outlet,
    beforeLoad: () => ({ session: { user: { currency: "JPY", dateFormat: "MM/DD/YYYY" } } }),
  });
  const page = createRoute({ getParentRoute: () => app, path: "/", component: () => ui });
  const router = createRouter({
    routeTree: root.addChildren([app.addChildren([page])]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
}

const sectionTable = (rows: readonly AnalyticsSectionRow[], isLoading: boolean) => (
  <SectionTable
    rows={rows}
    sectionName="characters"
    offset={0}
    pageSize={PAGE_SIZE}
    isLoading={isLoading}
    onSortChange={() => {}}
  />
);

const bodyRows = () => screen.getAllByRole("row").slice(1);
const sizeClassOf = (element: Element | null | undefined) =>
  element
    ?.getAttribute("class")
    ?.split(/\s+/)
    .find((token) => /^size-\d+(?:\.\d+)?$/.test(token));

test("the section table shows a placeholder row for each row of the page while it loads", async () => {
  await renderInApp(sectionTable([], true));

  expect(bodyRows()).toHaveLength(PAGE_SIZE);
});

test("a section placeholder row holds the box of the expand button that replaces it", async () => {
  await renderInApp(
    sectionTable([{ id: "entry-1", name: "Hatsune Miku", itemCount: 3, totalSpent: 1200 }], false),
  );
  const buttonSize = sizeClassOf(screen.getByRole("button", { name: "Expand row" }));
  cleanup();

  await renderInApp(sectionTable([], true));
  const placeholder = bodyRows()[0]?.querySelector("td")?.firstElementChild;

  expect(buttonSize).toBeDefined();
  expect(sizeClassOf(placeholder)).toBe(buttonSize);
});

test("a leaderboard shows a placeholder row for each row the board can hold while it loads", async () => {
  await renderInApp(
    <LeaderboardTable
      rankedBy="itemCount"
      rows={noEntries}
      columns={["name", "itemCount", "totalSpent"]}
      rowIdKey="name"
      isLoading
    />,
  );

  expect(bodyRows()).toHaveLength(ANALYTICS_LEADERBOARD_SIZE);
});
