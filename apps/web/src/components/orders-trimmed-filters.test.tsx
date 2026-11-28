import { afterEach, expect, setDefaultTimeout, test } from "bun:test";
import { cleanup, configure, screen, within } from "@testing-library/react";
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

let queryClient = new QueryClient();

afterEach(() => {
  cleanup();
  queryClient.clear();
  localStorage.clear();
});

async function renderOrders(url: string) {
  stubFetch(() =>
    Response.json({
      ...ordersPage,
      items: [{ ...order, orderId: "od-ami", title: "AmiAmi preorder", tariffs: 500 }],
    }),
  );
  localStorage.setItem("orders:viewMode", JSON.stringify("table"));
  localStorage.setItem("orders:columnVisibility", JSON.stringify({ tariffs: true }));
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await renderAppRoute(
    url,
    [{ path: "/orders", component: OrdersDataGrid, validateSearch: searchSchema }],
    queryClient,
  );
  await screen.findByText("AmiAmi preorder");
  return { user: userEvent.setup({ delay: null }) };
}

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
