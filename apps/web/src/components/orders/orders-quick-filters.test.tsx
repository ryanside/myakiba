import { afterEach, expect, mock, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { OrderFilters } from "@myakiba/contracts/orders/schema";

let filters: OrderFilters = {};
const applied: Partial<OrderFilters>[] = [];

await mock.module("@/hooks/use-orders", () => ({
  useOrdersFilters: () => ({
    filters,
    setFilters: (next: Partial<OrderFilters>) => applied.push(next),
  }),
}));

const { OrdersQuickFilters } = await import("./orders-quick-filters");

afterEach(() => {
  cleanup();
  filters = {};
  applied.length = 0;
});

const press = async (name: string) => {
  render(<OrdersQuickFilters />);
  await userEvent.click(screen.getByRole("button", { name }));
  return applied;
};

test("Unpaid narrows to Unpaid Orders and keeps the chosen statuses", async () => {
  filters = { status: ["Shipped"] };

  expect(await press("Unpaid")).toEqual([{ status: ["Shipped"], paid: false, offset: 0 }]);
});

test("Paid replaces Unpaid, since an Order is one or the other", async () => {
  filters = { paid: false };

  expect(await press("Paid")).toEqual([{ status: undefined, paid: true, offset: 0 }]);
});

test("pressing the chosen Paid chip again stops narrowing by Paid", async () => {
  filters = { paid: true };

  expect(await press("Paid")).toEqual([{ status: undefined, paid: undefined, offset: 0 }]);
});

const searchAfter = (search: OrderFilters, change: Partial<OrderFilters> | undefined) =>
  Object.fromEntries(
    Object.entries({ ...search, ...change }).filter(([, value]) => value !== undefined),
  );

test("after an Expenses Paid Orders link, Unpaid replaces the link's feesPaid instead of narrowing it", async () => {
  filters = { feesPaid: true };

  const [change] = await press("Unpaid");

  expect(searchAfter(filters, change)).toEqual({ paid: false, offset: 0 });
});

test("a status chip keeps an Expenses link's feesPaid", async () => {
  filters = { feesPaid: true };

  const [change] = await press("Shipped");

  expect(searchAfter(filters, change)).toEqual({
    feesPaid: true,
    status: ["Shipped"],
    offset: 0,
  });
});

const pressed = (name: string) => screen.getByRole("button", { name }).getAttribute("aria-pressed");

test("after an Expenses Paid Orders link, the row shows Fees paid as the filter on, not All", () => {
  filters = { feesPaid: true };
  render(<OrdersQuickFilters />);

  expect({ feesPaid: pressed("Fees paid"), all: pressed("All") }).toEqual({
    feesPaid: "true",
    all: "false",
  });
});

test("All clears an Expenses link's feesPaid", async () => {
  filters = { feesPaid: true };

  const [change] = await press("All");

  expect(searchAfter(filters, change)).toEqual({ offset: 0 });
});

test("after a status is chosen on an Expenses link's list, All clears both", async () => {
  filters = { feesPaid: true, status: ["Shipped"] };

  const [change] = await press("All");

  expect(searchAfter(filters, change)).toEqual({ offset: 0 });
});

test("toggling off the last status keeps an Expenses link's feesPaid", async () => {
  filters = { feesPaid: true, status: ["Shipped"] };

  const [change] = await press("Shipped");

  expect(searchAfter(filters, change)).toEqual({ feesPaid: true, offset: 0 });
});

test("pressing Fees paid again clears it", async () => {
  filters = { feesPaid: true };

  const [change] = await press("Fees paid");

  expect(searchAfter(filters, change)).toEqual({ offset: 0 });
});

test("a URL with both feesPaid and paid shows both payment chips pressed", () => {
  filters = { feesPaid: true, paid: false };
  render(<OrdersQuickFilters />);

  expect({
    feesPaid: pressed("Fees paid"),
    unpaid: pressed("Unpaid"),
    all: pressed("All"),
  }).toEqual({ feesPaid: "true", unpaid: "true", all: "false" });
});

test("on a URL with both, toggling off the pressed Unpaid chip keeps Fees paid", async () => {
  filters = { feesPaid: true, paid: false };

  const [change] = await press("Unpaid");

  expect(searchAfter(filters, change)).toEqual({ feesPaid: true, offset: 0 });
});
