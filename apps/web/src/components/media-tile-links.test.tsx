import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { itemDatabaseSearchSchema } from "@myakiba/contracts/search/schema";
import type { ComponentProps, ReactNode } from "react";
import { ItemDatabase } from "./item-database/item-database";
import { ListMemberGrid } from "./lists/list-member-grid";
import { WishlistItemGrid } from "./wishlist/wishlist-item-grid";
import { searches } from "@/data/resources/search";
import type { MediaViewMode } from "@/components/ui/view-toggle";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const item = {
  id: "wishlist-1",
  itemId: "item-1",
  itemExternalId: 123,
  title: "Hatsune Miku",
  image: "https://example.com/miku.jpg",
  category: "Prepainted",
  position: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  latestRelease: { date: "2026-01-02", price: 12_000, priceCurrency: "JPY" },
} satisfies ComponentProps<typeof WishlistItemGrid>["items"][number];

function wishlist(viewMode: MediaViewMode, custom: boolean): ReactNode {
  return (
    <WishlistItemGrid
      items={[{ ...item, itemExternalId: custom ? null : item.itemExternalId }]}
      releaseStatus="all"
      viewMode={viewMode}
      currency="JPY"
      dateFormat="MM/DD/YYYY"
      totalCount={1}
      isPending={false}
      isSaving={false}
      sortingDisabled={false}
      removingItemId={undefined}
      hasNextPage={false}
      isFetchingNextPage={false}
      onLoadMore={async () => ({ isFetchNextPageError: false })}
      onRemove={async () => {}}
      onMove={async () => {}}
    />
  );
}

const members = [
  {
    id: "member-item",
    position: 0,
    type: "item",
    targetId: "item-1",
    title: "Hatsune Miku",
    image: item.image,
    itemExternalId: 123,
  },
  {
    id: "member-custom",
    position: 1,
    type: "item",
    targetId: "custom-1",
    title: "Custom Miku",
    image: null,
    itemExternalId: null,
  },
  {
    id: "member-collection",
    position: 2,
    type: "collectionItem",
    targetId: "collection-1",
    itemId: "custom-2",
    title: "Owned Miku",
    image: item.image,
    itemExternalId: null,
  },
  {
    id: "member-order",
    position: 3,
    type: "order",
    targetId: "order-1",
    title: "Miku order",
    images: [item.image],
  },
] satisfies ComponentProps<typeof ListMemberGrid>["members"];

function list(viewMode: MediaViewMode): ReactNode {
  return (
    <ListMemberGrid
      members={members}
      viewMode={viewMode}
      totalCount={4}
      isSaving={false}
      sortingDisabled={false}
      removingMemberIds={undefined}
      hasNextPage={false}
      isFetchingNextPage={false}
      selectedIds={new Set()}
      onLoadMore={async () => ({ isFetchNextPageError: false })}
      onRemove={async () => {}}
      onMove={async () => {}}
      onClearSelection={() => {}}
      onToggleSelection={() => {}}
    />
  );
}

