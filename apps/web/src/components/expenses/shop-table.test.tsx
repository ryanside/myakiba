import { afterEach, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { expenses } from "@/data/resources/expenses";
import { ShopTable } from "./shop-table";

afterEach(cleanup);

// The rows rise 3 px as they fade in, and a box that scrolls sideways also scrolls down, so a
// scroller that let them overflow showed a vertical scrollbar that shifted the table for a moment.
test("the Shops table's sideways scroller never scrolls down while its rows fade in", () => {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  client.setQueryData(expenses.shops.key({ scope: "orders", limit: 10, offset: 0 }), {
    items: [],
    totalCount: 0,
  });
  render(
    <QueryClientProvider client={client}>
      <ShopTable
        scope="orders"
        filters={{}}
        currency="JPY"
        locale="en-US"
        dateFormat="MM/DD/YYYY"
      />
    </QueryClientProvider>,
  );
  const scroller = screen.getByRole("table").closest(".overflow-x-auto");
  expect(scroller?.classList.contains("overflow-y-hidden")).toBe(true);
});

for (const scope of ["collection", "orders", "shipping"] as const) {
  test(`the ${scope} Shops table holds every column but the shop to a fixed width`, () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    client.setQueryData(expenses.shops.key({ scope, limit: 10, offset: 0 }), {
      items: [],
      totalCount: 0,
    });
    render(
      <QueryClientProvider client={client}>
        <ShopTable
          scope={scope}
          filters={{}}
          currency="JPY"
          locale="en-US"
          dateFormat="MM/DD/YYYY"
        />
      </QueryClientProvider>,
    );
    const widths = screen
      .getAllByRole("columnheader")
      .map((header) => header.getAttribute("class")?.match(/(?:^|\s)(w-\d+)(?:\s|$)/)?.[1]);

    expect(screen.getByRole("table").classList.contains("table-fixed")).toBe(true);
    expect(widths.filter((width) => width === undefined)).toHaveLength(1);
  });
}
