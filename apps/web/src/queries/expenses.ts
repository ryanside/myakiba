import type {
  ExpenseFilterOptions,
  ExpenseFilters,
  ExpenseOrder,
  ExpenseShopFilters,
  ExpenseShopsResponse,
  ExpensesOverviewResponse,
  ExpensesShippingResponse,
  ExpensesTrendsResponse,
  ShopExpansionResponse,
} from "@myakiba/contracts/expenses/schema";
import { app, getErrorMessage } from "@/lib/treaty-client";

export type {
  ExpenseFilterOptions,
  ExpenseFilters,
  ExpenseOrder,
  ExpenseShopFilters,
  ExpenseShopsResponse,
  ExpensesOverviewResponse,
  ExpensesShippingResponse,
  ExpensesTrendsResponse,
  ShopExpansionResponse,
};

export async function getExpenseFilterOptions(): Promise<ExpenseFilterOptions> {
  const { data, error } = await app.api.expenses["filter-options"].get();

  if (error) {
    throw new Error(getErrorMessage(error, "Failed to get expense filter options"));
  }

  return data;
}

export async function getExpensesOverview(
  filters: ExpenseFilters = {},
): Promise<ExpensesOverviewResponse> {
  const { data, error } = await app.api.expenses.overview.get({ query: filters });

  if (error) {
    throw new Error(getErrorMessage(error, "Failed to get expenses overview"));
  }

  return data;
}

export async function getExpensesShops(
  filters: ExpenseShopFilters = {},
): Promise<ExpenseShopsResponse> {
  const { data, error } = await app.api.expenses.shops.get({ query: filters });

  if (error) {
    throw new Error(getErrorMessage(error, "Failed to get expense shops"));
  }

  return data;
}

export async function getExpensesTrends(
  filters: ExpenseFilters = {},
): Promise<ExpensesTrendsResponse> {
  const { data, error } = await app.api.expenses.trends.get({ query: filters });

  if (error) {
    throw new Error(getErrorMessage(error, "Failed to get expenses trends"));
  }

  return data;
}

export async function getExpensesShipping(
  filters: ExpenseFilters = {},
): Promise<ExpensesShippingResponse> {
  const { data, error } = await app.api.expenses.shipping.get({ query: filters });

  if (error) {
    throw new Error(getErrorMessage(error, "Failed to get expenses shipping"));
  }

  return data;
}

export async function getShopExpansion(
  shop: string,
  filters: ExpenseFilters = {},
): Promise<ShopExpansionResponse> {
  const { data, error } = await app.api.expenses.shops({ shop }).expansion.get({
    query: filters,
  });

  if (error) {
    throw new Error(getErrorMessage(error, "Failed to get shop expansion"));
  }

  return data;
}
