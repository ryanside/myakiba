import { afterEach, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import type { CascadeOptions, EditedOrder } from "@myakiba/contracts/orders/schema";
import type { Order } from "@myakiba/contracts/orders/types";
import { createOrdersColumns } from "./orders-columns";
import { OrderPendingContext } from "./order-pending-context";

afterEach(() => {
  cleanup();
  edits.length = 0;
});

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

const edits: [EditedOrder, CascadeOptions][] = [];

const columns = createOrdersColumns({
  onEditOrder: async (values, cascade) => {
    edits.push([values, cascade]);
  },
  onDeleteOrders: async () => {},
  onEditItem: async () => {},
  onDeleteItem: async () => {},
  currency: "USD",
  locale: "en-US",
  dateFormat: "MM/DD/YYYY",
});

function ColumnCells({
  orders,
  columnId,
}: {
  readonly orders: readonly Order[];
  readonly columnId: string;
}) {
  const table = useReactTable({
    data: [...orders],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.orderId,
  });
  return table.getRowModel().rows.map((row) => {
    const cell = row.getAllCells().find(({ column }) => column.id === columnId);
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
      <ColumnCells orders={[order("saving"), order("idle")]} columnId="status" />
    </OrderPendingContext>,
  );

  const status = (orderId: string) => within(screen.getByTestId(orderId)).getByLabelText("Status");
  expect("disabled" in status("saving").dataset).toBe(true);
  expect("disabled" in status("idle").dataset).toBe(false);
});

test("refuses to render without a pending provider", () => {
  expect(() => render(<ColumnCells orders={[order("saving")]} columnId="status" />)).toThrow(
    "Order rows must render inside OrdersDataGrid or the order detail page, or provide OrderPendingContext",
  );
});

const { createdAt: _createdAt, updatedAt: _updatedAt, ...savedOrder } = order("o1");

test("saves a shop edit without timestamps, cascading the shop to its items", async () => {
  render(
    <OrderPendingContext
      value={{ isOrderPending: () => false, isCollectionItemPending: () => false }}
    >
      <ColumnCells orders={[order("o1")]} columnId="shop" />
    </OrderPendingContext>,
  );

  fireEvent.focus(screen.getByRole("button", { name: "AmiAmi, edit Shop" }));
  const editor = screen.getByRole("textbox", { name: "Shop" });
  fireEvent.change(editor, { target: { value: "HLJ" } });
  fireEvent.keyDown(editor, { key: "Enter" });

  await waitFor(() => expect(edits).toEqual([[{ ...savedOrder, shop: "HLJ" }, ["shop"]]]));
});

test("saves a fee edit without cascading", async () => {
  render(
    <OrderPendingContext
      value={{ isOrderPending: () => false, isCollectionItemPending: () => false }}
    >
      <ColumnCells orders={[order("o1")]} columnId="taxes" />
    </OrderPendingContext>,
  );

  fireEvent.click(screen.getByRole("button", { name: "$0.00, edit Taxes" }));
  const editor = screen.getByRole("textbox", { name: "Taxes" });
  fireEvent.change(editor, { target: { value: "5" } });
  fireEvent.keyDown(editor, { key: "Enter" });

  await waitFor(() => expect(edits).toEqual([[{ ...savedOrder, taxes: 500 }, []]]));
});
