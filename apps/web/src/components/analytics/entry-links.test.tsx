import { afterEach, expect, test } from "bun:test";
import type { ReactNode } from "react";
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
import type { AnalyticsSection } from "@myakiba/contracts/shared/types";
import { Route as analyticsRoute } from "@/routes/(app)/analytics";
import { SectionTable } from "./section-table";

const realFetch = globalThis.fetch;

afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
});

const ROW = { id: "entry-miku", name: "Hatsune Miku", itemCount: 3, totalSpent: 1200 };

async function renderInApp(ui: ReactNode, queryClient = new QueryClient()) {
  const root = createRootRoute({ component: Outlet });
  const app = createRoute({
    getParentRoute: () => root,
    id: "(app)",
    component: Outlet,
    beforeLoad: () => ({ session: { user: { currency: "JPY", dateFormat: "MM/DD/YYYY" } } }),
  });
  const page = createRoute({ getParentRoute: () => app, path: "/", component: () => ui });
  const entryPage = createRoute({
    getParentRoute: () => app,
    path: "/entries/$entryId",
    component: () => <p>Item Entry page</p>,
  });
  const router = createRouter({
    routeTree: root.addChildren([app.addChildren([page, entryPage])]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await act(async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await router.load();
  });
  return router;
}

const sectionTable = (sectionName: AnalyticsSection, id: string | null) => (
  <SectionTable
    rows={[{ ...ROW, id }]}
    sectionName={sectionName}
    offset={0}
    pageSize={24}
    isLoading={false}
    onSortChange={() => {}}
  />
);

test("an Item Entry row of a section opens its Item Entry page and has no expand button", async () => {
  const router = await renderInApp(sectionTable("characters", ROW.id));
  expect(screen.queryByRole("button", { name: "Expand row" })).toBeNull();

  await userEvent.setup().click(screen.getByText("Hatsune Miku"));

  expect(router.state.location.pathname).toBe("/entries/entry-miku");
});

test("a Shop row still expands in place", async () => {
  globalThis.fetch = Object.assign(async () => Response.json({ items: [], totalCount: 0 }), {
    preconnect: realFetch.preconnect,
  });
  const router = await renderInApp(sectionTable("shops", null));

  await userEvent.setup().click(screen.getByText("Hatsune Miku"));

  expect(screen.queryByRole("button", { name: "Collapse row" }) !== null).toBe(true);
  expect(router.state.location.pathname).toBe("/");
});

test("an Analytics leaderboard row of an Item Entry opens its Item Entry page", async () => {
  const queryClient = new QueryClient();
  const rankedRow = { entryId: ROW.id, name: ROW.name, itemCount: 3, totalSpent: 1200 };
  const ranked = { uniqueOwned: 0, topByCount: [], topBySpend: [] };
  queryClient.setQueryData(["analytics"], {
    analytics: {
      entries: [
        {
          category: "Characters",
          uniqueOwned: 1,
          topByCount: [rankedRow],
          topBySpend: [rankedRow],
        },
      ],
      shops: ranked,
      scales: ranked,
    },
  });
  const Page = analyticsRoute.options.component;
  if (!Page) throw new Error("the Analytics route has no component");
  const router = await renderInApp(<Page />, queryClient);

  const [topByCount] = screen.getAllByText("Hatsune Miku");
  if (!topByCount) throw new Error("the leaderboard shows no Item Entry");
  await userEvent.setup().click(topByCount);

  expect(router.state.location.pathname).toBe("/entries/entry-miku");
});
