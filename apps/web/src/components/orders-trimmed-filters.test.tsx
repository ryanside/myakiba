import { afterEach, expect, setDefaultTimeout, test } from "bun:test";
import { cleanup, configure, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient } from "@tanstack/react-query";
import { searchSchema } from "@myakiba/contracts/orders/schema";
import OrdersDataGrid from "@/components/orders/orders-data-grid";
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
  stubFetch((request) => {
    const { pathname, searchParams } = new URL(request.url);
    if (pathname === "/api/orders") listQueries.push(searchParams);
    return Response.json({
      ...ordersPage,
      items: [{ ...order, orderId: "od-ami", title: "AmiAmi preorder", tariffs: 500 }],
    });
  });
  localStorage.setItem("orders:viewMode", JSON.stringify("table"));
  localStorage.setItem("orders:columnVisibility", JSON.stringify({ tariffs: true }));
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await renderAppRoute(
    url,
    [{ path: "/orders", component: OrdersDataGrid, validateSearch: searchSchema }],
    queryClient,
  );
  await screen.findByText("AmiAmi preorder");
  return { listQueries, user: userEvent.setup({ delay: null }) };
}

test("a bookmarked URL with a cut filter and a cut sort loads the list without them", async () => {
  const { listQueries } = await renderOrders(
    "/orders?sort=tariffs&order=asc&tariffsMin=100&taxesMax=0&unpaidCostsMin=1&status=%5B%22Ordered%22%5D",
  );
  const [sent] = listQueries;

  expect({
    sort: sent?.get("sort"),
    order: sent?.get("order"),
    status: sent?.get("status"),
    cut: ["tariffsMin", "taxesMax", "unpaidCostsMin"].filter((key) => sent?.has(key)),
  }).toEqual({ sort: "createdAt", order: "asc", status: "Ordered", cut: [] });
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
