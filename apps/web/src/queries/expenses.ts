import { readResponse } from "@/lib/read-response";
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
import { app, getUserErrorMessage } from "@/lib/treaty-client";

export async function getExpenseFilterOptions(): Promise<ExpenseFilterOptions> {
  const { data, error } = await app.api.expenses["filter-options"].get();

  if (error) {
    throw new Error(getUserErrorMessage(error, "Failed to get expense filter options"));
  }

  return data;
}

export async function getExpensesCollection(
  filters: ExpenseFilters = {},
): Promise<ExpensesCollectionResponse> {
  return readResponse(
    app.api.expenses.collection.get({ query: filters }),
    "Failed to get collection expenses",
  );
}

export async function getExpensesOrders(
  filters: ExpenseFilters = {},
): Promise<ExpensesOrdersResponse> {
  return readResponse(
    app.api.expenses.orders.get({ query: filters }),
    "Failed to get order expenses",
  );
}

export async function getExpensesShipping(
  filters: ExpenseFilters = {},
): Promise<ExpensesShippingResponse> {
  return readResponse(
    app.api.expenses.shipping.get({ query: filters }),
    "Failed to get shipping expenses",
  );
}

export async function getExpensesShops(filters: ExpenseShopFilters): Promise<ExpenseShopsResponse> {
  const { data, error } = await app.api.expenses.shops.get({ query: filters });

  if (error) {
    throw new Error(getUserErrorMessage(error, "Failed to get expense shops"));
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
    throw new Error(getUserErrorMessage(error, "Failed to get shop expansion"));
  }

  return data;
}
