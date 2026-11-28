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
const lit = (): string[] =>
  screen
    .getAllByRole("button")
    .filter((button) => button.getAttribute("aria-pressed") === "true")
    .map((button) => button.textContent ?? "");

async function pressAndApply(name: string): Promise<Partial<OrdersPageSearch> | undefined> {
  const { rerender } = render(<OrdersQuickFilters />);
  await userEvent.click(screen.getByRole("button", { name }));
  const [update] = applied;
  filters = { ...filters, ...update };
  rerender(<OrdersQuickFilters />);
  return update;
}

test("Releasing this month narrows to this month's Orders and leaves status and Paid as they were", async () => {
  filters = { status: ["Owned"], paid: true, releaseDateStart: "2026-01-01" };

  expect(await pressAndApply(RELEASING)).toStrictEqual({
    status: ["Owned"],
    paid: true,
    releaseMonth: "this",
    releaseDateStart: undefined,
    releaseDateEnd: undefined,
    offset: 0,
  });
  expect(lit()).toStrictEqual(["Owned", "Paid", RELEASING]);
});

test("This month from the Filters dialog lights Releasing this month", () => {
  filters = { releaseMonth: "this" };
  render(<OrdersQuickFilters />);

  expect(lit()).toStrictEqual([RELEASING]);
});

test("next month from the Filters dialog does not light Releasing this month", () => {
  filters = { status: ["Ordered", "Shipped"], releaseMonth: "next" };
  render(<OrdersQuickFilters />);

  expect(lit()).toStrictEqual(["Ordered", "Shipped"]);
});

test("pressing Releasing this month again lifts only the month", async () => {
  filters = { status: ["Ordered"], paid: false, releaseMonth: "this" };

  expect(await pressAndApply(RELEASING)).toStrictEqual({
    status: ["Ordered"],
    paid: false,
    releaseMonth: undefined,
    releaseDateStart: undefined,
    releaseDateEnd: undefined,
    offset: 0,
  });
  expect(lit()).toStrictEqual(["Ordered", "Unpaid"]);
});

test("a status chip keeps the month", async () => {
  filters = { status: ["Ordered"], releaseMonth: "this" };

  expect(await pressAndApply("Owned")).toStrictEqual({
    status: ["Ordered", "Owned"],
    paid: undefined,
    offset: 0,
  });
  expect(lit()).toStrictEqual(["Ordered", "Owned", RELEASING]);
});

test("All lifts Releasing this month with every chip", async () => {
  filters = { status: ["Owned"], paid: false, releaseMonth: "this" };

  expect(await pressAndApply("All")).toStrictEqual({
    status: undefined,
    paid: undefined,
    releaseMonth: undefined,
    releaseDateStart: undefined,
    releaseDateEnd: undefined,
    offset: 0,
  });
  expect(lit()).toStrictEqual(["All"]);
});

test("All leaves Next month from the Filters dialog", async () => {
  filters = { status: ["Ordered"], releaseMonth: "next" };

  expect(await pressAndApply("All")).toStrictEqual({
    status: undefined,
    paid: undefined,
    offset: 0,
  });
  expect(filters.releaseMonth).toBe("next");
});

test("All leaves a picked Release Date range", async () => {
  filters = { status: ["Ordered"], releaseDateStart: "2026-01-01", releaseDateEnd: "2026-01-31" };

  expect(await pressAndApply("All")).toStrictEqual({
    status: undefined,
    paid: undefined,
    offset: 0,
  });
  expect([filters.releaseDateStart, filters.releaseDateEnd]).toStrictEqual([
    "2026-01-01",
    "2026-01-31",
  ]);
});
