import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { OrderFilters } from "@myakiba/contracts/orders/schema";
import OrdersFiltersForm from "./orders-filters-form";

afterEach(cleanup);

const fromPaidOrdersLink: OrderFilters = { feesPaid: true, shop: ["AmiAmi"] };

async function apply(choosePaid?: string) {
  const applied: OrderFilters[] = [];
  render(
    <QueryClientProvider client={new QueryClient()}>
      <OrdersFiltersForm
        renderTrigger={<button type="button">Filters</button>}
        currentFilters={fromPaidOrdersLink}
        onApplyFilters={(filters) => applied.push(filters)}
        currency="USD"
      />
    </QueryClientProvider>,
  );
  const user = userEvent.setup({ delay: null });
  await user.click(screen.getByRole("button", { name: "Filters" }));
  if (choosePaid) {
    await user.click(await screen.findByRole("combobox", { name: "Paid" }));
    await user.click(await screen.findByRole("option", { name: choosePaid }));
  }
  await user.click(screen.getByRole("button", { name: "Apply Filters" }));
  return Object.fromEntries(
    Object.entries({ ...fromPaidOrdersLink, ...applied[0], offset: 0 }).filter(
      ([, value]) => value !== undefined,
    ),
  );
}

test("choosing Unpaid after an Expenses Paid Orders link replaces the link's feesPaid", async () => {
  expect(await apply("Unpaid")).toEqual({ shop: ["AmiAmi"], paid: false, offset: 0 });
});

test("applying the form keeps only the payment filter its Paid field shows", async () => {
  expect(await apply()).toEqual({ shop: ["AmiAmi"], offset: 0 });
});
