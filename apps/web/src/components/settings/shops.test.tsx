import { afterAll, afterEach, beforeEach, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import type {
  RenameShop,
  ShopTerm,
  VocabularyResponse,
} from "@myakiba/contracts/vocabulary/schema";

type Saved = { readonly kind: "collection" | "order"; shop: string };

let saved: Saved[];
let renames: RenameShop[];
let failRenames: boolean;
let failRead: boolean;

const seed = (shop: string, collectionItems: number, orders: number): Saved[] => [
  ...Array.from({ length: collectionItems }, () => ({ kind: "collection" as const, shop })),
  ...Array.from({ length: orders }, () => ({ kind: "order" as const, shop })),
];

function vocabularyOf(rows: readonly Saved[]): VocabularyResponse {
  const terms = new Map<string, ShopTerm>();
  for (const row of rows) {
    const term = terms.get(row.shop) ?? {
      value: row.shop,
      uses: 0,
      ownedUses: 0,
      orderUses: 0,
      lastUsedAt: "2026-01-01T00:00:00.000Z",
    };
    terms.set(row.shop, {
      ...term,
      uses: term.uses + 1,
      ownedUses: term.ownedUses + (row.kind === "collection" ? 1 : 0),
      orderUses: term.orderUses + (row.kind === "order" ? 1 : 0),
    });
  }
  return { shops: [...terms.values()].toSorted((a, b) => b.uses - a.uses), tags: [], scales: [] };
}

const realFetch = globalThis.fetch;
globalThis.fetch = Object.assign(
  async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const { pathname } = new URL(request.url);
    if (pathname === "/api/vocabulary") {
      if (failRead) return new Response(null, { status: 500 });
      return Response.json(vocabularyOf(saved));
    }
    if (pathname === "/api/vocabulary/shops/rename") {
      if (failRenames) return new Response(null, { status: 500 });
      const rename: RenameShop = await request.json();
      renames.push(rename);
      const changed = saved.filter((row) => rename.from.includes(row.shop));
      for (const row of changed) row.shop = rename.to;
      return Response.json({
        collectionItems: changed.filter((row) => row.kind === "collection").length,
        orders: changed.filter((row) => row.kind === "order").length,
      });
    }
    throw new Error(`Unexpected ${pathname}`);
  },
  { preconnect: realFetch.preconnect },
);

const { Shops } = await import("./shops");
const { Toaster } = await import("@/components/ui/toast");

beforeEach(() => {
  saved = [...seed("AmiAmi", 2, 1), ...seed("amiami", 1, 0), ...seed("Ami Ami", 0, 1)];
  saved.push(...seed("Mandarake", 1, 0));
  renames = [];
  failRenames = false;
  failRead = false;
});
afterEach(cleanup);
afterAll(() => {
  globalThis.fetch = realFetch;
});

function openShops(client = new QueryClient()) {
  const root = createRootRoute();
  const settings = createRoute({
    getParentRoute: () => root,
    path: "settings",
    component: Shops,
  });
  const router = createRouter({
    routeTree: root.addChildren([settings]),
    history: createMemoryHistory({ initialEntries: ["/settings"] }),
  });
  render(
    <QueryClientProvider client={client}>
      <Toaster>
        <RouterProvider router={router} />
      </Toaster>
    </QueryClientProvider>,
  );
  return client;
}

const merges = () => screen.findByRole("region", { name: "Suggested merges" });
const yourShops = () => screen.findByRole("region", { name: "Your shops" });

test("suggests merging spellings of one shop into its most used spelling", async () => {
  openShops();

  const group = await merges();
  const keep = within(group).getByRole("radio", { checked: true });
  expect(keep.closest("label")?.textContent).toContain("AmiAmi");
  fireEvent.click(within(group).getByRole("button", { name: "Merge into “AmiAmi”" }));

  const dialog = await screen.findByRole("dialog", { name: "Merge into “AmiAmi”?" });
  expect(dialog.textContent).toContain(
    "1 Collection Item and 1 Order change from “amiami” and “Ami Ami” to “AmiAmi”.",
  );
  fireEvent.click(within(dialog).getByRole("button", { name: "Merge" }));

  expect(await screen.findByText("Saved as “AmiAmi”")).toBeTruthy();
  expect(screen.getByText("1 Collection Item and 1 Order changed.")).toBeTruthy();
  expect(renames).toEqual([{ from: ["amiami", "Ami Ami"], to: "AmiAmi" }]);
  await waitFor(() =>
    expect(screen.queryByRole("region", { name: "Suggested merges" })).toBeNull(),
  );
  const shops = within(await yourShops());
  expect(shops.getByText("3 Collection Items and 2 Orders")).toBeTruthy();
});

