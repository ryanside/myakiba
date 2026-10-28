import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { SyncSessionStatusPanel } from "./sync-session-status-panel";

const warnings = [
  { mfcItemId: 101, input: "12,50" },
  { mfcItemId: 202, input: "abc" },
];

afterEach(cleanup);

const session = {
  id: "session-1",
  jobId: "job-1",
  syncType: "csv",
  statusMessage: "Import complete",
  totalItems: 2,
  successCount: 2,
  failCount: 0,
  warnings,
} as const;

async function renderPanel() {
  const props = {
    session,
    items: [{ itemExternalId: 101, itemTitle: "Hatsune Miku 1/7" }],
    isActive: false,
    isLoading: false,
  };
  const root = createRootRoute({ component: () => <SyncSessionStatusPanel {...props} /> });
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

test("a finished CSV import lists each price it could not read, with a link to edit it", async () => {
  await renderPanel();

  const title = await screen.findByText("Hatsune Miku 1/7");
  const named = title.closest("li");
  if (!named) throw new Error("the named warning is not a list item");
  expect(within(named).getByText(/MFC #101/)).toBeTruthy();
  expect(within(named).getByText(/12,50/)).toBeTruthy();
  expect(within(named).getByRole("link", { name: "Hatsune Miku 1/7" }).getAttribute("href")).toBe(
    "/item/101",
  );

  const unnamed = screen.getByText(/abc/).closest("li");
  if (!unnamed) throw new Error("the unnamed warning is not a list item");
  expect(
    within(unnamed)
      .getByRole("link", { name: /MFC #202/ })
      .getAttribute("href"),
  ).toBe("/item/202");
});
