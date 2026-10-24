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
import { call, rejectErr } from "@/data/api";
import { app } from "@/lib/treaty-client";

export async function getExpenseFilterOptions(): Promise<ExpenseFilterOptions> {
  return call(app.api.expenses["filter-options"].get(), {
    fallback: "Failed to get expense filter options",
  }).then(rejectErr);
}

export async function getExpensesCollection(
  filters: ExpenseFilters = {},
): Promise<ExpensesCollectionResponse> {
  return call(app.api.expenses.collection.get({ query: filters }), {
    fallback: "Failed to get collection expenses",
  }).then(rejectErr);
}

export async function getExpensesOrders(
  filters: ExpenseFilters = {},
): Promise<ExpensesOrdersResponse> {
  return call(app.api.expenses.orders.get({ query: filters }), {
    fallback: "Failed to get order expenses",
  }).then(rejectErr);
}

export async function getExpensesShipping(
  filters: ExpenseFilters = {},
): Promise<ExpensesShippingResponse> {
  return call(app.api.expenses.shipping.get({ query: filters }), {
    fallback: "Failed to get shipping expenses",
  }).then(rejectErr);
}

export async function getExpensesShops(filters: ExpenseShopFilters): Promise<ExpenseShopsResponse> {
  return call(app.api.expenses.shops.get({ query: filters }), {
    fallback: "Failed to get expense shops",
  }).then(rejectErr);
}

export async function getShopExpansion(
  shopId: string,
  filters: ExpenseShopFilters,
): Promise<ShopExpansionResponse> {
  return call(
    app.api.expenses.shops({ shop: encodeURIComponent(shopId) }).expansion.get({ query: filters }),
    { fallback: "Failed to get shop expansion" },
  ).then(rejectErr);
}
