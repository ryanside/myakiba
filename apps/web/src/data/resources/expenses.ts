import type { ExpenseFilters, ExpenseShopFilters } from "@myakiba/contracts/expenses/schema";
import {
  getExpenseFilterOptions,
  getExpensesCollection,
  getExpensesOrders,
  getExpensesShipping,
  getExpensesShops,
  getShopExpansion,
} from "@/queries/expenses";
import { rootedRead } from "../client";

const cache = { staleTime: 1000 * 60 * 5, retry: false } as const;

export const expenses = {
  filterOptions: rootedRead("expenses", {
    key: () => ["expenses", "filter-options"] as const,
    load: getExpenseFilterOptions,
    ...cache,
  }),
  collection: rootedRead("expenses", {
    key: (filters: ExpenseFilters) => ["expenses", "collection", filters] as const,
    load: getExpensesCollection,
    ...cache,
  }),
  orders: rootedRead("expenses", {
    key: (filters: ExpenseFilters) => ["expenses", "orders", filters] as const,
    load: getExpensesOrders,
    ...cache,
  }),
  shipping: rootedRead("expenses", {
    key: (filters: ExpenseFilters) => ["expenses", "shipping", filters] as const,
    load: getExpensesShipping,
    ...cache,
  }),
  shops: rootedRead("expenses", {
    key: (filters: ExpenseShopFilters) => ["expenses", "shops", filters] as const,
    load: getExpensesShops,
    ...cache,
  }),
  shopExpansion: rootedRead("expenses", {
    key: ({ shopId, filters }: { readonly shopId: string; readonly filters: ExpenseShopFilters }) =>
      ["expenses", "shop-expansion", shopId, filters] as const,
    load: ({ shopId, filters }) => getShopExpansion(shopId, filters),
    ...cache,
  }),
};
