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

test("Overdue narrows to overdue Orders and keeps the chosen statuses and Paid", async () => {
  filters = { status: ["Ordered"], paid: false };

  const [next] = await press("Overdue");
  expect(next).toEqual({ status: ["Ordered"], paid: false, overdue: true, offset: 0 });
});

test("pressing Overdue again stops narrowing to overdue Orders", async () => {
  filters = { overdue: true };

  const [next] = await press("Overdue");
  expect(next?.overdue).toBeUndefined();
  expect(screen.getByRole("button", { name: "Overdue" }).getAttribute("aria-pressed")).toBe("true");
});
