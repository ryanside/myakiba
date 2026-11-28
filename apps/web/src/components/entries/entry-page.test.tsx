import { afterEach, expect, test } from "bun:test";
import { act, cleanup, render, renderHook, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { entryItemStateSchema } from "@myakiba/contracts/entries/schema";
import type { EntryItemState } from "@myakiba/contracts/entries/schema";
import { useResourceMutation } from "@/data/client";
import { fillCollectionItemsCommand } from "@/data/resources/collection";
import { entryItemsInput, itemEntries, preloadEntryPage } from "@/data/resources/entries";
import type { EntryItemsData } from "@/queries/entries";
import { Route as entryRoute } from "@/routes/(app)/entries.$entryId";

const ENTRY_ID = "entry-miku";
const realFetch = globalThis.fetch;

afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
  received = false;
});

const picture = (id: string, title: string) => ({ id, externalId: 1, title, image: null });
const ITEMS = {
  owned: { items: [picture("i-1", "Miku A"), picture("i-2", "Miku B")], totalCount: 2 },
  ordered: { items: [picture("i-3", "Miku C")], totalCount: 1 },
  wishlist: { items: [], totalCount: 0 },
} satisfies Record<EntryItemState, EntryItemsData>;
const RECEIVED = {
  ...ITEMS,
  owned: { items: [...ITEMS.owned.items, ...ITEMS.ordered.items], totalCount: 3 },
  ordered: { items: [], totalCount: 0 },
} satisfies Record<EntryItemState, EntryItemsData>;
let received = false;
const MIKU = { entry: { id: ENTRY_ID, name: "Hatsune Miku", category: "Characters" } };

function serve(entry: () => Response) {
  globalThis.fetch = Object.assign(
    async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.pathname === `/api/entries/${ENTRY_ID}`) return entry();
      if (url.pathname === `/api/entries/${ENTRY_ID}/items`) {
        return Response.json(
          (received ? RECEIVED : ITEMS)[entryItemStateSchema.parse(url.searchParams.get("state"))],
        );
      }
      if (url.pathname === "/api/collection/fill") {
        received = true;
        return new Response("Collection items filled successfully");
      }
      if (url.pathname.endsWith("/relationships")) {
        return Response.json({ section: "characters", items: [], totalCount: 0 });
      }
      return new Response("Not found", { status: 404 });
    },
    { preconnect: realFetch.preconnect },
  );
}

async function renderEntryPage() {
  Object.assign(entryRoute, { useParams: () => ({ entryId: ENTRY_ID }) });
  const Page = entryRoute.options.component;
  if (!Page) throw new Error("the Item Entry route has no component");
  const root = createRootRoute({ component: Outlet });
  const app = createRoute({
    getParentRoute: () => root,
    id: "(app)",
    component: Outlet,
    beforeLoad: () => ({ session: { user: { currency: "JPY", dateFormat: "MM/DD/YYYY" } } }),
  });
  const page = createRoute({ getParentRoute: () => app, path: "/", component: Page });
  const router = createRouter({
    routeTree: root.addChildren([app.addChildren([page])]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await router.load();
  });
  return queryClient;
}

test("the page names the Item Entry and shows its Owned, Ordered and Wishlist Items", async () => {
  serve(() => Response.json(MIKU));
  await renderEntryPage();

  const title = await screen.findByRole("heading", { level: 1 });
  expect(title.textContent).toBe("Hatsune Miku");
  const owned = await screen.findByRole("region", { name: "Owned 2" });
  const ordered = await screen.findByRole("region", { name: "On order 1" });
  const wished = await screen.findByRole("region", { name: "Wishlist 0" });

  expect(within(owned).getAllByRole("link")).toHaveLength(2);
  expect(within(owned).queryByRole("link", { name: "Miku A" }) !== null).toBe(true);
  expect(within(owned).queryByRole("link", { name: "Miku B" }) !== null).toBe(true);
  expect(within(ordered).getAllByRole("link")).toHaveLength(1);
  expect(within(wished).queryAllByRole("link")).toHaveLength(0);
  expect(wished.textContent).toBe("Wishlist0");
});

test("an Item Entry the viewer does not hold shows the load error", async () => {
  serve(() => new Response("Item Entry not found", { status: 404 }));
  await renderEntryPage();

  const failure = await screen.findByText("Couldn't load this Item Entry");
  expect(failure.textContent).toBe("Couldn't load this Item Entry");
  expect(screen.queryByText("Item Entry not found") !== null).toBe(true);
  expect(screen.queryAllByRole("region")).toHaveLength(0);
});

test("a hover preloads the heading and each state's first page under the screen's keys", async () => {
  serve(() => Response.json(MIKU));
  const queryClient = new QueryClient();

  await preloadEntryPage(queryClient, "preload", ENTRY_ID);

  expect(queryClient.getQueryData(itemEntries.detail.key(ENTRY_ID))).toEqual(MIKU.entry);
  for (const state of entryItemStateSchema.options) {
    expect(
      queryClient.getQueryData(itemEntries.items.key(entryItemsInput(ENTRY_ID, state))),
    ).toEqual(ITEMS[state]);
  }
});

test("an open page refetches its Items after a Collection write", async () => {
  serve(() => Response.json(MIKU));
  const queryClient = await renderEntryPage();
  await screen.findByRole("region", { name: "On order 1" });
  const fill = renderHook(() => useResourceMutation(fillCollectionItemsCommand), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });

  const filled = await act(() =>
    fill.result.current.run({ ids: ["c-3"], fill: { field: "status", value: "Owned" } }),
  );

  expect(filled.isOk()).toBe(true);
  const owned = await screen.findByRole("region", { name: "Owned 3" });
  const ordered = await screen.findByRole("region", { name: "On order 0" });
  expect(within(owned).getAllByRole("link")).toHaveLength(3);
  expect(within(ordered).queryAllByRole("link")).toHaveLength(0);
});
