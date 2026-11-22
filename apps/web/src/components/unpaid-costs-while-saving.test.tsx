import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { cleanup, configure, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  orderEditSchema,
  searchSchema as ordersSearchSchema,
} from "@myakiba/contracts/orders/schema";
import type { Order, OrderItem } from "@myakiba/contracts/orders/types";
import { parseJson } from "@myakiba/utils/parse-json";
import { z } from "zod";
import OrdersDataGrid from "@/components/orders/orders-data-grid";
import { renderAppRoute, stubFetch } from "../../test/app-route";
import { collectionItem } from "../../test/collection-item";
import { order as orderFixture } from "../../test/order";

configure({ asyncUtilTimeout: 4000 });
setDefaultTimeout(30_000);

type User = ReturnType<typeof userEvent.setup>;
type Write = {
  readonly method: string;
  readonly path: string;
  readonly body: unknown;
  readonly settle: (outcome: "ok" | "fail") => void;
};

let queryClient = new QueryClient();

afterEach(async () => {
  server.releaseReads();
  for (const write of server.writes) write.settle("ok");
  await waitFor(() => expect(queryClient.isMutating()).toBe(0));
  cleanup();
  queryClient.clear();
  localStorage.clear();
});

// A $1 paid item, a $20 unpaid item and $100 of unpaid shipping: Total $121.00, Unpaid Costs $120.00.
const partly: Order = {
  ...orderFixture,
  orderId: "o1",
  title: "AmiAmi preorder",
  shop: "AmiAmi",
  paid: false,
  payment: "partly",
  shippingFee: 10_000,
  total: 12_100,
  unpaidCosts: 12_000,
  itemCount: 2,
};
// The same Order once its $100 of shipping is $0.
const freeShipping: Order = { ...partly, shippingFee: 0, total: 2100, unpaidCosts: 2000 };

const OLD = { total: "$121.00", unpaidCosts: "$120.00" };
const NEW = { total: "$21.00", unpaidCosts: "$20.00" };

function item(id: string, fields: Partial<OrderItem>): OrderItem {
  const {
    itemScale: _scale,
    createdAt: _created,
    updatedAt: _updated,
    ...rest
  } = collectionItem({ id, orderId: "o1", itemTitle: id, status: "Ordered", ...fields });
  return rest;
}

const Body = z.unknown();
const server = {
  orders: [partly] as Order[],
  items: [item("Miku", { paid: true, price: 100 }), item("Rin", { paid: false, price: 2000 })],
  writes: [] as Write[],
  /** The Orders the server holds once a write saves. */
  saved: [partly] as Order[],
  /** While set, the Orders list waits for `releaseReads`. */
  heldReads: null as PromiseWithResolvers<null> | null,
  holdReads() {
    this.heldReads = Promise.withResolvers<null>();
  },
  releaseReads() {
    this.heldReads?.resolve(null);
    this.heldReads = null;
  },
};

function serve() {
  stubFetch(async (request) => {
    const path = new URL(request.url).pathname;
    if (request.method === "GET") {
      if (path.endsWith("/items")) return Response.json({ items: server.items, totalCount: 2 });
      if (path.endsWith("/item-releases")) return Response.json([]);
      await server.heldReads?.promise;
      return Response.json({
        items: server.orders,
        totalCount: server.orders.length,
        totalSpent: 0,
        activeOrders: server.orders.length,
        unpaidCosts: server.orders.reduce((sum, row) => sum + row.unpaidCosts, 0),
      });
    }
    const text = await request.text();
    const body = text ? parseJson(Body, text).unwrap() : null;
    const edit = z.object({ order: z.unknown() }).safeParse(body);
    if (
      request.method === "PUT" &&
      edit.success &&
      !orderEditSchema.safeParse(edit.data.order).success
    )
      return new Response("Unrecognized key", { status: 422 });
    const { promise, resolve } = Promise.withResolvers<Response>();
    const write: Write = {
      method: request.method,
      path,
      body,
      settle: (outcome) => {
        if (outcome === "fail") return resolve(new Response("Write failed", { status: 500 }));
        server.orders = server.saved;
        resolve(Response.json("ok"));
      },
    };
    server.writes.push(write);
    return promise;
  });
}

