import { afterEach, expect, mock, test } from "bun:test";
import { cleanup, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";

const endedJob = {
  jobId: "job-1",
  phase: "completed",
  statusMessage: "Import complete",
  progress: null,
  recentItems: [],
  error: null,
  startedAt: "2026-10-26T00:00:00.000Z",
  updatedAt: "2026-10-26T00:01:00.000Z",
  terminalState: "success",
  warnings: [
    { mfcItemId: 101, input: "12,50" },
    { mfcItemId: 202, input: "abc" },
  ],
};

async function* stream(...chunks: unknown[]) {
  for (const data of chunks) yield { data };
}

const realClient = await import("@/lib/treaty-client");
await mock.module("@/lib/treaty-client", () => ({
  ...realClient,
  app: {
    api: {
      sync: { "job-status": { get: async () => ({ data: stream(endedJob), error: null }) } },
    },
  },
}));

const { SyncSessionStatusPanel } = await import("./sync-session-status-panel");

afterEach(cleanup);

const session = {
  id: "session-1",
  jobId: "job-1",
  syncType: "csv",
  statusMessage: "Import complete",
  totalItems: 2,
  successCount: 2,
  failCount: 0,
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
