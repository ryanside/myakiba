import { afterEach, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  RouterProvider,
} from "@tanstack/react-router";
import * as z from "zod";
import { SettingsSearchField, SettingsSearchResults } from "./settings-search";

afterEach(cleanup);

function openSearch(query: string) {
  const root = createRootRoute();
  const settings = createRoute({
    getParentRoute: () => root,
    path: "/settings",
    validateSearch: z.object({ section: z.string().optional(), q: z.string().optional() }),
    component: () => {
      const { q = "" } = settings.useSearch();
      return (
        <>
          <SettingsSearchField query={q} />
          <nav>
            <Link to="/settings" search={{ section: "preferences" }}>
              Preferences
            </Link>
          </nav>
          <SettingsSearchResults query={q} />
        </>
      );
    },
  });
  const router = createRouter({
    routeTree: root.addChildren([settings]),
    history: createMemoryHistory({
      initialEntries: [query ? `/settings?q=${query}` : "/settings"],
    }),
  });
  render(<RouterProvider router={router} />);
  return router;
}

const SEARCH_DEBOUNCE_MS = 120;

/** Types into the field and hands back before the search reaches the URL. */
async function typeQuickly(text: string) {
  const field = await screen.findByRole<HTMLInputElement>("searchbox", { name: "Search settings" });
  field.focus();
  fireEvent.change(field, { target: { value: text } });
  return field;
}

const waitPastDebounce = () => act(() => Bun.sleep(SEARCH_DEBOUNCE_MS * 2));

test("the arrow keys move from the search field through the results and back", async () => {
  openSearch("table");
  const field = await screen.findByRole("searchbox", { name: "Search settings" });
  const first = await screen.findByRole("link", { name: /^Collection table/ });
  const second = screen.getByRole("link", { name: /^Orders table/ });

  field.focus();
  fireEvent.keyDown(field, { key: "ArrowDown" });
  expect(document.activeElement).toBe(first);

  fireEvent.keyDown(first, { key: "ArrowDown" });
  expect(document.activeElement).toBe(second);

  fireEvent.keyDown(second, { key: "ArrowUp" });
  fireEvent.keyDown(first, { key: "ArrowUp" });
  expect(document.activeElement).toBe(field);
});

test("Escape clears the search for good, even before the typing settles", async () => {
  const router = openSearch("");
  const field = await typeQuickly("theme");

  fireEvent.keyDown(field, { key: "Escape" });
  await waitPastDebounce();

  expect(router.state.location.search).toEqual({});
  expect(field.value).toBe("");
});

test("Enter opens the best result and leaves the search, even before the typing settles", async () => {
  const router = openSearch("");
  const field = await typeQuickly("theme");

  fireEvent.keyDown(field, { key: "Enter" });
  await waitPastDebounce();

  expect(router.state.location.search).toEqual({ section: "appearance" });
  expect(router.state.location.hash).toBe("setting-theme");
});

test("leaving the search from outside the field, such as Back or a nav link, clears it", async () => {
  const router = openSearch("theme");
  const field = await screen.findByRole<HTMLInputElement>("searchbox", { name: "Search settings" });
  expect(field.value).toBe("theme");

  await act(() => router.navigate({ to: "/settings", search: { section: "preferences" } }));
  await waitPastDebounce();

  expect(router.state.location.search).toEqual({ section: "preferences" });
  expect(field.value).toBe("");
});

test("a result for a setting with no row of its own opens its section, with no dead link", async () => {
  openSearch("export");
  const result = await screen.findByRole("link", { name: /^Export/ });

  expect(result.getAttribute("href")).toBe("/settings?section=data-transfer");
});

test("opening a section before the first search settles cancels the pending text", async () => {
  const router = openSearch("");
  const field = await typeQuickly("theme");
  fireEvent.click(screen.getByRole("link", { name: "Preferences" }));
  await waitPastDebounce();

  expect(router.state.location.search).toEqual({ section: "preferences" });
  expect(field.value).toBe("");
});

test("a setting link cancels pending text even when it opens the current section", async () => {
  const router = openSearch("");
  await screen.findByRole("searchbox", { name: "Search settings" });
  await act(() => router.navigate({ to: "/settings", search: { section: "appearance" } }));
  const field = await typeQuickly("theme");
  await act(() =>
    router.navigate({
      to: "/settings",
      search: { section: "appearance" },
      hash: "setting-theme",
    }),
  );
  await waitPastDebounce();

  expect(router.state.location.search).toEqual({ section: "appearance" });
  expect(router.state.location.hash).toBe("setting-theme");
  expect(field.value).toBe("");
});

test("typing keeps the draft when its own debounced search reaches the URL", async () => {
  const router = openSearch("");
  const field = await typeQuickly("theme");
  await waitPastDebounce();
  expect(router.state.location.search).toEqual({ q: "theme" });
  expect(field.value).toBe("theme");

  fireEvent.change(field, { target: { value: "theme dark" } });
  await waitPastDebounce();
  expect(router.state.location.search).toEqual({ q: "theme dark" });
  expect(field.value).toBe("theme dark");
});

test("invalidating the current URL preserves a pending first search", async () => {
  const router = openSearch("");
  const field = await typeQuickly("theme");

  await act(() => router.invalidate());
  expect(field.value).toBe("theme");
  await waitPastDebounce();

  expect(router.state.location.search).toEqual({ q: "theme" });
  expect(field.value).toBe("theme");
});

test("invalidating the current URL preserves edits to an existing search", async () => {
  const router = openSearch("theme");
  const field = await typeQuickly("theme dark");

  await act(() => router.invalidate());
  expect(field.value).toBe("theme dark");
  await waitPastDebounce();

  expect(router.state.location.search).toEqual({ q: "theme dark" });
  expect(field.value).toBe("theme dark");
});
