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
import { app, getErrorMessage } from "@/lib/treaty-client";

export async function getExpenseFilterOptions(): Promise<ExpenseFilterOptions> {
  const { data, error } = await app.api.expenses["filter-options"].get();

  if (error) {
    throw new Error(getErrorMessage(error, "Failed to get expense filter options"));
  }

  return data;
}

export async function getExpensesCollection(
  filters: ExpenseFilters = {},
): Promise<ExpensesCollectionResponse> {
  const { data, error } = await app.api.expenses.collection.get({ query: filters });

  if (error) {
    throw new Error(getErrorMessage(error, "Failed to get collection expenses"));
  }

  return data;
}

export async function getExpensesOrders(
  filters: ExpenseFilters = {},
): Promise<ExpensesOrdersResponse> {
  const { data, error } = await app.api.expenses.orders.get({ query: filters });

  if (error) {
    throw new Error(getErrorMessage(error, "Failed to get order expenses"));
  }

  return data;
}

export async function getExpensesShipping(
  filters: ExpenseFilters = {},
): Promise<ExpensesShippingResponse> {
  const { data, error } = await app.api.expenses.shipping.get({ query: filters });

  if (error) {
    throw new Error(getErrorMessage(error, "Failed to get shipping expenses"));
  }

  return data;
}

export async function getExpensesShops(filters: ExpenseShopFilters): Promise<ExpenseShopsResponse> {
  const { data, error } = await app.api.expenses.shops.get({ query: filters });

  if (error) {
    throw new Error(getErrorMessage(error, "Failed to get expense shops"));
  }

  return data;
}

export async function getShopExpansion(
  shopId: string,
  filters: ExpenseShopFilters,
): Promise<ShopExpansionResponse> {
  const { data, error } = await app.api.expenses
    .shops({ shop: encodeURIComponent(shopId) })
    .expansion.get({ query: filters });

  if (error) {
    throw new Error(getErrorMessage(error, "Failed to get shop expansion"));
  }

  return data;
}
