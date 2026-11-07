import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { LoadError } from "@/components/page-states";
import { wishlist } from "@/data/resources/wishlist";
import { getCollection } from "./collection";
import { getDashboard, getMonthlyDashboard } from "./dashboard";
import { getExpensesCollection, getExpensesOrders, getExpensesShipping } from "./expenses";
import { getList, getListMembers, getLists } from "./lists";
import { getOrders } from "./orders";
import { getItemDatabaseItems } from "./search";

const realFetch = globalThis.fetch;
afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
});

function answerWith(status: number) {
  globalThis.fetch = Object.assign(async () => new Response("Server detail", { status }), {
    preconnect: realFetch.preconnect,
  });
}

async function failureOf(load: () => Promise<object>): Promise<Error> {
  try {
    await load();
  } catch (error) {
    if (error instanceof Error) return error;
  }
  throw new Error("the load did not reject with an Error");
}

function expectShownMessage(error: Error, status: number) {
  render(<LoadError title="Could not load" error={error} />);
  expect(
    screen.getByText(status === 400 ? "Server detail" : "The server didn't answer."),
  ).toBeTruthy();
}

const reads = [
  ["Collection", () => getCollection({}), "Failed to get collection"],
  ["Orders", () => getOrders({}), "Failed to get orders"],
  ["Collection expenses", () => getExpensesCollection(), "Failed to get collection expenses"],
  ["Order expenses", () => getExpensesOrders(), "Failed to get order expenses"],
  ["Shipping expenses", () => getExpensesShipping(), "Failed to get shipping expenses"],
  ["Lists", () => getLists(25, 0), "Failed to get lists"],
  ["List detail", () => getList("list-1"), "Failed to get list"],
  ["List members", () => getListMembers("list-1", 25, 0), "Failed to load List"],
  ["Dashboard overview", getDashboard, "Failed to get dashboard"],
  ["Dashboard monthly", () => getMonthlyDashboard(11, 2026), "Failed to get monthly dashboard"],
  [
    "Item Database",
    () => getItemDatabaseItems({ query: undefined, page: 1, pageSize: 25 }),
    "Failed to search item database",
  ],
] as const;

describe.each(reads)("%s diagnostics", (_name, load, fallback) => {
  test.each([400, 503])(
    "keeps the diagnostic fallback apart from the %d user message",
    async (status) => {
      answerWith(status);
      const error = await failureOf(load);
      expect(error.message).toBe(fallback);
      expectShownMessage(error, status);
    },
  );
});

describe("Wishlist diagnostics", () => {
  test.each([400, 503])("separates diagnostics from the %d user message", async (status) => {
    answerWith(status);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    try {
      const error = await failureOf(() =>
        client.fetchInfiniteQuery(
          wishlist.items.options({ releaseStatus: "all", today: "2026-11-05" }),
        ),
      );
      expect(error.message).toBe("Failed to load Wishlist");
      expectShownMessage(error, status);
    } finally {
      client.clear();
    }
  });
});
