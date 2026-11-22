import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { cleanup, configure, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient } from "@tanstack/react-query";
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
  /** What the server holds once a write saves. */
  afterWrite: (_write: Write) => {},
};

function serve() {
  stubFetch(async (request) => {
    const path = new URL(request.url).pathname;
    if (request.method === "GET") {
      if (path.endsWith("/items")) return Response.json({ items: server.items, totalCount: 2 });
      if (path.endsWith("/item-releases")) return Response.json([]);
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
    const { promise, resolve } = Promise.withResolvers<Response>();
    const write: Write = {
      method: request.method,
      path,
      body,
      settle: (outcome) => {
        if (outcome === "fail") return resolve(new Response("Write failed", { status: 500 }));
        server.afterWrite(write);
        resolve(Response.json("ok"));
      },
    };
    server.writes.push(write);
    return promise;
  });
}

async function renderOrders(url: string, orders: Order[] = [partly]): Promise<User> {
  localStorage.setItem("orders:viewMode", JSON.stringify("table"));
  server.orders = orders;
  server.writes = [];
  server.afterWrite = () => {};
  serve();
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  await renderAppRoute(
    url,
    [{ path: "/orders", component: OrdersDataGrid, validateSearch: ordersSearchSchema }],
    queryClient,
  );
  await screen.findByText("AmiAmi preorder");
  return userEvent.setup({ delay: null });
}

function cell(header: string, title = "AmiAmi preorder"): string {
  const headers = [...document.querySelectorAll("thead th")].map((th) => th.textContent?.trim());
  const row = screen.getByText(title).closest("tr");
  return row?.children[headers.findIndex((text) => text?.startsWith(header))]?.textContent ?? "";
}

const shown = () => ({ total: cell("Total"), unpaidCosts: cell("Unpaid Costs") });

async function editShipping(user: User, dollars: string) {
  await user.click(screen.getByRole("button", { name: cell("Total") }));
  const shipping = await screen.findByLabelText("Shipping");
  await user.clear(shipping);
  await user.type(shipping, dollars);
  await user.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(server.writes.length).toBeGreaterThan(0));
}

describe("a fee edit from the Total cell", () => {
  test.each([
    ["a shop filter", `/orders?shop=${encodeURIComponent('["AmiAmi"]')}`],
    ["a sort", "/orders?sort=title&order=asc"],
    ["no filter", "/orders"],
  ])(
    "on a list with %s draws no Unpaid Costs beside its new Total while it saves",
    async (_list, url) => {
      const user = await renderOrders(url);
      expect(shown()).toEqual({ total: "$121.00", unpaidCosts: "$120.00" });

      await editShipping(user, "0");

      expect(shown()).toEqual({ total: "$21.00", unpaidCosts: "" });
    },
  );

  test("that fails puts the old Total and Unpaid Costs back together", async () => {
    const user = await renderOrders(`/orders?shop=${encodeURIComponent('["AmiAmi"]')}`);

    await editShipping(user, "0");
    server.writes[0]?.settle("fail");

    await waitFor(() => expect(shown()).toEqual({ total: "$121.00", unpaidCosts: "$120.00" }));
  });

  test("that saves while the list's filter drops the row leaves nothing held once the filter is cleared", async () => {
    const user = await renderOrders("/orders?unpaidCostsMin=10000");
    server.afterWrite = () => {
      server.orders = [];
    };

    await editShipping(user, "0");
    server.writes[0]?.settle("ok");
    await waitFor(() => expect(screen.queryByText("AmiAmi preorder")).toBeNull());

    server.orders = [{ ...partly, shippingFee: 0, total: 2100, unpaidCosts: 2000 }];
    await user.click(screen.getByRole("button", { name: "Reset Filters" }));
    await waitFor(() => expect(shown()).toEqual({ total: "$21.00", unpaidCosts: "$20.00" }));
  });
});

test("a title edit made while a fee edit still saves sends only Order fields and saves", async () => {
  const user = await renderOrders("/orders");
  await editShipping(user, "0");

  await user.click(screen.getByRole("button", { name: /edit Order title$/ }));
  const title = screen.getByRole("textbox", { name: "Order title" });
  await user.clear(title);
  await user.type(title, "HLJ preorder{Enter}");
  await waitFor(() => expect(server.writes.length).toBe(2));

  const body = z.object({ order: z.unknown() }).parse(server.writes[1]?.body);
  expect(orderEditSchema.safeParse(body.order).success).toBe(true);
});

test("a Paid click on a Partly paid row draws no Unpaid Costs until the refetch brings them", async () => {
  const user = await renderOrders("/orders");
  server.afterWrite = () => {
    server.orders = [{ ...partly, paid: true, payment: "paid", unpaidCosts: 0 }];
  };

  await user.click(screen.getByRole("checkbox", { name: "AmiAmi preorder paid" }));
  await waitFor(() => expect(server.writes.length).toBe(1));
  const whileSaving = shown();
  server.writes[0]?.settle("ok");

  await waitFor(() => expect(shown()).toEqual({ total: "$121.00", unpaidCosts: "" }));
  expect(whileSaving).toEqual({ total: "$121.00", unpaidCosts: "" });
});

test("unpaying a paid row draws its whole Total as Unpaid Costs once the refetch lands", async () => {
  const paid = { ...partly, paid: true, payment: "paid" as const, unpaidCosts: 0 };
  const user = await renderOrders("/orders", [paid]);
  expect(shown()).toEqual({ total: "$121.00", unpaidCosts: "" });
  server.afterWrite = () => {
    server.orders = [{ ...partly, paid: false, payment: "unpaid", unpaidCosts: 12_100 }];
  };

  await user.click(screen.getByRole("checkbox", { name: "AmiAmi preorder paid" }));
  await waitFor(() => expect(server.writes.length).toBe(1));
  server.writes[0]?.settle("ok");

  await waitFor(() => expect(shown()).toEqual({ total: "$121.00", unpaidCosts: "$121.00" }));
});

test("paying the only unpaid item in an expanded row draws no Unpaid Costs on the row while it saves", async () => {
  const user = await renderOrders("/orders");

  await user.click(screen.getByRole("button", { name: /2\s*items/ }));
  await user.click(await screen.findByRole("checkbox", { name: "Rin paid" }));
  await waitFor(() => expect(server.writes.length).toBe(1));

  expect(shown()).toEqual({ total: "$121.00", unpaidCosts: "" });
});
