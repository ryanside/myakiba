import { afterEach, expect, test } from "bun:test";
import { Result } from "better-result";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import type { CascadeOptions, EditedOrder } from "@myakiba/contracts/orders/schema";
import type { Order } from "@myakiba/contracts/orders/types";
import { createOrdersColumns } from "./orders-columns";
import { OrderPendingContext } from "./order-pending-context";

afterEach(() => {
  cleanup();
  edits.length = 0;
  paidSets.length = 0;
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
    paid: false,
    payment: "unpaid",
    shippingFee: 0,
    taxes: 0,
    duties: 0,
    tariffs: 0,
    miscFees: 0,
    notes: "",
    total: 0,
    unpaidCosts: 0,
    itemCount: 0,
    images: [],
    createdAt: "2026-11-05T00:00:00.000Z",
    updatedAt: "2026-11-05T00:00:00.000Z",
  };
}

const edits: [EditedOrder, CascadeOptions][] = [];
const paidSets: [string, boolean][] = [];

const columns = createOrdersColumns({
  onEditOrder: async (values, cascade) => {
    edits.push([values, cascade]);
    return Result.ok();
  },
  onSetPaid: async (orderId: string, paid: boolean) => {
    paidSets.push([orderId, paid]);
    return Result.ok();
  },
  onDeleteOrders: async () => Result.ok(),
  onEditItem: async () => Result.ok(),
  onDeleteItem: async () => Result.ok(),
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

const {
  createdAt: _createdAt,
  updatedAt: _updatedAt,
  payment: _payment,
  total: _total,
  unpaidCosts: _unpaidCosts,
  itemCount: _itemCount,
  images: _images,
  ...savedOrder
} = order("o1");

test("saves a shop edit with only the fields a user edits, cascading the shop to its items", async () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <OrderPendingContext
        value={{ isOrderPending: () => false, isCollectionItemPending: () => false }}
      >
        <ColumnCells orders={[order("o1")]} columnId="shop" />
      </OrderPendingContext>
    </QueryClientProvider>,
  );

  fireEvent.focus(screen.getByRole("button", { name: "AmiAmi, edit Shop" }));
  const editor = screen.getByRole("combobox", { name: "Shop" });
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

test("a Paid click on a partly paid Order sets Paid on the Order and every item, not an edit", async () => {
  render(
    <OrderPendingContext
      value={{ isOrderPending: () => false, isCollectionItemPending: () => false }}
    >
      <ColumnCells orders={[{ ...order("o1"), paid: true, payment: "partly" }]} columnId="paid" />
    </OrderPendingContext>,
  );

  fireEvent.click(screen.getByRole("checkbox", { name: "o1 paid" }));

  await waitFor(() => expect(paidSets).toEqual([["o1", true]]));
  expect(edits).toEqual([]);
});

function OrderRow() {
  const table = useReactTable({
    data: [order("o1")],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowCanExpand: () => true,
  });
  return table
    .getRowModel()
    .rows[0]?.getVisibleCells()
    .filter(({ column }) => column.id === "expand" || column.id === "title")
    .map((cell) => (
      <div key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</div>
    ));
}

function glyph(control: HTMLElement): (string | null)[] {
  return [...control.querySelectorAll("svg path")].map((path) => path.getAttribute("d"));
}

test("draws the row's open-order link with a different icon from its expand button", async () => {
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <OrderPendingContext
          value={{ isOrderPending: () => false, isCollectionItemPending: () => false }}
        >
          <OrderRow />
        </OrderPendingContext>
      ),
    }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  render(<RouterProvider router={router} />);

  const expand = await screen.findByRole("button", { name: "Expand row" });
  const open = screen.getAllByRole("link", { name: "View o1" }).at(-1);
  if (!open) throw new Error("the row has no open-order link");

  expect(glyph(open)).not.toEqual(glyph(expand));
});

test("the Unpaid Costs column shows what each row still owes and leaves a row that owes nothing blank", () => {
  render(
    <OrderPendingContext
      value={{ isOrderPending: () => false, isCollectionItemPending: () => false }}
    >
      <ColumnCells
        orders={[
          { ...order("partly"), paid: true, payment: "partly", total: 3000, unpaidCosts: 1200 },
          { ...order("unpaid"), total: 3000, unpaidCosts: 3000 },
          { ...order("paid"), paid: true, payment: "paid", total: 3000, unpaidCosts: 0 },
        ]}
        columnId="unpaidCosts"
      />
    </OrderPendingContext>,
  );

  expect(["partly", "unpaid", "paid"].map((id) => screen.getByTestId(id).textContent)).toEqual([
    "$12.00",
    "$30.00",
    "",
  ]);
});

test("the Unpaid Costs column leaves a row blank when a negative fee takes its amount below zero", () => {
  render(
    <OrderPendingContext
      value={{ isOrderPending: () => false, isCollectionItemPending: () => false }}
    >
      <ColumnCells
        orders={[
          { ...order("credit"), payment: "partly", shippingFee: -10_000, unpaidCosts: -10_000 },
        ]}
        columnId="unpaidCosts"
      />
    </OrderPendingContext>,
  );

  expect(screen.getByTestId("credit").textContent).toBe("");
});
