import { afterEach, describe, expect, test } from "bun:test";
import { getCollection } from "./collection";
import { getOrders } from "./orders";
import { getExpensesCollection, getExpensesOrders, getExpensesShipping } from "./expenses";
import { createList, getList, getListMembers, getLists } from "./lists";
import { getDashboard, getMonthlyDashboard } from "./dashboard";
import { getItemDatabaseItems } from "./search";
import { QueryClient } from "@tanstack/react-query";
import { wishlist } from "@/data/resources/wishlist";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

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
    "keeps the diagnostic fallback apart from the %s user message",
    async (status) => {
      globalThis.fetch = Object.assign(async () => new Response("Server detail", { status }), {
        preconnect: realFetch.preconnect,
      });
      await expect(load()).rejects.toMatchObject({
        message: fallback,
        userMessage: status === 400 ? "Server detail" : undefined,
      });
    },
  );
});

describe("Wishlist diagnostics", () => {
  test.each([400, 503])("separates diagnostics from the %s user message", async (status) => {
    globalThis.fetch = Object.assign(async () => new Response("Server detail", { status }), {
      preconnect: realFetch.preconnect,
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    try {
      await expect(
        client.fetchInfiniteQuery(
          wishlist.items.options({ releaseStatus: "all", today: "2026-11-05" }),
        ),
      ).rejects.toMatchObject({
        message: "Failed to load Wishlist",
        userMessage: status === 400 ? "Server detail" : undefined,
      });
    } finally {
      client.clear();
    }
  });
});

test.each([400, 503])("a failed List save preserves its existing %s message", async (status) => {
  globalThis.fetch = Object.assign(async () => new Response("Server detail", { status }), {
    preconnect: realFetch.preconnect,
  });
  await expect(createList({ title: "My List", description: "" })).rejects.toMatchObject({
    message: status === 400 ? "Server detail" : "Failed to create list",
  });
});
