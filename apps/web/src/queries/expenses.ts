import type { Result } from "better-result";
import type {
  ExpenseFilterOptions,
  ExpenseFilters,
  ExpenseShopFilters,
  ExpenseShopsResponse,
  ExpensesCollectionResponse,
  ExpensesOrdersResponse,
  ExpensesShippingResponse,
  ShopExpansionResponse,
} from "@myakiba/contracts/expenses/schema";
import { call } from "@/data/api";
import type { ApiFailure } from "@/data/api";
import { app } from "@/lib/treaty-client";

export function getExpenseFilterOptions(): Promise<Result<ExpenseFilterOptions, ApiFailure>> {
  return call(app.api.expenses["filter-options"].get(), {
    fallback: "Failed to get expense filter options",
  });
}

export function getExpensesCollection(
  filters: ExpenseFilters = {},
): Promise<Result<ExpensesCollectionResponse, ApiFailure>> {
  return call(app.api.expenses.collection.get({ query: filters }), {
    fallback: "Failed to get collection expenses",
  });
}

export function getExpensesOrders(
  filters: ExpenseFilters = {},
): Promise<Result<ExpensesOrdersResponse, ApiFailure>> {
  return call(app.api.expenses.orders.get({ query: filters }), {
    fallback: "Failed to get order expenses",
  });
}

export function getExpensesShipping(
  filters: ExpenseFilters = {},
): Promise<Result<ExpensesShippingResponse, ApiFailure>> {
  return call(app.api.expenses.shipping.get({ query: filters }), {
    fallback: "Failed to get shipping expenses",
  });
}

export function getExpensesShops(
  filters: ExpenseShopFilters,
): Promise<Result<ExpenseShopsResponse, ApiFailure>> {
  return call(app.api.expenses.shops.get({ query: filters }), {
    fallback: "Failed to get expense shops",
  });
}

export function getShopExpansion(
  shopId: string,
  filters: ExpenseShopFilters,
): Promise<Result<ShopExpansionResponse, ApiFailure>> {
  return call(
    app.api.expenses.shops({ shop: encodeURIComponent(shopId) }).expansion.get({ query: filters }),
    { fallback: "Failed to get shop expansion" },
  );
}
