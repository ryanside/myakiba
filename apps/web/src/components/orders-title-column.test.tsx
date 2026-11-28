import { afterEach, expect, setDefaultTimeout, test } from "bun:test";
import { cleanup, configure, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient } from "@tanstack/react-query";
import { searchSchema } from "@myakiba/contracts/orders/schema";
import OrdersDataGrid from "@/components/orders/orders-data-grid";
import { renderAppRoute, stubFetch } from "../../test/app-route";
import { ordersPage } from "../../test/order";

configure({ asyncUtilTimeout: 4000 });
setDefaultTimeout(30_000);

let queryClient = new QueryClient();

afterEach(() => {
  cleanup();
  queryClient.clear();
  localStorage.clear();
});

test("a saved layout that hid the Title column still shows it, with its link, and the Columns picker never offers it", async () => {
  localStorage.setItem("orders:viewMode", JSON.stringify("table"));
  localStorage.setItem("orders:columnVisibility", JSON.stringify({ title: false }));
  stubFetch(() => Response.json({ ...ordersPage, activeOrders: 1 }));
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await renderAppRoute(
    "/orders",
    [{ path: "/orders", component: OrdersDataGrid, validateSearch: searchSchema }],
    queryClient,
  );
  const user = userEvent.setup({ delay: null });

  await screen.findByRole("button", { name: "Expand row" });
  const links = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
  expect(links).toContain("/orders/od-deleted");

  const columnsTrigger = screen
    .getAllByRole("combobox")
    .find((control) => control.textContent?.includes("Columns"));
  if (!columnsTrigger) throw new Error("the toolbar has no Columns picker");
  await user.click(columnsTrigger);
  const picker = await screen.findByRole("listbox");
  const offered = within(picker)
    .getAllByRole("option")
    .map((option) => option.textContent);
  expect(offered.length > 0).toBe(true);
  expect(offered.some((name) => name?.toLowerCase().includes("title"))).toBe(false);
});