function OrderPage() {
  return <Link to="/orders">Back to Orders</Link>;
}

async function renderOrders(url: string, orders: Order[] = [partly]): Promise<User> {
  localStorage.setItem("orders:viewMode", JSON.stringify("table"));
  server.orders = orders;
  server.saved = orders;
  server.writes = [];
  server.releaseReads();
  serve();
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  await renderAppRoute(
    url,
    [
      { path: "/orders", component: OrdersDataGrid, validateSearch: ordersSearchSchema },
      { path: "/orders/$id", component: OrderPage, validateSearch: () => ({}) },
    ],
    queryClient,
  );
  await screen.findByText("AmiAmi preorder");
  return userEvent.setup({ delay: null });
}

function rowOf(title: string): HTMLElement {
  const row = screen.getByText(title).closest("tr");
  if (!row) throw new Error(`no row for ${title}`);
  return row;
}

function cellOf(header: string, title = "AmiAmi preorder"): Element | undefined {
  const headers = [...document.querySelectorAll("thead th")].map((th) => th.textContent?.trim());
  return rowOf(title).children[headers.findIndex((text) => text?.startsWith(header))];
}

const cell = (header: string, title?: string) => cellOf(header, title)?.textContent ?? "";

/** The row's Total, and its Unpaid Costs: a column where the table has one, else the Total's second line. */
function totalCell(title = "AmiAmi preorder") {
  const total = cellOf("Total", title);
  const column = [...document.querySelectorAll("thead th")].some(
    (th) => th.textContent?.trim() === "Unpaid Costs",
  );
  const label = total ? within(total as HTMLElement).queryByText("Unpaid Costs") : null;
  return {
    total: total?.querySelector("button")?.textContent ?? "",
    unpaidCosts: column
      ? cell("Unpaid Costs", title)
      : (label?.nextElementSibling?.textContent ?? ""),
  };
}

const paidBox = () => screen.getByRole("checkbox", { name: "AmiAmi preorder paid" });

const shown = (title = "AmiAmi preorder") => totalCell(title);

/** Saves $0 shipping from the Total cell's Fees & Charges popover. */
async function freeTheShipping(user: User) {
  const writes = server.writes.length;
  server.saved = server.saved.map((row) => (row.orderId === "o1" ? freeShipping : row));
  await user.click(within(rowOf("AmiAmi preorder")).getByRole("button", { name: shown().total }));
  const shipping = await screen.findByLabelText("Shipping");
  await user.clear(shipping);
  await user.type(shipping, "0");
  await user.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(server.writes.length).toBe(writes + 1));
}

describe("a fee edit from the Total cell", () => {
  test.each([
    ["no filter", "/orders"],
    ["a shop filter", `/orders?shop=${encodeURIComponent('["AmiAmi"]')}`],
    ["a sort", "/orders?sort=title&order=asc"],
  ])(
    "on a list with %s draws the server's Total and Unpaid Costs, before and after it saves",
    async (_list, url) => {
      const user = await renderOrders(url);

      await freeTheShipping(user);
      const whileSaving = shown();
      server.writes[0]?.settle("ok");

      await waitFor(() => expect(shown()).toEqual(NEW));
      expect(whileSaving).toEqual(OLD);
    },
  );

  test("that fails leaves the old Total and Unpaid Costs together", async () => {
    const user = await renderOrders(`/orders?shop=${encodeURIComponent('["AmiAmi"]')}`);

    await freeTheShipping(user);
    server.writes[0]?.settle("fail");

    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    expect(shown()).toEqual(OLD);
  });

  test("saved while its page is closed draws the old pair on return until the server's row lands", async () => {
    const user = await renderOrders("/orders");

    await freeTheShipping(user);
    const [view] = within(rowOf("AmiAmi preorder")).getAllByRole("link", {
      name: "View AmiAmi preorder",
    });
    if (!view) throw new Error("no link to the Order");
    await user.click(view);
    await screen.findByText("Back to Orders");
    server.holdReads();
    server.writes[0]?.settle("ok");
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));

    await user.click(screen.getByText("Back to Orders"));
    await screen.findByText("AmiAmi preorder");
    const onReturn = shown();
    server.releaseReads();

    await waitFor(() => expect(shown()).toEqual(NEW));
    expect(onReturn).toEqual(OLD);
  });

  test("followed by another Order's title edit during its refetch keeps its own pair together", async () => {
    const other: Order = { ...partly, orderId: "o2", title: "HLJ preorder", shop: "HLJ" };
    const user = await renderOrders("/orders", [partly, other]);

    await freeTheShipping(user);
    server.holdReads();
    server.writes[0]?.settle("ok");
    await waitFor(() => expect(queryClient.isFetching()).toBeGreaterThan(0));
    await user.click(screen.getByRole("button", { name: "HLJ preorder, edit Order title" }));
    const title = screen.getByRole("textbox", { name: "Order title" });
    await user.clear(title);
    await user.type(title, "HLJ order{Enter}");
    await waitFor(() => expect(server.writes.length).toBe(2));
    const duringBoth = shown();
    server.releaseReads();
    server.writes[1]?.settle("ok");

    await waitFor(() => expect(shown()).toEqual(NEW));
    expect(duringBoth).toEqual(OLD);
  });
});

