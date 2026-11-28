import { afterEach, expect, mock, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { OrdersPageSearch } from "@myakiba/contracts/orders/schema";

let filters: OrdersPageSearch = {};
const applied: Partial<OrdersPageSearch>[] = [];

await mock.module("@/hooks/use-orders", () => ({
  useOrdersFilters: () => ({
    filters,
    setFilters: (next: Partial<OrdersPageSearch>) => applied.push(next),
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

const RELEASING = "Releasing this month";
const pressed = (name: string): boolean =>
  screen.getByRole("button", { name }).getAttribute("aria-pressed") === "true";

test("Releasing this month narrows to this month's Ordered and Shipped Orders", async () => {
  filters = { status: ["Owned"], paid: true, releaseDateStart: "2026-01-01" };

  expect(await press(RELEASING)).toEqual([
    {
      status: ["Ordered", "Shipped"],
      paid: true,
      releaseMonth: "this",
      releaseDateStart: undefined,
      releaseDateEnd: undefined,
      offset: 0,
    },
  ]);
});

test("Releasing this month lights Ordered and Shipped with it, and not All", () => {
  filters = { status: ["Ordered", "Shipped"], releaseMonth: "this" };
  render(<OrdersQuickFilters />);

  expect([RELEASING, "Ordered", "Shipped", "Owned", "All"].map(pressed)).toEqual([
    true,
    true,
    true,
    false,
    false,
  ]);
});

test("next month from the Filters dialog does not light Releasing this month", () => {
  filters = { releaseMonth: "next" };
  render(<OrdersQuickFilters />);

  expect(pressed(RELEASING)).toBe(false);
});

test("pressing Releasing this month again lifts the month and the two statuses it set", async () => {
  filters = { status: ["Ordered", "Shipped", "Owned"], releaseMonth: "this" };

  expect(await press(RELEASING)).toEqual([
    {
      status: ["Owned"],
      paid: undefined,
      releaseMonth: undefined,
      releaseDateStart: undefined,
      releaseDateEnd: undefined,
      offset: 0,
    },
  ]);
});

test("All lifts Releasing this month with every chip", async () => {
  filters = { status: ["Ordered", "Shipped"], paid: false, releaseMonth: "this" };

  expect(await press("All")).toEqual([
    {
      status: undefined,
      paid: undefined,
      releaseMonth: undefined,
      releaseDateStart: undefined,
      releaseDateEnd: undefined,
      offset: 0,
    },
  ]);
});

test("a status chip keeps Releasing this month on", async () => {
  filters = { status: ["Ordered", "Shipped"], releaseMonth: "this" };

  expect(await press("Shipped")).toEqual([{ status: ["Ordered"], paid: undefined, offset: 0 }]);
});
