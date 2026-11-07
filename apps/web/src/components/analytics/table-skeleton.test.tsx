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
const barWidth = (cell: Element) => {
  const width = cell
    .querySelector('[data-slot="skeleton"]')
    ?.getAttribute("class")
    ?.split(/\s+/)
    .map((token) => /^w-(\d+(?:\.\d+)?)$/.exec(token)?.[1])
    .find((match) => match !== undefined);
  return width === undefined ? undefined : Number(width);
};
const barWidthsByColumn = () =>
  bodyRows().map((row) => Array.from(row.querySelectorAll("td"), barWidth));
const expectTextSizedBars = (
  rows: readonly (readonly (number | undefined)[])[],
  [rankAt, nameAt, countAt, spentAt]: readonly [number, number, number, number],
) => {
  for (const row of rows) {
    const [rank, name, count, spent] = [row[rankAt], row[nameAt], row[countAt], row[spentAt]];
    expect([rank, name, count, spent]).not.toContain(undefined);
    expect(Number(rank)).toBeLessThanOrEqual(Number(count));
    expect(Number(count)).toBeLessThan(Number(spent));
    expect(Number(spent)).toBeLessThan(Number(name));
  }
  expect(new Set(rows.map((row) => row[nameAt])).size).toBeGreaterThan(1);
};

const columnShares = () =>
  screen
    .getAllByRole("columnheader")
    .map((header) => Number.parseFloat(header.style.getPropertyValue("--column-share")));
const expectShares = (shares: readonly number[], sizes: readonly number[]) => {
  const total = sizes.reduce((sum, size) => sum + size, 0);
  expect(shares).toHaveLength(sizes.length);
  sizes.forEach((size, index) => expect(shares[index]).toBeCloseTo((size / total) * 100, 2));
};

// The browser shared out an auto-layout table's spare width by content, so the columns moved
// when the placeholder bars gave way to names and figures.
test("the section table holds each column to the same share of its width while loading and once loaded", async () => {
  const sizes = [40, 40, 150, 80, 100];
  await renderInApp(sectionTable([], true));
  expect(screen.getByRole("table").classList.contains("table-fixed")).toBe(true);
  expectShares(columnShares(), sizes);
  cleanup();

  await renderInApp(
    sectionTable(
      [
        {
          id: "entry-1",
          name: "A very long artist name that wraps",
          itemCount: 1234,
          totalSpent: 9_876_543,
        },
      ],
      false,
    ),
  );
  expect(screen.getByRole("table").classList.contains("table-fixed")).toBe(true);
  expectShares(columnShares(), sizes);
});

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

test("a section placeholder row shows a visible bar where the expand chevron sits", async () => {
  await renderInApp(sectionTable([], true));
  const expandCell = bodyRows()[0]?.querySelector("td");

  expect(expandCell?.querySelector('[data-slot="skeleton"]')).not.toBeNull();
  expect(expandCell?.querySelector(".invisible")).toBeNull();
});

test("section placeholder bars are about as wide as the text they stand in for", async () => {
  await renderInApp(sectionTable([], true));

  expectTextSizedBars(barWidthsByColumn(), [1, 2, 3, 4]);
});

test("leaderboard placeholder bars are about as wide as the text they stand in for", async () => {
  await renderInApp(
    <LeaderboardTable
      rankedBy="totalSpent"
      rows={noEntries}
      columns={["name", "itemCount", "totalSpent"]}
      rowIdKey="name"
      isLoading
    />,
  );

  expectTextSizedBars(barWidthsByColumn(), [0, 1, 2, 3]);
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
