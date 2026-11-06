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

// The browser shared out an auto-layout table's spare width by content, so the columns moved
// when the placeholder bars gave way to shop names and figures.
test("the Shops table holds each column to a fixed share of its width in every scope", () => {
  const sizesByScope = {
    collection: [40, 40, 150, 96, 72, 64, 120],
    orders: [40, 40, 150, 96, 72, 64, 104, 88, 88],
    shipping: [40, 40, 150, 96, 72, 64, 120],
  } as const;

  for (const [scope, sizes] of Object.entries(sizesByScope) as [
    keyof typeof sizesByScope,
    readonly number[],
  ][]) {
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
    const total = sizes.reduce((sum, size) => sum + size, 0);
    const shares = screen
      .getAllByRole("columnheader")
      .map((header) => Number.parseFloat(header.style.getPropertyValue("--column-share")));

    expect(screen.getByRole("table").classList.contains("table-fixed")).toBe(true);
    expect(shares).toHaveLength(sizes.length);
    sizes.forEach((size, index) => expect(shares[index]).toBeCloseTo((size / total) * 100, 2));
    cleanup();
  }
});
