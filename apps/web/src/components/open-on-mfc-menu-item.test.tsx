import { afterEach, expect, test } from "bun:test";
import { Result } from "better-result";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import type { ColumnDef } from '@tanstack/react-table';
import type { ReactNode } from "react";
import type { CollectionItem } from "@myakiba/contracts/collection/types";
import type { OrderItem } from "@myakiba/contracts/orders/types";
import { CollectionItemControls } from "./collection/collection-item-controls";
import { createCollectionColumns } from "./collection/collection-columns";
import { CollectionPendingContext } from "./collection/collection-pending-context";
import { createOrderItemSubColumns } from "./orders/order-item-sub-columns";
import { OrderPendingContext } from "./orders/order-pending-context";

afterEach(cleanup);

const collectionItem = (itemExternalId: number | null): CollectionItem => ({
  id: "ci-1",
  orderId: null,
  itemId: "item-1",
  itemExternalId,
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
});

const orderItem = (itemExternalId: number | null): OrderItem => ({
  id: "ci-1",
  orderId: "order-1",
  itemId: "item-1",
  itemExternalId,
  itemTitle: "Hatsune Miku",
  itemImage: null,
  itemCategory: null,
  status: "Ordered",
  count: 1,
  score: "0",
  price: 0,
  shop: "AmiAmi",
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
});

const saved = async () => Result.ok();
const collectionHandlers = {
  onEditCollectionItem: saved,
  onDeleteCollectionItems: saved,
  onAddCollectionItemsToOrder: saved,
  onAddCollectionItemsToNewOrder: saved,
  currency: "USD",
  dateFormat: "MM/DD/YYYY",
} as const;

function ActionsCell<Row>({
  row,
  columns,
}: {
  readonly row: Row;
  readonly columns: ColumnDef<Row>[];
}): ReactNode {
  const table = useReactTable({ data: [row], columns, getCoreRowModel: getCoreRowModel() });
  const cell = table
    .getRowModel()
    .rows[0]?.getVisibleCells()
    .find((visible) => visible.column.id === "actions");
  return cell ? flexRender(cell.column.columnDef.cell, cell.getContext()) : null;
}

const MENUS: readonly (readonly [string, (externalId: number | null) => ReactNode])[] = [
  [
    "a collection card",
    (externalId) => (
      <CollectionItemControls
        {...collectionHandlers}
        item={collectionItem(externalId)}
        itemSize={300}
        variant="card"
        isPending={false}
        isSelected={false}
        onToggleSelection={() => {}}
      />
    ),
  ],
  [
    "a collection table row",
    (externalId) => (
      <CollectionPendingContext value={{ isItemPending: () => false }}>
        <ActionsCell
          row={collectionItem(externalId)}
          columns={createCollectionColumns({ ...collectionHandlers, locale: "en-US" })}
        />
      </CollectionPendingContext>
    ),
  ],
  [
    "an order item row",
    (externalId) => (
      <OrderPendingContext
        value={{ isOrderPending: () => false, isCollectionItemPending: () => false }}
      >
        <ActionsCell
          row={orderItem(externalId)}
          columns={createOrderItemSubColumns({
            orderId: "order-1",
            onEditItem: saved,
            onDeleteItem: saved,
            currency: "USD",
            locale: "en-US",
            dateFormat: "MM/DD/YYYY",
          })}
        />
      </OrderPendingContext>
    ),
  ],
];

/** Opens the menu and waits for it, so a missing entry is absent and not still loading. */
async function openMenu(menu: () => ReactNode): Promise<void> {
  const router = createRouter({
    routeTree: createRootRoute({ component: menu }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  const user = userEvent.setup({ delay: null });
  await user.click(await screen.findByRole("button", { name: "Open menu" }));
  await screen.findByRole("menuitem", { name: "View details" });
}

for (const [name, Menu] of MENUS) {
  test(`${name}'s menu opens an MFC Item's page on MFC in a new tab`, async () => {
    await openMenu(() => Menu(1006));

    const link = await screen.findByRole("menuitem", { name: "Open on MFC" });
    expect(link.getAttribute("href")).toBe("https://myfigurecollection.net/item/1006");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  test(`${name}'s menu has no MFC entry for a custom Item`, async () => {
    await openMenu(() => Menu(null));

    expect(screen.queryByRole("menuitem", { name: "Open on MFC" }) === null).toBe(true);
    expect(screen.queryByRole("menuitem", { name: /MFC/u }) === null).toBe(true);
  });
}
