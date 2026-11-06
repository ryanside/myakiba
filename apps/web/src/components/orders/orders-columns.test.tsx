import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen, within } from "@testing-library/react";
import { flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import type { ColumnDef } from "@tanstack/react-table";
import type { Order, OrderItem } from "@myakiba/contracts/orders/types";
import { createOrderItemSubColumns } from "./order-item-sub-columns";
import { createOrdersColumns } from "./orders-columns";
import { OrderPendingContext } from "./order-pending-context";

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

const orderColumns = createOrdersColumns({
  onEditOrder: async () => {},
  onDeleteOrders: async () => {},
  onEditItem: async () => {},
  onDeleteItem: async () => {},
  currency: "USD",
  locale: "en-US",
  dateFormat: "MM/DD/YYYY",
});

function StatusCells<TRow>({
  rows,
  columns,
  rowId,
}: {
  readonly rows: readonly TRow[];
  readonly columns: ColumnDef<TRow>[];
  readonly rowId: (row: TRow) => string;
}) {
  const table = useReactTable({
    data: [...rows],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: rowId,
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

const orderItemColumns = createOrderItemSubColumns({
  orderId: "order-1",
  onEditItem: async () => {},
  onDeleteItem: async () => {},
  currency: "USD",
  locale: "en-US",
  dateFormat: "MM/DD/YYYY",
});

function OrderStatusCells({ orders }: { readonly orders: readonly Order[] }) {
  return <StatusCells rows={orders} columns={orderColumns} rowId={(row) => row.orderId} />;
}

test("disables only the pending order's cells", () => {
  render(
    <OrderPendingContext
      value={{
        isOrderPending: (orderId) => orderId === "saving",
        isCollectionItemPending: () => false,
      }}
    >
      <OrderStatusCells orders={[order("saving"), order("idle")]} />
    </OrderPendingContext>,
  );

  const status = (orderId: string) => within(screen.getByTestId(orderId)).getByLabelText("Status");
  expect("disabled" in status("saving").dataset).toBe(true);
  expect("disabled" in status("idle").dataset).toBe(false);
});

test("disables only the pending order item's cells", () => {
  render(
    <OrderPendingContext
      value={{
        isOrderPending: () => false,
        isCollectionItemPending: (id) => id === "saving",
      }}
    >
      <StatusCells
        rows={[orderItem("saving"), orderItem("idle")]}
        columns={orderItemColumns}
        rowId={(row) => row.id}
      />
    </OrderPendingContext>,
  );

  const status = (id: string) => within(screen.getByTestId(id)).getByLabelText("Status");
  expect("disabled" in status("saving").dataset).toBe(true);
  expect("disabled" in status("idle").dataset).toBe(false);
});

test("refuses to render without a pending provider", () => {
  expect(() => render(<OrderStatusCells orders={[order("saving")]} />)).toThrow(
    "Order rows must be rendered within a grid that provides OrderPendingContext",
  );
});