async function renderTiles(ui: ReactNode, viewMode: MediaViewMode) {
  localStorage.setItem("item-database:viewMode", JSON.stringify(viewMode));
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  const search = itemDatabaseSearchSchema.parse({});
  client.setQueryData(searches.itemDatabase.key(search), {
    items: [
      {
        itemId: item.itemId,
        externalId: 123,
        title: item.title,
        image: item.image,
        category: item.category,
        latestRelease: item.latestRelease,
      },
    ],
    totalCount: 1,
  });
  const root = createRootRoute({ component: Outlet });
  const app = createRoute({
    getParentRoute: () => root,
    id: "(app)",
    component: Outlet,
    beforeLoad: () => ({ session: { user: { currency: "JPY", dateFormat: "MM/DD/YYYY" } } }),
  });
  const route = createRoute({
    getParentRoute: () => app,
    path: "/items",
    validateSearch: itemDatabaseSearchSchema,
    component: () => ui,
  });
  const router = createRouter({
    routeTree: root.addChildren([app.addChildren([route])]),
    history: createMemoryHistory({ initialEntries: ["/items"] }),
  });
  await router.load();
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

function expectTitleLink(title: string, href: string, viewMode: MediaViewMode) {
  const titleLink = screen
    .getAllByRole<HTMLAnchorElement>("link", { name: title })
    .find((link) => link.textContent === title);
  expect(titleLink).toBeDefined();
  expect(titleLink?.getAttribute("href")).toBe(href);
  const tile = titleLink?.closest(".group\\/item");
  expect(tile?.querySelectorAll("a")).toHaveLength(viewMode === "list" ? 1 : 2);
  if (viewMode === "grid") expect(tile?.querySelector("a")?.querySelector("img")).not.toBeNull();
}

describe.each(["grid", "list"] as const)("%s tile links", (viewMode) => {
  test.each([
    { kind: "catalogue", custom: false },
    { kind: "custom", custom: true },
  ])("Wishlist $kind metadata is selectable outside image and title links", async ({ custom }) => {
    await renderTiles(wishlist(viewMode, custom), viewMode);
    expectTitleLink(item.title, custom ? "/item/custom/item-1" : "/item/123", viewMode);
    for (const text of ["Prepainted", "Figures", "¥120", "01/02/2026"]) {
      for (const metadata of screen.getAllByText(text)) expect(metadata.closest("a")).toBeNull();
    }
    expect(
      screen.getByRole("button", { name: `Remove ${item.title} from Wishlist` }),
    ).toBeDefined();
  });

  test("Item Database metadata is selectable outside image and title links", async () => {
    await renderTiles(<ItemDatabase />, viewMode);
    expectTitleLink(item.title, "/item/123", viewMode);
    for (const text of ["Prepainted", "Figures", "¥120", "01/02/2026"]) {
      for (const metadata of screen.getAllByText(text)) expect(metadata.closest("a")).toBeNull();
    }
  });

  test("List detail member types are selectable outside image and title links", async () => {
    const { container } = await renderTiles(list(viewMode), viewMode);
    for (const [index, href] of [
      "/item/123",
      "/item/custom/custom-1",
      "/item/custom/custom-2",
      "/orders/order-1",
    ].entries()) {
      const member = members[index];
      if (!member) throw new Error("Missing member fixture");
      const tile = container.querySelectorAll<HTMLElement>(".group\\/item")[index];
      if (!tile) throw new Error("Missing member tile");
      const titleLink = within(tile)
        .getAllByRole("link", { name: member.title })
        .find((link) => link.textContent === member.title);
      expect(titleLink).toBeDefined();
      expect(titleLink?.getAttribute("href")).toBe(href);
      expect(tile.querySelectorAll("a")).toHaveLength(viewMode === "list" ? 1 : 2);
      for (const label of within(tile).getAllByText(/^(Item|Collection Item|Order)$/))
        expect(label.closest("a")).toBeNull();
      expect(within(tile).getByRole("checkbox", { name: `Select ${member.title}` })).toBeDefined();
    }
  });
});

describe.each([
  ["grid", "underline"],
  ["list", "do not underline"],
] as const)("%s titles", (viewMode, underline) => {
  test.each([
    ["Wishlist catalogue", () => wishlist(viewMode, false), [item.title]],
    ["Wishlist custom", () => wishlist(viewMode, true), [item.title]],
    ["Item Database", () => <ItemDatabase />, [item.title]],
    ["List detail", () => list(viewMode), members.map((member) => member.title)],
  ] as const)(`%s titles ${underline} on hover`, async (_view, ui, titles) => {
    await renderTiles(ui(), viewMode);
    for (const title of titles) {
      const titleLink = screen
        .getAllByRole("link", { name: title })
        .find((link) => link.textContent === title);
      expect(titleLink).toBeDefined();
      expect(titleLink?.classList.contains("hover:underline")).toBe(viewMode === "grid");
    }
  });
});

test.each([
  ["Wishlist", () => wishlist("list", false)],
  ["Item Database", () => <ItemDatabase />],
  ["List detail", () => list("list")],
] as const)("%s list rows name the item once, through the title link", async (_view, ui) => {
  const { container } = await renderTiles(ui(), "list");
  const images = container.querySelectorAll("img");
  expect(images.length).toBeGreaterThan(0);
  for (const image of images) expect(image.getAttribute("alt")).toBe("");
  expect(screen.queryAllByRole("img", { name: item.title })).toHaveLength(0);
});

test("gallery tiles remain image-only links named by their title", async () => {
  const { container } = await renderTiles(wishlist("gallery", false), "gallery");
  expect(screen.getByRole("link", { name: item.title }).getAttribute("href")).toBe("/item/123");
  expect(container.querySelectorAll("a")).toHaveLength(1);
  expect(screen.queryByText("Prepainted")).toBeNull();
});

test("Item Database opens its default view when the stored view is one it doesn't know", async () => {
  await renderTiles(<ItemDatabase />, "table" as MediaViewMode);
  expectTitleLink(item.title, "/item/123", "grid");
});
