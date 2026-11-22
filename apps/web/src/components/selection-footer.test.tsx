import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { cleanup, configure, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient } from "@tanstack/react-query";
import { collectionSearchSchema } from "@myakiba/contracts/collection/schema";
import { searchSchema as ordersSearchSchema } from "@myakiba/contracts/orders/schema";
import type { OrderItem } from "@myakiba/contracts/orders/types";
import { CollectionDataGrid } from "@/components/collection/collection-data-grid";
import OrdersDataGrid from "@/components/orders/orders-data-grid";
import { renderAppRoute, stubFetch } from "../../test/app-route";
import { collectionItem } from "../../test/collection-item";
import { order } from "../../test/order";

configure({ asyncUtilTimeout: 4000 });
setDefaultTimeout(30_000);

let queryClient = new QueryClient();

afterEach(() => {
  cleanup();
  queryClient.clear();
  localStorage.clear();
});

function page<T>(rows: readonly T[], url: URL) {
  const offset = Number(url.searchParams.get("offset") ?? 0);
  const limit = Number(url.searchParams.get("limit") ?? rows.length);
  return { items: rows.slice(offset, offset + limit), totalCount: rows.length };
}

async function renderPage(url: string) {
  localStorage.setItem("collection:viewMode", JSON.stringify("table"));
  localStorage.setItem("orders:viewMode", JSON.stringify("table"));
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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

const ids = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, index) => `${prefix}-${String(index).padStart(2, "0")}`);

const rowOf = (title: string) => {
  const row = screen.getByText(title).closest("tr");
  if (!row) throw new Error(`no row holds ${title}`);
  return row;
};

async function select(user: ReturnType<typeof userEvent.setup>, ...titles: string[]) {
  for (const title of titles) {
    await user.click(within(rowOf(title)).getByRole("checkbox", { name: "Select row" }));
  }
}

const actionBar = () => screen.getByRole("toolbar").textContent ?? "";
const itemsFooter = () =>
  screen.queryByText((_, element) => /^\d+ of \d+ selected$/.test(element?.textContent ?? ""), {
    selector: "span",
  })?.textContent;

describe("the selection footer counts every selected row, not only the page's", () => {
  test("on the Collection page", async () => {
    const rows = ids("co", 30).map((id) => collectionItem({ id, itemTitle: id }));
    stubFetch((request) =>
      Response.json({
        ...page(rows, new URL(request.url)),
        totalValue: 0,
        totalItemsThisMonth: 0,
      }),
    );
    const user = await renderPage("/collection");
    await screen.findByText("co-00");
    await select(user, "co-00", "co-01", "co-02");
    expect(actionBar()).toContain("3 items selected");
    expect(screen.getByText(/row\(s\) selected/).textContent).toBe("3 of 30 row(s) selected");

    await user.click(screen.getByRole("button", { name: "Go to next page" }));
    await screen.findByText("co-24");
    expect(actionBar()).toContain("3 items selected");
    expect(screen.getByText(/row\(s\) selected/).textContent).toBe("3 of 30 row(s) selected");
  });

  test("on the Orders page", async () => {
    const rows = ids("od", 30).map((orderId) => ({ ...order, orderId, title: orderId }));
    stubFetch((request) =>
      Response.json({
        ...page(rows, new URL(request.url)),
        totalSpent: 0,
        activeOrders: rows.length,
        unpaidCosts: 0,
      }),
    );
    const user = await renderPage("/orders");
    await screen.findByText("od-00");
    await select(user, "od-00", "od-01", "od-02");
    expect(actionBar()).toContain("3 orders selected");
    expect(screen.getByText(/row\(s\) selected/).textContent).toBe("3 of 30 row(s) selected");

    await user.click(screen.getByRole("button", { name: "Go to next page" }));
    await screen.findByText("od-24");
    expect(actionBar()).toContain("3 orders selected");
    expect(screen.getByText(/row\(s\) selected/).textContent).toBe("3 of 30 row(s) selected");
  });

  test("in an Order's items", async () => {
    const items = ids("co", 14).map((id): OrderItem => {
      const {
        itemScale: _scale,
        createdAt: _created,
        updatedAt: _updated,
        ...item
      } = collectionItem({ id, orderId: "od-alpha", itemTitle: id, status: "Ordered" });
      return item;
    });
    stubFetch((request) => {
      const url = new URL(request.url);
      if (url.pathname === "/api/orders/od-alpha/items") return Response.json(page(items, url));
      return Response.json({
        items: [{ ...order, orderId: "od-alpha", title: "Alpha", itemCount: items.length }],
        totalCount: 1,
        totalSpent: 0,
        activeOrders: 1,
        unpaidCosts: 0,
      });
    });
    const user = await renderPage("/orders");
    await screen.findByText("Alpha");
    await user.click(within(rowOf("Alpha")).getByRole("button", { name: "Expand row" }));
    await screen.findByText("co-00");
    await select(user, "co-00", "co-01", "co-02");
    expect(actionBar()).toContain("3 items selected");
    expect(itemsFooter()).toBe("3 of 14 selected");

    const [itemsNextPage] = screen.getAllByRole("button", { name: "Go to next page" });
    if (!itemsNextPage) throw new Error("the Order's items have no next page button");
    await user.click(itemsNextPage);
    await screen.findByText("co-12");
    expect(actionBar()).toContain("3 items selected");
    expect(itemsFooter()).toBe("3 of 14 selected");
  });
});
