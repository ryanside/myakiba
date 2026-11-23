import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { collectionSearchSchema } from "@myakiba/contracts/collection/schema";
import type { CollectionItem } from "@myakiba/contracts/collection/types";

function pendingViewItem(id: string): CollectionItem {
  return {
    id,
    orderId: null,
    itemId: `item-${id}`,
    itemExternalId: null,
    itemTitle: id,
    itemImage: null,
    itemCategory: null,
    itemScale: null,
    status: "Owned",
    count: 1,
    score: "0",
    price: 0,
    shop: "",
    condition: "New",
    orderDate: null,
    paymentDate: null,
    shippingDate: null,
    collectionDate: null,
    shippingMethod: "n/a",
    tags: [],
    notes: "",
    releaseId: null,
    releaseDate: null,
    releasePrice: null,
    releaseType: null,
    releaseCurrency: null,
    releaseBarcode: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

const items = [pendingViewItem("saving"), pendingViewItem("idle")];
const pending = { edit: new Set<string>(), order: new Set<string>() };

const realCollection = await import("@/hooks/use-collection");
await mock.module("@/hooks/use-collection", () => ({
  ...realCollection,
  useCollectionFilters: () => ({ filters: {}, setFilters: () => {} }),
  useCollectionQuery: () => ({ items, totalCount: items.length, isPending: false }),
  useCollectionMutations: () => ({
    handleEditCollectionItem: async () => {},
    handleDeleteCollectionItems: async () => {},
    isCollectionPending: (id: string) => pending.edit.has(id),
    isDeletingCollectionItems: false,
  }),
  useCollectionOrderMutations: () => ({
    handleAddCollectionItemsToOrder: async () => {},
    handleAddCollectionItemsToNewOrder: async () => {},
    isCollectionOrderPending: (id: string) => pending.order.has(id),
    isMovingCollectionItems: false,
    isSplittingCollectionItems: false,
  }),
}));
const { CollectionDataGrid } = await import("./collection-data-grid");

afterEach(() => {
  cleanup();
  localStorage.clear();
  pending.edit.clear();
  pending.order.clear();
});

async function renderCollection(viewMode: string) {
  localStorage.setItem("collection:viewMode", JSON.stringify(viewMode));
  const root = createRootRoute({ component: Outlet });
  const app = createRoute({
    getParentRoute: () => root,
    id: "(app)",
    component: Outlet,
    beforeLoad: () => ({ session: { user: { currency: "USD", dateFormat: "MM/DD/YYYY" } } }),
  });
  const collection = createRoute({
    getParentRoute: () => app,
    path: "/collection",
    component: CollectionDataGrid,
    validateSearch: collectionSearchSchema,
  });
  const router = createRouter({
    routeTree: root.addChildren([app.addChildren([collection])]),
    history: createMemoryHistory({ initialEntries: ["/collection"] }),
  });
  await router.load();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  const [saving, idle] = await screen.findAllByRole("button", { name: "Edit item" });
  return { saving, idle };
}

describe.each(["table", "grid", "gallery"])("the collection %s view", (viewMode) => {
  test.each(["edit", "order"] as const)(
    "disables only the item with a pending %s",
    async (source) => {
      pending[source].add("saving");
      const { saving, idle } = await renderCollection(viewMode);
      expect(saving?.hasAttribute("disabled")).toBe(true);
      expect(idle?.hasAttribute("disabled")).toBe(false);
    },
  );
});