test("merges into the spelling the user keeps", async () => {
  openShops();

  const group = await merges();
  fireEvent.click(within(group).getByText("amiami"));
  fireEvent.click(await within(group).findByRole("button", { name: "Merge into “amiami”" }));
  const dialog = await screen.findByRole("dialog", { name: "Merge into “amiami”?" });
  expect(dialog.textContent).toContain(
    "2 Collection Items and 2 Orders change from “AmiAmi” and “Ami Ami” to “amiami”.",
  );
  fireEvent.click(within(dialog).getByRole("button", { name: "Merge" }));

  await waitFor(() => expect(renames).toEqual([{ from: ["AmiAmi", "Ami Ami"], to: "amiami" }]));
});

test.each([
  ["one Collection Item", seed("mandarake", 1, 0), "1 Collection Item changes"],
  ["one Order", seed("mandarake", 0, 1), "1 Order changes"],
  ["two Collection Items", seed("mandarake", 2, 0), "2 Collection Items change"],
])("a merge of %s says what changes", async (_case, merged, changes) => {
  saved = [...seed("Mandarake", 3, 0), ...merged];
  openShops();

  fireEvent.click(within(await merges()).getByRole("button", { name: "Merge into “Mandarake”" }));

  const dialog = await screen.findByRole("dialog", { name: "Merge into “Mandarake”?" });
  expect(dialog.textContent).toContain(`${changes} from “mandarake” to “Mandarake”.`);
});

const renameDialog = (shop: string) => ({ name: `Rename “${shop}”` });

async function openRename(shop: string) {
  fireEvent.click(within(await yourShops()).getByRole("button", { name: `Rename ${shop}` }));
  const dialog = await screen.findByRole("dialog", renameDialog(shop));
  return { dialog, input: within(dialog).getByLabelText("New name") };
}

const closed = (dialog: HTMLElement) => waitFor(() => expect(dialog.isConnected).toBe(false));

test("renaming to a shop already in use says it merges before it saves", async () => {
  openShops();
  const { dialog, input } = await openRename("Mandarake");

  fireEvent.change(input, { target: { value: "AmiAmi" } });

  expect(within(dialog).getByRole("status").textContent).toBe(
    "“AmiAmi” is already one of your shops, so saving merges “Mandarake” into it.",
  );
  fireEvent.click(within(dialog).getByRole("button", { name: "Merge" }));
  await closed(dialog);
  expect(renames).toEqual([{ from: ["Mandarake"], to: "AmiAmi" }]);
});

test("a new name saves exactly as typed and replaces the shop in the list", async () => {
  openShops();
  const { dialog, input } = await openRename("Mandarake");

  fireEvent.change(input, { target: { value: "  mandarake Nakano " } });

  expect(within(dialog).getByRole("status").textContent).toBe("");
  fireEvent.click(within(dialog).getByRole("button", { name: "Rename" }));
  expect(await within(await yourShops()).findByText("mandarake Nakano")).toBeTruthy();
  expect(renames).toEqual([{ from: ["Mandarake"], to: "mandarake Nakano" }]);
});

test("a rename refreshes every page that shows shops", async () => {
  const client = new QueryClient();
  const shown = [["analytics"], ["expenses", "collection"], ["collection", {}], ["orders", {}]];
  for (const key of shown) client.setQueryData(key, { shown: true });
  openShops(client);
  const { dialog, input } = await openRename("Mandarake");

  fireEvent.change(input, { target: { value: "Mandarake Nakano" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Rename" }));

  await closed(dialog);
  for (const key of shown) expect(client.getQueryState(key)?.isInvalidated).toBe(true);
});

test("a failed rename says so and keeps the dialog open", async () => {
  failRenames = true;
  openShops();
  const { dialog, input } = await openRename("Mandarake");

  fireEvent.change(input, { target: { value: "Mandarake Nakano" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Rename" }));

  expect(await screen.findByText("Couldn't save “Mandarake Nakano”")).toBeTruthy();
  expect(screen.getByRole("dialog", renameDialog("Mandarake"))).toBe(dialog);
});

test("a user with no shops sees that there are none", async () => {
  saved = [];
  openShops();

  expect(await screen.findByText("No shops yet")).toBeTruthy();
});

test("a failed read says the shops could not load and tries again", async () => {
  failRead = true;
  openShops();

  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toBe("Couldn't load your shops");
  failRead = false;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await yourShops()).toBeTruthy();
});
