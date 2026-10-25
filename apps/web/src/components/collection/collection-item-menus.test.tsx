import { afterEach, mock, test } from "bun:test";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import type { ReactNode } from "react";
import type { CollectionItem } from "@myakiba/contracts/collection/types";

const realSearch = await import("@/queries/search");
await mock.module("@/queries/search", () => ({
  ...realSearch,
  searchOrders: async () => ({ orderIdsAndTitles: [] }),
}));

const { CollectionItemControls } = await import("./collection-item-controls");
const { createCollectionColumns } = await import("./collection-columns");

afterEach(cleanup);

const item: CollectionItem = {
  id: "ci-1",
  orderId: null,
  itemId: "item-1",
  itemExternalId: 1,
  itemTitle: "Hatsune Miku",
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

const handlers = {
  onEditCollectionItem: async () => {},
  onDeleteCollectionItems: async () => {},
  onAddCollectionItemsToOrder: async () => {},
  onAddCollectionItemsToNewOrder: async () => {},
  currency: "USD",
  dateFormat: "MM/DD/YYYY",
} as const;

function RowActions(): ReactNode {
  const table = useReactTable({
    data: [item],
    columns: createCollectionColumns({
      ...handlers,
      locale: "en-US",
      isCollectionPending: () => false,
      isCollectionOrderPending: () => false,
    }),
    getCoreRowModel: getCoreRowModel(),
  });
  const cell = table
    .getRowModel()
    .rows[0]?.getVisibleCells()
    .find((visible) => visible.column.id === "actions");
  return cell ? flexRender(cell.column.columnDef.cell, cell.getContext()) : null;
}

const MENUS: readonly (readonly [string, () => ReactNode])[] = [
  [
    "a collection card",
    () => (
      <CollectionItemControls
        {...handlers}
        item={item}
        itemSize={300}
        variant="card"
        isPending={false}
        isSelected={false}
        onToggleSelection={() => {}}
      />
    ),
  ],
  ["a collection table row", RowActions],
];

// A failed expect on an open popup hangs Bun while it prints the React-owned node.
// An open dialog hides the page behind it, so the menu is looked up among hidden nodes too.
const waitForNo = (role: "menu" | "dialog") =>
  waitFor(() => {
    if (screen.queryByRole(role, { hidden: true })) throw new Error(`${role} still open`);
  });

for (const [name, Menu] of MENUS) {
  test(`choosing Assign order in ${name}'s actions menu closes the menu behind its dialog`, async () => {
    const root = createRootRoute({ component: Menu });
    const router = createRouter({
      routeTree: root,
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    const user = userEvent.setup({ delay: null });
    const trigger = await screen.findByRole("button", { name: "Open menu" });

    await user.click(trigger);
    await user.click(await screen.findByRole("menuitem", { name: "Assign order" }));

    await screen.findByRole("dialog");
    await waitForNo("menu");

    await user.keyboard("{Escape}");
    await waitForNo("dialog");
    await waitFor(() => {
      if (document.activeElement !== trigger) throw new Error("focus did not return to the menu");
    });
  });
}
