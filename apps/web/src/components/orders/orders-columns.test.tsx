import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen, within } from "@testing-library/react";
import { flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import type { Order } from "@myakiba/contracts/orders/types";
import { createOrdersColumns, OrderPendingContext } from "./orders-columns";

afterEach(cleanup);

function order(orderId: string): Order {
  return {
    orderId,
    title: orderId,
    shop: "AmiAmi",
    releaseDate: null,
    shippingMethod: "n/a",
    orderDate: null,
    paymentDate: null,
    shippingDate: null,
    collectionDate: null,
    status: "Ordered",
    shippingFee: 0,
    taxes: 0,
    duties: 0,
    tariffs: 0,
    miscFees: 0,
    notes: "",
    total: 0,
    itemCount: 0,
    images: [],
    createdAt: "2026-11-05T00:00:00.000Z",
    updatedAt: "2026-11-05T00:00:00.000Z",
  };
}

const columns = createOrdersColumns({
  onEditOrder: async () => {},
  onDeleteOrders: async () => {},
  onEditItem: async () => {},
  onDeleteItem: async () => {},
  currency: "USD",
  locale: "en-US",
  dateFormat: "MM/DD/YYYY",
});

function StatusCells({ orders }: { readonly orders: readonly Order[] }) {
  const table = useReactTable({
    data: [...orders],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.orderId,
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

test("disables only the pending order's cells", () => {
  render(
    <OrderPendingContext
      value={{
        isOrderPending: (orderId) => orderId === "saving",
        isCollectionItemPending: () => false,
      }}
    >
      <StatusCells orders={[order("saving"), order("idle")]} />
    </OrderPendingContext>,
  );

  const status = (orderId: string) => within(screen.getByTestId(orderId)).getByLabelText("Status");
  expect("disabled" in status("saving").dataset).toBe(true);
  expect("disabled" in status("idle").dataset).toBe(false);
});
