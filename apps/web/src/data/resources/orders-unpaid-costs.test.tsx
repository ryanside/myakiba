import { afterEach, expect, mock, test } from "bun:test";
import { act, cleanup, render, renderHook, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import { getCoreRowModel, useReactTable, flexRender } from "@tanstack/react-table";
import { Result } from "better-result";
import type { ReactNode } from "react";
import type { OrderFilters } from "@myakiba/contracts/orders/schema";
import type { Order, OrderItem, OrdersPage } from "@myakiba/contracts/orders/types";
import type { Page } from "@myakiba/contracts/shared/pagination";
import type { Command } from "../client";
import { ApiServerError } from "@/lib/errors/api-server-error";
import { collectionItem } from "../../../test/collection-item";
import { order as orderFixture, ordersPage } from "../../../test/order";

type Settle = (outcome: "ok" | "fail") => void;
const heldWrites: Settle[] = [];
const holdWrite = () =>
  new Promise((resolve) => {
    heldWrites.push((outcome) =>
      resolve(
        outcome === "ok"
          ? Result.ok(null)
          : Result.err(new ApiServerError({ status: 500, body: "offline", message: "offline" })),
      ),
    );
  });

const realOrders = await import("@/queries/orders");
await mock.module("@/queries/orders", () => ({
  ...realOrders,
  getOrders: () => new Promise(() => {}),
  getOrder: () => new Promise(() => {}),
  getOrderItems: () => new Promise(() => {}),
  editOrder: holdWrite,
  deleteOrderItem: holdWrite,
  fillOrderPaid: holdWrite,
}));
const realCollection = await import("@/queries/collection");
await mock.module("@/queries/collection", () => ({
  ...realCollection,
  updateCollectionItem: holdWrite,
}));
const {
  orders,
  editOrderCommand,
  editOrderItemCommand,
  deleteOrderItemCommand,
  setOrderPaidCommand,
} = await import("./orders");
const { useResourceMutation } = await import("../client");
const { OrderSummary } = await import("@/components/orders/order-summary");
const { createOrdersColumns } = await import("@/components/orders/orders-columns");
const { OrderPendingContext } = await import("@/components/orders/order-pending-context");

afterEach(async () => {
  await act(async () => {
    for (const settle of heldWrites.splice(0)) settle("ok");
  });
  cleanup();
});

const list: OrderFilters = { limit: 10, offset: 0 };

// One paid $1 item, one unpaid $20 item and $100 of unpaid shipping: Total $121, Unpaid Costs $120.
const partly: Order = {
  ...orderFixture,
  orderId: "o1",
  title: "AmiAmi preorder",
  paid: false,
  payment: "partly",
  shippingFee: 10_000,
  total: 12_100,
  unpaidCosts: 12_000,
  itemCount: 2,
};
const unpaidItem: OrderItem = collectionItem({
  id: "c-unpaid",
  orderId: "o1",
  status: "Ordered",
  paid: false,
  price: 2000,
});

function cacheWith(shown: Order) {
  const client = new QueryClient();
  client.setQueryData<Order>(orders.detail.key(shown.orderId), shown);
  client.setQueryData<OrdersPage>(orders.list.key(list), { ...ordersPage, items: [shown] });
  client.setQueryData<Page<OrderItem>>(
    ["orderItems", shown.orderId, { limit: 12, offset: 0, sort: "createdAt", order: "desc" }],
    { items: [unpaidItem], totalCount: 1 },
  );
  // The Order page and the Orders table are on screen, so their queries are active.
  for (const queryKey of [orders.detail.key(shown.orderId), orders.list.key(list)])
    new QueryObserver(client, {
      queryKey,
      queryFn: () => client.getQueryData(queryKey) ?? null,
      staleTime: Number.POSITIVE_INFINITY,
    }).subscribe(() => {});
  return client;
}

function startWrite<Input, Output, Failure extends Error>(
  client: QueryClient,
  command: Command<Input, Output, Failure>,
  input: Input,
) {
  const { result } = renderHook(() => useResourceMutation(command), {
    wrapper: ({ children }: { readonly children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  let saved: Promise<unknown> = Promise.resolve();
  act(() => {
    saved = result.current.run(input);
  });
  return saved;
}

const settled = async () => act(async () => {});

/** The Order page's Total and Unpaid Costs rows, as the cached Order draws them. */
function orderPage(client: QueryClient) {
  cleanup();
  render(
    <OrderSummary
      order={client.getQueryData<Order>(orders.detail.key("o1"))}
      isLoading={false}
      currency="USD"
      locale="en-US"
      dateFormat="MM/DD/YYYY"
    />,
  );
  const amountBeside = (label: string) =>
    screen.queryByText(label)?.nextElementSibling?.textContent ?? null;
  return { total: amountBeside("Total"), unpaidCosts: amountBeside("Unpaid Costs") };
}

const columns = createOrdersColumns({
  onEditOrder: async () => Result.ok(),
  onSetPaid: async () => Result.ok(),
  onDeleteOrders: async () => Result.ok(),
  onEditItem: async () => Result.ok(),
  onDeleteItem: async () => Result.ok(),
  currency: "USD",
  locale: "en-US",
  dateFormat: "MM/DD/YYYY",
});

function Cells({ row }: { readonly row: Order }) {
  const table = useReactTable({ data: [row], columns, getCoreRowModel: getCoreRowModel() });
  return table
    .getRowModel()
    .rows[0]?.getAllCells()
    .filter(({ column }) => column.id === "total" || column.id === "unpaidCosts")
    .map((cell) => (
      <div key={cell.id} data-testid={cell.column.id}>
        {flexRender(cell.column.columnDef.cell, cell.getContext())}
      </div>
    ));
}

/** The Orders table row's Total and Unpaid Costs cells, as the cached list draws them. */
function tableRow(client: QueryClient) {
  cleanup();
  const row = client.getQueryData<OrdersPage>(orders.list.key(list))?.items[0];
  if (!row) throw new Error("the list has no row");
  render(
    <QueryClientProvider client={client}>
      <OrderPendingContext
        value={{ isOrderPending: () => false, isCollectionItemPending: () => false }}
      >
        <Cells row={row} />
      </OrderPendingContext>
    </QueryClientProvider>,
  );
  const cell = (id: string) => within(screen.getByTestId(id)).queryByText(/\$/)?.textContent ?? "";
  return { total: cell("total"), unpaidCosts: cell("unpaidCosts") };
}

const freeShipping = () => ({
  orderId: partly.orderId,
  title: partly.title,
  shop: partly.shop,
  status: partly.status,
  paid: partly.paid,
  orderDate: partly.orderDate,
  releaseDate: partly.releaseDate,
  paymentDate: partly.paymentDate,
  shippingDate: partly.shippingDate,
  collectionDate: partly.collectionDate,
  shippingMethod: partly.shippingMethod,
  shippingFee: 0,
  taxes: partly.taxes,
  duties: partly.duties,
  tariffs: partly.tariffs,
  miscFees: partly.miscFees,
  notes: partly.notes,
});

test("a fee edit that is still saving draws the new Total on the Order page with no Unpaid Costs from before it", async () => {
  const client = cacheWith(partly);

  void startWrite(client, editOrderCommand, { values: freeShipping(), cascadeOptions: [], list });
  await settled();

  expect(orderPage(client)).toEqual({ total: "$21.00", unpaidCosts: null });
});

test("a fee edit that is still saving draws the new Total on the Orders table with no Unpaid Costs from before it", async () => {
  const client = cacheWith(partly);

  void startWrite(client, editOrderCommand, { values: freeShipping(), cascadeOptions: [], list });
  await settled();

  expect(tableRow(client)).toEqual({ total: "$21.00", unpaidCosts: "" });
});

test("a fee edit that fails puts the old Total and Unpaid Costs back together", async () => {
  const client = cacheWith(partly);

  const saved = startWrite(client, editOrderCommand, {
    values: freeShipping(),
    cascadeOptions: [],
    list,
  });
  await settled();
  await act(async () => {
    heldWrites.shift()?.("fail");
    await saved;
  });

  expect({ page: orderPage(client), table: tableRow(client) }).toEqual({
    page: { total: "$121.00", unpaidCosts: "$120.00" },
    table: { total: "$121.00", unpaidCosts: "$120.00" },
  });
});

test("an item price edit that is still saving draws its new Total with no Unpaid Costs from before it", async () => {
  const client = cacheWith(partly);

  void startWrite(client, editOrderItemCommand, { values: { ...unpaidItem, price: 5000 }, list });
  await settled();

  expect({ page: orderPage(client), table: tableRow(client) }).toEqual({
    page: { total: "$151.00", unpaidCosts: null },
    table: { total: "$151.00", unpaidCosts: "" },
  });
});

test("removing an item that is still saving draws the new Total with no Unpaid Costs from before it", async () => {
  const client = cacheWith(partly);

  void startWrite(client, deleteOrderItemCommand, { orderId: "o1", itemId: "c-unpaid", list });
  await settled();

  expect({ page: orderPage(client), table: tableRow(client) }).toEqual({
    page: { total: "$101.00", unpaidCosts: null },
    table: { total: "$101.00", unpaidCosts: "" },
  });
});

test("a Paid click that is still saving draws no Unpaid Costs from before it on the Orders table", async () => {
  const client = cacheWith(partly);

  void startWrite(client, setOrderPaidCommand, { orderId: "o1", paid: true, list });
  await settled();

  expect(tableRow(client)).toEqual({ total: "$121.00", unpaidCosts: "" });
});

test("unpaying a paid row that is still saving draws no Unpaid Costs until the refetch brings them", async () => {
  const client = cacheWith({ ...partly, paid: true, payment: "paid", unpaidCosts: 0 });

  void startWrite(client, setOrderPaidCommand, { orderId: "o1", paid: false, list });
  await settled();

  expect(tableRow(client)).toEqual({ total: "$121.00", unpaidCosts: "" });
});
