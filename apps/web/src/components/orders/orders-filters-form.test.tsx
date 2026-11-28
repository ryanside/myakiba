import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { OrdersPageSearch } from "@myakiba/contracts/orders/schema";
import OrdersFiltersForm from "./orders-filters-form";

afterEach(cleanup);

async function openFilters(currentFilters: OrdersPageSearch) {
  const applied: OrdersPageSearch[] = [];
  render(
    <QueryClientProvider client={new QueryClient()}>
      <OrdersFiltersForm
        renderTrigger={<button type="button">Filters</button>}
        currentFilters={currentFilters}
        onApplyFilters={(filters) => applied.push(filters)}
        currency="USD"
      />
    </QueryClientProvider>,
  );
  const user = userEvent.setup({ delay: null });
  await user.click(screen.getByRole("button", { name: "Filters" }));
  const dialog = await screen.findByRole("dialog");
  const releaseMonths = within(dialog).getByRole("group", { name: "Release Date" });
  return { user, dialog, releaseMonths, applied };
}

const releaseFilters = ({ releaseMonth, releaseDateStart, releaseDateEnd }: OrdersPageSearch) => ({
  releaseMonth,
  releaseDateStart,
  releaseDateEnd,
});

test("This month replaces a typed Release Date range", async () => {
  const { user, dialog, releaseMonths, applied } = await openFilters({
    releaseDateStart: "2026-01-01",
    releaseDateEnd: "2026-01-31",
  });

  await user.click(within(releaseMonths).getByRole("button", { name: "This month" }));
  await user.click(within(dialog).getByRole("button", { name: "Apply Filters" }));

  expect(applied.map(releaseFilters)).toEqual([
    { releaseMonth: "this", releaseDateStart: undefined, releaseDateEnd: undefined },
  ]);
});

test("the dialog opens with the month the page has", async () => {
  const { releaseMonths } = await openFilters({ releaseMonth: "next" });

  const pressed = within(releaseMonths)
    .getAllByRole("button")
    .map((button) => [button.textContent, button.getAttribute("aria-pressed")]);
  expect(pressed).toEqual([
    ["This month", "false"],
    ["Next month", "true"],
  ]);
});

test("pressing the chosen month again leaves Release Date open", async () => {
  const { user, dialog, releaseMonths, applied } = await openFilters({ releaseMonth: "next" });

  await user.click(within(releaseMonths).getByRole("button", { name: "Next month" }));
  await user.click(within(dialog).getByRole("button", { name: "Apply Filters" }));

  expect(applied.map(releaseFilters)).toEqual([
    { releaseMonth: undefined, releaseDateStart: undefined, releaseDateEnd: undefined },
  ]);
});

test("picking a Release Date day replaces the month", async () => {
  const { user, dialog, applied } = await openFilters({ releaseMonth: "this" });

  const [releaseFrom] = within(dialog).getAllByRole("button", { name: "From" });
  if (releaseFrom === undefined) throw new Error("the Release Date range has no From picker");
  await user.click(releaseFrom);
  const calendar = await screen.findByRole("grid");
  const [firstDay] = within(calendar).getAllByRole("button", { name: /\b15(th)?\b/ });
  if (firstDay === undefined) throw new Error("the calendar shows no 15th");
  await user.click(firstDay);
  await user.click(within(dialog).getByRole("button", { name: "Apply Filters" }));

  const [filters] = applied.map(releaseFilters);
  expect(filters?.releaseMonth).toBeUndefined();
  expect(filters?.releaseDateStart?.endsWith("-15")).toBe(true);
});
