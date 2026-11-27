import { afterAll, afterEach, expect, test } from "bun:test";
import { Result } from "better-result";
import * as z from "zod";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import type { CascadeOptions, EditedOrder } from "@myakiba/contracts/orders/schema";
import type { Order } from "@myakiba/contracts/orders/types";
import { parseJson } from "@myakiba/utils/parse-json";

const realFetch = globalThis.fetch;
const sent: string[] = [];
globalThis.fetch = Object.assign(
  async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init);
    if (request.method !== "PUT") return new Response(null, { status: 503 });
    sent.push(await request.text());
    return new Response("Order updated successfully");
  },
  { preconnect: realFetch.preconnect },
);

const { updateOrderDate } = await import("@/queries/orders");
const { createOrdersColumns } = await import("./orders-columns");
const { OrderPendingContext } = await import("./order-pending-context");
const { OrderForm } = await import("./order-form");

afterEach(cleanup);
afterAll(() => {
  globalThis.fetch = realFetch;
});

const order: Order = {
  orderId: "od-alpha",
  title: "Alpha Order",
  shop: "AmiAmi",
  releaseDate: null,
  shippingMethod: "EMS",
  orderDate: null,
  paymentDate: null,
  shippingDate: "2026-03-10",
  collectionDate: null,
  status: "Shipped",
  paid: false,
  total: 0,
  shippingFee: 0,
  taxes: 0,
  duties: 0,
  tariffs: 0,
  miscFees: 0,
  notes: "",
  itemCount: 2,
  images: [],
  createdAt: "2026-03-01T00:00:00.000Z",
  updatedAt: "2026-03-01T00:00:00.000Z",
};
const newShippingDay = /March 20th, 2026/;

async function fromDashboard(): Promise<readonly string[] | string> {
  sent.length = 0;
  await updateOrderDate(order.orderId, "shippingDate", "2026-03-20");
  const [body = ""] = sent;
  return parseJson(z.object({ cascadeOptions: z.array(z.string()) }), body)
    .map(({ cascadeOptions }) => cascadeOptions)
    .unwrapOr(body);
}

async function fromOrdersTable(): Promise<CascadeOptions | undefined> {
  const edits: CascadeOptions[] = [];
  const columns = createOrdersColumns({
    onEditOrder: async (_values: EditedOrder, cascadeOptions: CascadeOptions) => {
      edits.push(cascadeOptions);
      return Result.ok();
    },
    onSetPaid: async () => Result.ok(),
    onEditItem: async () => Result.ok(),
    onDeleteItem: async () => Result.ok(),
    currency: "USD",
    locale: "en-US",
    dateFormat: "MM/DD/YYYY",
  });
  function ShippingDateCell() {
    const table = useReactTable({
      data: [order],
      columns,
      getCoreRowModel: getCoreRowModel(),
      getRowId: (row) => row.orderId,
    });
    const cell = table
      .getRowModel()
      .rows[0]?.getAllCells()
      .find(({ column }) => column.id === "shippingDate");
    return cell ? flexRender(cell.column.columnDef.cell, cell.getContext()) : null;
  }
  render(
    <OrderPendingContext
      value={{ isOrderPending: () => false, isCollectionItemPending: () => false }}
    >
      <ShippingDateCell />
    </OrderPendingContext>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "03/10/2026" }));
  await user.click(screen.getByRole("button", { name: newShippingDay }));
  await waitFor(() => expect(edits.length).toBe(1));
  cleanup();
  return edits[0];
}

async function fromEditOrderSheet(): Promise<CascadeOptions | undefined> {
  const edits: CascadeOptions[] = [];
  const queryClient = new QueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <OrderForm
        type="edit-order"
        renderTrigger={<button type="button">Open</button>}
        orderData={order}
        callbackFn={async (_values, cascadeOptions) => {
          edits.push(cascadeOptions);
          return Result.ok();
        }}
        currency="USD"
      />
    </QueryClientProvider>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Open" }));
  const sheet = screen.getByRole("dialog", { name: "Edit Order" });
  await user.click(within(sheet).getByRole("button", { name: "Shipping Date" }));
  await user.click(screen.getByRole("button", { name: newShippingDay }));
  await user.click(within(sheet).getByRole("button", { name: "Update" }));
  await waitFor(() => expect(edits.length).toBe(1));
  cleanup();
  queryClient.clear();
  return edits[0];
}

test("a Shipping Date change sends the same Cascade to Items from the Dashboard, the Orders table and the Edit Order sheet", async () => {
  expect({
    dashboard: await fromDashboard(),
    ordersTable: await fromOrdersTable(),
    editOrderSheet: await fromEditOrderSheet(),
  }).toEqual({
    dashboard: ["shippingDate"],
    ordersTable: ["shippingDate"],
    editOrderSheet: ["shippingDate"],
  });
});
