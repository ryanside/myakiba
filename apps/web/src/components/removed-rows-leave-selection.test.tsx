import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { cleanup, configure, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient } from "@tanstack/react-query";
import { parseJson } from "@myakiba/utils/parse-json";
import { z } from "zod";
import { collectionSearchSchema } from "@myakiba/contracts/collection/schema";
import { searchSchema as ordersSearchSchema } from "@myakiba/contracts/orders/schema";
import type { Order, OrderItem } from "@myakiba/contracts/orders/types";
import { CollectionDataGrid } from "@/components/collection/collection-data-grid";
import OrdersDataGrid from "@/components/orders/orders-data-grid";
import { renderAppRoute, stubFetch } from "../../test/app-route";
import { collectionItem } from "../../test/collection-item";
import { order } from "../../test/order";

configure({ asyncUtilTimeout: 4000 });
setDefaultTimeout(30_000);

type User = ReturnType<typeof userEvent.setup>;
const RemovedIds = z.object({
  ids: z.array(z.string()).optional(),
  orderIds: z.array(z.string()).optional(),
  collectionIds: z.array(z.string()).optional(),
});
type Write = {
  readonly method: string;
  readonly path: string;
  readonly body: z.infer<typeof RemovedIds> | null;
};

let queryClient = new QueryClient();

afterEach(() => {
  cleanup();
  queryClient.clear();
  localStorage.clear();
});

/** Answers reads from `read` and records every write, applying it with `apply` unless writes fail. */
function serve(read: (path: string) => object, apply: (write: Write) => void) {
  const server = { writes: [] as Write[], failWrites: false };
  stubFetch(async (request) => {
    const path = new URL(request.url).pathname;
    if (request.method === "GET") return Response.json(read(path));
    const text = await request.text();
    const body = text ? parseJson(RemovedIds, text).unwrap() : null;
    const write = { method: request.method, path, body };
    server.writes.push(write);
    if (server.failWrites) return new Response("Write failed", { status: 500 });
    apply(write);
    return Response.json("ok");
  });
  return server;
}

async function renderPage(url: string) {
  localStorage.setItem("collection:viewMode", JSON.stringify("table"));
  localStorage.setItem("orders:viewMode", JSON.stringify("table"));
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  await renderAppRoute(
    url,
    [
      {
        path: "/collection",
        component: CollectionDataGrid,
        validateSearch: collectionSearchSchema,
      },
      { path: "/orders", component: OrdersDataGrid, validateSearch: ordersSearchSchema },
    ],
    queryClient,
  );
  return userEvent.setup({ delay: null });
}

function around(element: Element, selector: string): HTMLElement {
  const found = element.closest<HTMLElement>(selector);
  if (!found) throw new Error(`nothing matches ${selector} around "${element.textContent}"`);
  return found;
}

const row = (title: string) => around(screen.getByText(title), "tr");
const isShown = (title: string) => screen.queryAllByText(title).length > 0;
const selection = () => document.querySelector('[role="toolbar"]')?.textContent ?? "";

async function chooseFromRowMenu(user: User, title: string, action: string) {
  await user.click(within(row(title)).getByRole("button", { name: "Open menu" }));
  await user.click(await screen.findByText(action));
}

async function chooseFromActionBar(user: User, action: string) {
  await user.click(within(screen.getByRole("toolbar")).getByText(action));
}

async function confirm(user: User, title: string, label: string) {
  const heading = await screen.findByText(title);
  const dialog = around(heading, '[role="dialog"]');
  await user.click(within(dialog).getByRole("button", { name: label }));
}

async function select(user: User, ...titles: string[]) {
  for (const title of titles) {
    await user.click(within(row(title)).getByRole("checkbox", { name: "Select row" }));
  }
}

describe("the Collection page", () => {
  async function selectTwoThenDeleteOneFromItsMenu(failWrites: boolean) {
    let rows = ["co-miku", "co-rin", "co-len"].map((id) => collectionItem({ id, itemTitle: id }));
    const server = serve(
      () => ({ items: rows, totalCount: rows.length, totalValue: 0, totalItemsThisMonth: 0 }),
      ({ body }) => {
        const ids = body?.ids ?? [];
        rows = rows.filter((item) => !ids.includes(item.id));
      },
    );
    server.failWrites = failWrites;
    const user = await renderPage("/collection");
    await screen.findByText("co-len");
    await select(user, "co-miku", "co-rin");
    expect(selection()).toContain("2 items selected");

    await chooseFromRowMenu(user, "co-rin", "Delete item");
    await confirm(user, "Delete item?", "Delete");
    await waitFor(() => expect(server.writes).toHaveLength(1));
    return { server, user };
  }

  test("drops a row deleted from its row menu and keeps the other selected row", async () => {
    const { server, user } = await selectTwoThenDeleteOneFromItsMenu(false);
    await waitFor(() => expect(isShown("co-rin")).toBe(false));
    expect(selection()).toContain("1 item selected");

    await chooseFromActionBar(user, "Delete");
    await confirm(user, "Delete 1 item?", "Delete");
    await waitFor(() => expect(server.writes).toHaveLength(2));
    expect(server.writes[1]).toEqual({
      method: "DELETE",
      path: "/api/collection",
      body: { ids: ["co-miku"] },
    });
  });

  test("keeps both rows selected when the row menu delete fails", async () => {
    await selectTwoThenDeleteOneFromItsMenu(true);
    const dialog = around(screen.getByText("Delete item?"), '[role="dialog"]');
    await waitFor(() =>
      expect(dialog.querySelector<HTMLElement>("[data-status]")?.dataset.status).toBe("idle"),
    );
    expect(isShown("co-rin")).toBe(true);
    expect(selection()).toContain("2 items selected");
  });
});

