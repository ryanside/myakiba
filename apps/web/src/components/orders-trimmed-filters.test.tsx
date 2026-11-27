import { afterEach, expect, setDefaultTimeout, test } from "bun:test";
import { cleanup, configure, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient } from "@tanstack/react-query";
import OrdersDataGrid from "@/components/orders/orders-data-grid";
import { Route } from "@/routes/(app)/orders";
import { renderAppRoute, stubFetch } from "../../test/app-route";
import { order, ordersPage } from "../../test/order";

configure({ asyncUtilTimeout: 4000 });
setDefaultTimeout(30_000);

const CUT_FILTERS = [
  "Unpaid Costs Range",
  "Order Spend Range",
  "Taxes Range",
  "Duties Range",
  "Tariffs Range",
  "Misc Fees Range",
];
const CUT_SORTS = ["Taxes", "Duties", "Tariffs", "Misc Fees"];

let queryClient = new QueryClient();

afterEach(() => {
  cleanup();
  queryClient.clear();
  localStorage.clear();
});

async function renderOrders(url: string) {
  const listQueries: URLSearchParams[] = [];
  const writes: string[] = [];
  stubFetch((request) => {
    const { pathname, searchParams } = new URL(request.url);
    if (request.method !== "GET") {
      writes.push(`${request.method} ${pathname}`);
      return new Promise<Response>(() => {});
    }
    if (pathname === "/api/orders") listQueries.push(searchParams);
    return Response.json({
      ...ordersPage,
      items: [{ ...order, orderId: "od-ami", title: "AmiAmi preorder", tariffs: 500 }],
    });
  });
  localStorage.setItem("orders:viewMode", JSON.stringify("table"));
  localStorage.setItem("orders:columnVisibility", JSON.stringify({ tariffs: true }));
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = await renderAppRoute(
    url,
    [
      {
        path: "/orders",
        component: OrdersDataGrid,
        validateSearch: Route.options.validateSearch,
        search: Route.options.search,
      },
    ],
    queryClient,
  );
  await screen.findByText("AmiAmi preorder");
  return { router, listQueries, writes, user: userEvent.setup({ delay: null }) };
}

const resetShown = () => screen.queryAllByRole("button", { name: "Reset Filters" }).length > 0;

test.each(["tariffsMin=100", "unpaidCostsMin=1", "orderSpendMax=0", "sort=taxes&order=asc"])(
  "a bookmark holding only %s loads the default list, unfiltered, and drops it from the URL",
  async (query) => {
    const { router, listQueries } = await renderOrders(`/orders?${query}`);
    await waitFor(() => expect(router.state.location.searchStr).toBe(""));
    const sent = listQueries.at(-1);

    expect({
      search: router.state.location.search,
      reset: resetShown(),
      sent: [...(sent?.keys() ?? [])].toSorted(),
      sort: sent?.get("sort"),
      order: sent?.get("order"),
    }).toEqual({
      search: {},
      reset: false,
      sent: ["limit", "offset", "order", "sort"],
      sort: "createdAt",
      order: "desc",
    });
  },
);

test("a bookmark that mixes cut keys with a kept filter keeps only the kept filter", async () => {
  const { router, listQueries } = await renderOrders(
    "/orders?sort=tariffs&order=asc&tariffsMin=100&unpaidCostsMin=1&status=%5B%22Ordered%22%5D",
  );
  await waitFor(() => expect(router.state.location.search).toEqual({ status: ["Ordered"] }));
  const sent = listQueries.at(-1);

  expect({
    reset: resetShown(),
    sort: sent?.get("sort"),
    order: sent?.get("order"),
    status: sent?.get("status"),
    cut: ["tariffsMin", "unpaidCostsMin"].filter((key) => sent?.has(key)),
  }).toEqual({ reset: true, sort: "createdAt", order: "desc", status: "Ordered", cut: [] });
});

test("on a bookmark holding only a cut filter, marking an Order paid shows at once, as on an unfiltered list", async () => {
  const { user, writes } = await renderOrders("/orders?tariffsMin=100");
  const paid = screen.getByRole("checkbox", { name: "AmiAmi preorder paid" });
  await user.click(paid);
  await waitFor(() => expect(writes.length).toBe(1));

  await waitFor(() => expect(paid.getAttribute("aria-checked")).toBe("true"));
});

test("the Filters dialog keeps Status, Paid, Shipping, Shop, the dates and Total, and none of the cut ranges", async () => {
  const { user } = await renderOrders("/orders");
  await user.click(screen.getByRole("button", { name: "Filters" }));
  const dialog = await screen.findByRole("dialog");
  const has = (text: string) => within(dialog).queryAllByText(text).length > 0;

  expect({
    kept: [
      "Status",
      "Paid",
      "Shipping Method",
      "Shop",
      "Release Date",
      "Order Date",
      "Payment Date",
      "Shipping Date",
      "Collection Date",
      "Total Range",
      "Shipping Fee Range",
    ].filter((title) => !has(title)),
    cut: CUT_FILTERS.filter(has),
  }).toEqual({ kept: [], cut: [] });
});

test("the Sort menu offers no sort for a cut fee and keeps Shipping Fee", async () => {
  const { user } = await renderOrders("/orders");
  const sort = screen.getAllByRole("combobox").find((box) => box.textContent === "Sort");
  if (!sort) throw new Error("The toolbar has no Sort control");
  await user.click(sort);
  const shown = await screen.findAllByRole("option");
  const options = new Set(shown.map((option) => option.textContent));

  expect({
    shippingFee: options.has("Shipping Fee"),
    cut: CUT_SORTS.filter((label) => options.has(label)),
  }).toEqual({ shippingFee: true, cut: [] });
});

test("a cut fee's column header offers no sort, and Total's still does", async () => {
  const { user } = await renderOrders("/orders");
  const header = (title: string) =>
    within(screen.getByRole("table")).getByRole("button", { name: new RegExp(`^${title}`) });
  const offersSort = async (title: string) => {
    await user.click(header(title));
    const menu = await screen.findByRole("menu");
    const sorts = within(menu).queryAllByText("Asc").length > 0;
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryAllByRole("menu").length).toBe(0));
    return sorts;
  };

  expect({ tariffs: await offersSort("Tariffs"), total: await offersSort("Total") }).toEqual({
    tariffs: false,
    total: true,
  });
});