test("a fee edit with the fee columns shown keeps Shipping, Total and Unpaid Costs from one server row", async () => {
  localStorage.setItem("orders:columnVisibility", JSON.stringify({ shippingFee: true }));
  const user = await renderOrders("/orders");

  await freeTheShipping(user);
  const whileSaving = { shipping: cell("Shipping Fee"), ...shown() };
  server.writes[0]?.settle("ok");

  await waitFor(() =>
    expect({ shipping: cell("Shipping Fee"), ...shown() }).toEqual({ shipping: "$0.00", ...NEW }),
  );
  expect(whileSaving).toEqual({ shipping: "$100.00", ...OLD });
});

test("a title edit made while a fee edit still saves sends only Order fields and saves", async () => {
  const user = await renderOrders("/orders");
  await freeTheShipping(user);
  server.saved = [{ ...freeShipping, title: "HLJ preorder" }];

  await user.click(screen.getByRole("button", { name: /edit Order title$/ }));
  const title = screen.getByRole("textbox", { name: "Order title" });
  await user.clear(title);
  await user.type(title, "HLJ preorder{Enter}");
  await waitFor(() => expect(server.writes.length).toBe(2));
  for (const write of server.writes) write.settle("ok");

  await waitFor(() => expect(queryClient.isMutating()).toBe(0));
  await waitFor(() => expect(shown("HLJ preorder")).toEqual(NEW));
  const body = z.object({ order: z.unknown() }).parse(server.writes[1]?.body);
  expect(orderEditSchema.safeParse(body.order).success).toBe(true);
});

test("a Paid click on a Partly paid row draws its Total and no Unpaid Costs while it saves", async () => {
  const user = await renderOrders("/orders");
  server.saved = [{ ...partly, paid: true, payment: "paid", unpaidCosts: 0 }];

  await user.click(paidBox());
  await waitFor(() => expect(server.writes.length).toBe(1));
  const whileSaving = { paid: paidBox().getAttribute("aria-checked"), ...shown() };
  server.writes[0]?.settle("ok");

  await waitFor(() => expect(queryClient.isMutating()).toBe(0));
  expect({
    whileSaving,
    after: { paid: paidBox().getAttribute("aria-checked"), ...shown() },
  }).toEqual({
    whileSaving: { paid: "true", total: "$121.00", unpaidCosts: "" },
    after: { paid: "true", total: "$121.00", unpaidCosts: "" },
  });
});

test("a second Paid click while the first saves does nothing, so the row never reads unchecked beside the old amount", async () => {
  const user = await renderOrders("/orders");
  server.saved = [{ ...partly, paid: true, payment: "paid", unpaidCosts: 0 }];

  await user.click(paidBox());
  await waitFor(() => expect(server.writes.length).toBe(1));
  server.holdReads();
  server.writes[0]?.settle("ok");
  await waitFor(() => expect(queryClient.isFetching()).toBeGreaterThan(0));
  await user.click(paidBox());
  const afterSecondClick = {
    writes: server.writes.length,
    paid: paidBox().getAttribute("aria-checked"),
    ...shown(),
  };
  server.releaseReads();
  for (const write of server.writes.slice(1)) write.settle("ok");

  await waitFor(() => expect(queryClient.isMutating()).toBe(0));
  expect({
    afterSecondClick,
    after: { paid: paidBox().getAttribute("aria-checked"), ...shown() },
  }).toEqual({
    afterSecondClick: { writes: 1, paid: "true", total: "$121.00", unpaidCosts: "" },
    after: { paid: "true", total: "$121.00", unpaidCosts: "" },
  });
});

