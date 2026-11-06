import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen, within } from "@testing-library/react";
import { flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import type { OrderItem } from "@myakiba/contracts/orders/types";
import { createOrderItemSubColumns } from "./order-item-sub-columns";
import { OrderPendingContext } from "./order-pending-context";

afterEach(cleanup);

function orderItem(id: string): OrderItem {
  return {
    id,
    orderId: "order-1",
    itemId: `item-${id}`,
    itemExternalId: null,
    itemTitle: id,
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
  };
}

const columns = createOrderItemSubColumns({
  orderId: "order-1",
  onEditItem: async () => {},
  onDeleteItem: async () => {},
  currency: "USD",
  locale: "en-US",
  dateFormat: "MM/DD/YYYY",
});

function StatusCells({ items }: { readonly items: readonly OrderItem[] }) {
  const table = useReactTable({
    data: [...items],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  });
  return table.getRowModel().rows.map((row) => {
    const cell = row.getAllCells().find(({ column }) => column.id === "status");
    return (
      <div key={row.id} data-testid={row.id}>
        {cell ? flexRender(cell.column.columnDef.cell, cell.getContext()) : null}
      </div>
    );
  });
}

test("disables only the pending order item's cells", () => {
  render(
    <OrderPendingContext
      value={{
        isOrderPending: () => false,
        isCollectionItemPending: (id) => id === "saving",
      }}
    >
      <StatusCells items={[orderItem("saving"), orderItem("idle")]} />
    </OrderPendingContext>,
  );

  const status = (id: string) => within(screen.getByTestId(id)).getByLabelText("Status");
  expect("disabled" in status("saving").dataset).toBe(true);
  expect("disabled" in status("idle").dataset).toBe(false);
});
