import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import type { ComponentProps } from "react";
import { WishlistItemGrid } from "./wishlist-item-grid";

afterEach(cleanup);

const item = {
  id: "wishlist-1",
  itemId: "item-1",
  itemExternalId: 123,
  title: "Hatsune Miku",
  image: null,
  category: "Prepainted",
  position: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  latestRelease: null,
} satisfies ComponentProps<typeof WishlistItemGrid>["items"][number];

describe.each(["all", "upcoming", "available"] as const)(
  "Wishlist %s controls",
  (releaseStatus) => {
    test.each(["grid", "gallery", "list"] as const)(
      "%s controls only pin for an active operation or list view",
      async (viewMode) => {
        const root = createRootRoute({
          component: () => (
            <WishlistItemGrid
              items={[item, { ...item, id: "wishlist-2", itemId: "item-2", title: "Kagamine Rin" }]}
              releaseStatus={releaseStatus}
              viewMode={viewMode}
              currency="JPY"
              dateFormat="MM/DD/YYYY"
              totalCount={2}
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
          ),
        });
        const router = createRouter({
          routeTree: root,
          history: createMemoryHistory({ initialEntries: ["/"] }),
        });
        await router.load();
        const { container } = render(<RouterProvider router={router} />);
        const controls = container.querySelector('[data-slot="item-controls"]');

        expect(controls?.classList.contains("pointer-fine:opacity-0")).toBe(viewMode !== "list");
        expect(
          controls?.classList.contains("pointer-fine:group-has-[:focus-visible]/item:opacity-100"),
        ).toBe(viewMode !== "list");
        expect(
          screen.getByRole<HTMLButtonElement>("button", { name: "Reorder Hatsune Miku" }).disabled,
        ).toBe(releaseStatus !== "all");
        expect(
          screen.getByRole<HTMLButtonElement>("button", {
            name: "Remove Hatsune Miku from Wishlist",
          }).disabled,
        ).toBe(false);
      },
    );
  },
);