test("unpaying a paid row leaves its checkbox and payment to the server's row, and takes no second click", async () => {
  const paid: Order = { ...partly, paid: true, payment: "paid", unpaidCosts: 0 };
  const user = await renderOrders("/orders", [paid]);
  server.saved = [{ ...partly, paid: false, payment: "unpaid", unpaidCosts: 12_100 }];

  await user.click(paidBox());
  await waitFor(() => expect(server.writes.length).toBe(1));
  const whileSaving = {
    paid: paidBox().getAttribute("aria-checked"),
    saving: paidBox().getAttribute("aria-disabled") === "true",
    ...shown(),
  };
  server.writes[0]?.settle("ok");

  await waitFor(() => expect(paidBox().getAttribute("aria-checked")).toBe("false"));
  expect({ whileSaving, after: shown() }).toEqual({
    whileSaving: { paid: "true", saving: true, total: "$121.00", unpaidCosts: "" },
    after: { total: "$121.00", unpaidCosts: "" },
  });
});

test("a Paid tick, another Order's title edit during its refetch, then a second click never draws the row unchecked beside its old Unpaid Costs", async () => {
  const other: Order = { ...partly, orderId: "o2", title: "HLJ preorder", shop: "HLJ" };
  const user = await renderOrders("/orders", [partly, other]);
  server.saved = [{ ...partly, paid: true, payment: "paid", unpaidCosts: 0 }, other];

  await user.click(paidBox());
  await waitFor(() => expect(server.writes.length).toBe(1));
  server.holdReads();
  server.writes[0]?.settle("ok");
  await waitFor(() => expect(queryClient.isFetching()).toBeGreaterThan(0));
  await user.click(screen.getByRole("button", { name: "HLJ preorder, edit Order title" }));
  const title = screen.getByRole("textbox", { name: "Order title" });
  await user.clear(title);
  await user.type(title, "HLJ order{Enter}");
  await waitFor(() => expect(server.writes.length).toBe(2));
  await user.click(paidBox());
  const afterSecondClick = { paid: paidBox().getAttribute("aria-checked"), ...shown() };
  server.releaseReads();
  for (const write of server.writes.slice(1)) write.settle("ok");

  await waitFor(() => expect(queryClient.isMutating()).toBe(0));
  expect(afterSecondClick).toEqual({ paid: "true", total: "$121.00", unpaidCosts: "" });
});

test("paying the only unpaid item in an expanded row keeps the row's pair until the server's row lands", async () => {
  const user = await renderOrders("/orders");
  server.saved = [{ ...partly, unpaidCosts: 10_000 }];

  await user.click(screen.getByRole("button", { name: /2\s*items/ }));
  await user.click(await screen.findByRole("checkbox", { name: "Rin paid" }));
  await waitFor(() => expect(server.writes.length).toBe(1));
  const whileSaving = shown();
  const itemWhileSaving = screen
    .getByRole("checkbox", { name: "Rin paid" })
    .getAttribute("aria-checked");
  server.writes[0]?.settle("ok");

  await waitFor(() => expect(shown()).toEqual({ total: "$121.00", unpaidCosts: "$100.00" }));
  expect({ whileSaving, itemWhileSaving }).toEqual({ whileSaving: OLD, itemWhileSaving: "true" });
});

test("a negative fee draws the row's Total and no Unpaid Costs", async () => {
  await renderOrders("/orders", [
    { ...partly, shippingFee: -10_000, total: -7900, unpaidCosts: -8000 },
  ]);

  expect(shown()).toEqual({ total: "-$79.00", unpaidCosts: "" });
});
