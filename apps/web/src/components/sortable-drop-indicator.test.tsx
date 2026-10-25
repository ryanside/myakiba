import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import type { ComponentProps, ReactNode } from "react";
import { frame } from "../../test/kanban-drag";
import { ListMemberGrid } from "./lists/list-member-grid";
import { WishlistItemGrid } from "./wishlist/wishlist-item-grid";
import type { MediaViewMode } from "@/components/ui/view-toggle";
import { Route as ListsRoute } from "@/routes/(app)/lists";

const TITLES = ["Miku", "Rin", "Len"];
const ListsScreen = ListsRoute.options.component;

function wishlist(viewMode: MediaViewMode): ReactNode {
  const items = TITLES.map((title, index) => ({
    id: `wishlist-${index}`,
    itemId: `item-${index}`,
    itemExternalId: index + 1,
    title,
    image: null,
    category: "Prepainted",
    position: index,
    createdAt: "2026-01-01T00:00:00.000Z",
    latestRelease: null,
  })) satisfies ComponentProps<typeof WishlistItemGrid>["items"];
  return (
    <WishlistItemGrid
      items={items}
      releaseStatus="all"
      viewMode={viewMode}
      currency="JPY"
      dateFormat="MM/DD/YYYY"
      totalCount={items.length}
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

function listDetail(viewMode: MediaViewMode): ReactNode {
  const members = TITLES.map((title, index) => ({
    id: `member-${index}`,
    position: index,
    type: "item" as const,
    targetId: `item-${index}`,
    title,
    image: null,
    itemExternalId: index + 1,
  })) satisfies ComponentProps<typeof ListMemberGrid>["members"];
  return (
    <ListMemberGrid
      members={members}
      viewMode={viewMode}
      totalCount={members.length}
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

async function renderScreen(ui: ReactNode, storage: Readonly<Record<string, string>> = {}) {
  for (const [key, value] of Object.entries(storage)) {
    localStorage.setItem(key, JSON.stringify(value));
  }
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  client.setQueryData(["lists", "overview"], {
    pages: [
      {
        items: TITLES.map((title, index) => ({
          id: `list-${index}`,
          title,
          description: null,
          position: index,
          images: [],
        })),
        totalCount: TITLES.length,
      },
    ],
    pageParams: [0],
  });
  const root = createRootRoute({ component: Outlet });
  const app = createRoute({
    getParentRoute: () => root,
    id: "(app)",
    component: Outlet,
    beforeLoad: () => ({ session: { user: { currency: "JPY", dateFormat: "MM/DD/YYYY" } } }),
  });
  const route = createRoute({ getParentRoute: () => app, path: "/", component: () => ui });
  const router = createRouter({
    routeTree: root.addChildren([app.addChildren([route])]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

const TILE = { width: 180, height: 160, step: 200 };
const originalRect = HTMLElement.prototype.getBoundingClientRect;

function collectionChild(element: HTMLElement): HTMLElement | null {
  const parent = element.parentElement;
  if (!parent) return null;
  return parent.hasAttribute("aria-busy") ? element : collectionChild(parent);
}

// Lays the tiles out in one row and places the drag overlay where its inline style puts it, so
// the keyboard sensor can move from tile to tile.
function stubRowLayout(): void {
  HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect(this: HTMLElement) {
    const overlay = this.closest<HTMLElement>('[style*="position: fixed"]');
    if (overlay) {
      const [, x = "0", y = "0"] =
        /translate3d\((-?[\d.]+)px, (-?[\d.]+)px/.exec(overlay.style.transform) ?? [];
      return DOMRect.fromRect({
        x: Number.parseFloat(overlay.style.left) + Number(x),
        y: Number.parseFloat(overlay.style.top) + Number(y),
        width: Number.parseFloat(overlay.style.width),
        height: Number.parseFloat(overlay.style.height),
      });
    }
    const tile = collectionChild(this);
    const collection = tile?.parentElement;
    if (!tile || !collection) return DOMRect.fromRect({ x: 0, y: 0, width: 0, height: 0 });
    const index = [...collection.children].indexOf(tile);
    return DOMRect.fromRect({ x: index * TILE.step, y: 0, ...TILE });
  };
}

async function dragSecondTile(arrow: "ArrowLeft" | "ArrowRight"): Promise<HTMLElement> {
  const handle = screen.getByRole("button", { name: `Reorder ${TITLES[1]}` });
  await act(async () => {
    handle.focus();
  });
  for (const code of ["Space", arrow]) {
    fireEvent.keyDown(handle, { code, key: code === "Space" ? " " : code });
    await frame();
  }
  const indicator = document.querySelector<HTMLElement>('[aria-hidden="true"].bg-primary');
  if (!indicator) throw new Error("no drop indicator");
  return indicator;
}

function splitVariant(className: string): { readonly variant: string; readonly utility: string } {
  const colon = className.lastIndexOf(":");
  return colon === -1
    ? { variant: "", utility: className }
    : { variant: className.slice(0, colon), utility: className.slice(colon + 1) };
}

function toPx(value: string): number {
  const arbitrary = /^\[(-?[\d.]+)px\]$/.exec(value);
  return arbitrary ? Number(arbitrary[1]) : Number(value) * 4;
}

// The value a utility takes at a breakpoint: its unprefixed class, overridden by the breakpoint's.
function valueAt(element: Element, breakpoint: string, pattern: RegExp): number | undefined {
  let value: number | undefined;
  for (const variant of ["", breakpoint]) {
    for (const className of element.classList) {
      const split = splitVariant(className);
      const match = pattern.exec(split.utility);
      if (split.variant === variant && match?.[1]) value = toPx(match[1]);
    }
  }
  return value;
}

const COLUMN_GAP = /^gap-(?:x-)?(?!y-)(.+)$/;

function expectCentredInGap(indicator: HTMLElement, side: "left" | "right"): void {
  const collection = indicator.parentElement?.parentElement;
  if (!collection) throw new Error("drop indicator is outside a collection");
  const breakpoints = new Set(
    [...collection.classList, ...indicator.classList].map((name) => splitVariant(name).variant),
  );
  for (const breakpoint of breakpoints) {
    const gap = valueAt(collection, breakpoint, COLUMN_GAP);
    const width = valueAt(indicator, breakpoint, /^w-(.+)$/);
    const offset = valueAt(indicator, breakpoint, new RegExp(`^-${side}-(.+)$`));
    if (gap === undefined || width === undefined) throw new Error("no gap or indicator width");
    expect({ breakpoint, offset }).toEqual({ breakpoint, offset: gap / 2 + width / 2 });
  }
}

beforeAll(stubRowLayout);
afterAll(() => {
  HTMLElement.prototype.getBoundingClientRect = originalRect;
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});

const SCREENS = [
  { name: "Lists grid", ui: () => (ListsScreen ? <ListsScreen /> : null), view: "grid" },
  { name: "Wishlist grid", ui: () => wishlist("grid") },
  { name: "Wishlist gallery", ui: () => wishlist("gallery") },
  { name: "List detail grid", ui: () => listDetail("grid") },
  { name: "List detail gallery", ui: () => listDetail("gallery") },
] as const;

describe.each(SCREENS)("$name drop indicator", (entry) => {
  test.each([
    ["before", "ArrowLeft", "left"],
    ["after", "ArrowRight", "right"],
  ] as const)(
    "sits centred in the gap %s the tile it marks",
    async (_placement, arrow, side) => {
      await renderScreen(entry.ui(), "view" in entry ? { "lists:viewMode": entry.view } : {});
      expectCentredInGap(await dragSecondTile(arrow), side);
      fireEvent.keyDown(screen.getByRole("button", { name: `Reorder ${TITLES[1]}` }), {
        code: "Escape",
        key: "Escape",
      });
      await frame();
    },
    20_000,
  );
});