describe("the Orders page", () => {
  const orderRow = (orderId: string, title: string): Order => ({
    ...order,
    orderId,
    title,
    itemCount: 2,
  });
  const orderItem = (id: string, orderId: string): OrderItem => {
    const {
      itemScale: _scale,
      createdAt: _created,
      updatedAt: _updated,
      ...item
    } = collectionItem({ id, orderId, itemTitle: id, status: "Ordered" });
    return item;
  };

  function serveOrders() {
    const state = {
      orders: [orderRow("od-alpha", "Alpha"), orderRow("od-bravo", "Bravo")],
      items: [
        orderItem("co-miku", "od-alpha"),
        orderItem("co-rin", "od-alpha"),
        orderItem("co-len", "od-bravo"),
        orderItem("co-luka", "od-bravo"),
      ],
    };
    const server = serve(
      (path) => {
        const orderId = /^\/api\/orders\/([^/]+)\/items$/.exec(path)?.[1];
        if (orderId) {
          const items = state.items.filter((item) => item.orderId === orderId);
          return { items, totalCount: items.length };
        }
        return {
          items: state.orders,
          totalCount: state.orders.length,
          totalSpent: 0,
          activeOrders: state.orders.length,
          unpaidCosts: 0,
        };
      },
      ({ path, body }) => {
        const removedItem = /^\/api\/orders\/[^/]+\/items\/([^/]+)$/.exec(path)?.[1];
        const orderIds = body?.orderIds ?? [];
        const collectionIds = body?.collectionIds ?? [];
        state.orders = state.orders.filter((o) => !orderIds.includes(o.orderId));
        state.items = state.items.filter(
          (item) =>
            item.id !== removedItem &&
            !collectionIds.includes(item.id) &&
            !orderIds.includes(item.orderId ?? ""),
        );
      },
    );
    return server;
  }

  async function expand(user: User, title: string) {
    await user.click(within(row(title)).getByRole("button", { name: "Expand row" }));
  }

  test("drops an Order Item removed from its row menu and keeps the other selected item", async () => {
    const server = serveOrders();
    const user = await renderPage("/orders");
    await screen.findByText("Alpha");
    await expand(user, "Alpha");
    await screen.findByText("co-rin");
    await select(user, "co-miku", "co-rin");
    expect(selection()).toContain("2 items selected");

    await chooseFromRowMenu(user, "co-rin", "Remove item");
    await confirm(user, "Remove item?", "Remove");
    await waitFor(() => expect(server.writes).toHaveLength(1));
    await waitFor(() => expect(isShown("co-rin")).toBe(false));
    expect(selection()).toContain("1 item selected");

    await chooseFromActionBar(user, "Delete Items");
    await confirm(user, "Delete 1 item?", "Delete");
    await waitFor(() => expect(server.writes).toHaveLength(2));
    expect(server.writes[1]).toEqual({
      method: "DELETE",
      path: "/api/orders/items",
      body: { collectionIds: ["co-miku"] },
    });
  });

  test("drops an Order deleted from its card menu and its selected items and keeps another Order's", async () => {
    const server = serveOrders();
    const user = await renderPage("/orders");
    await screen.findByText("Alpha");
    await expand(user, "Alpha");
    await expand(user, "Bravo");
    await screen.findByText("co-luka");
    await select(user, "Alpha", "Bravo", "co-miku", "co-len");
    expect(selection()).toContain("2 orders, 2 items selected");

    await user.click(screen.getByRole("button", { name: "Grid view" }));
    const alphaCard = around(
      screen.getByRole("checkbox", { name: "Deselect Alpha" }),
      '[data-slot="item-controls"]',
    );
    await user.click(within(alphaCard).getByRole("button", { name: "Open menu" }));
    await user.click(await screen.findByText("Delete order"));
    await confirm(user, "Delete order?", "Delete");
    await waitFor(() => expect(server.writes).toHaveLength(1));
    await waitFor(() => expect(isShown("Alpha")).toBe(false));
    expect(selection()).toContain("1 order, 1 item selected");

    await chooseFromActionBar(user, "Delete Orders");
    await confirm(user, "Delete 1 order?", "Delete");
    await waitFor(() => expect(server.writes).toHaveLength(2));
    expect(server.writes[1]).toEqual({
      method: "DELETE",
      path: "/api/orders",
      body: { orderIds: ["od-bravo"] },
    });
  });
});
