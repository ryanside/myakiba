import { expect, mock, test } from "bun:test";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";

// The changelog collects its entries with Vite's import.meta.glob, which bun cannot run.
await mock.module("@/lib/changelog", () => ({
  changelogEntries: [],
  formatChangelogDate: (value: string) => value,
  loadChangelogEntry: () => null,
}));

const { Route } = await import("@/routes/(app)/settings");

/** Opens a Settings URL in a router that reads its search the way the Settings route does. */
async function openSettings(url: string) {
  const root = createRootRoute();
  const settings = createRoute({
    getParentRoute: () => root,
    path: "/settings",
    validateSearch: Route.options.validateSearch,
  });
  const router = createRouter({
    routeTree: root.addChildren([settings]),
    history: createMemoryHistory({ initialEntries: [url] }),
  });
  await router.load();
  const match = router.state.matches.at(-1);
  return { status: match?.status, search: match?.search };
}

test("a search the router reads as a number, a boolean, null or JSON opens Settings with its text", async () => {
  expect(await openSettings("/settings?section=preferences&q=123")).toEqual({
    status: "success",
    search: { section: "preferences", q: "123" },
  });
  expect(await openSettings("/settings?q=true")).toEqual({
    status: "success",
    search: { q: "true" },
  });
  expect(await openSettings("/settings?q=null")).toEqual({ status: "success", search: {} });
  expect(await openSettings("/settings?q=%7B%7D&error=%5B1%5D")).toEqual({
    status: "success",
    search: {},
  });
});
