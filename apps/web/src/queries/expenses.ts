import type {
  ExpenseCostBreakdown,
  ExpenseFilters,
  ExpenseOrder,
  ExpenseShopsFilters,
  ExpenseShopsResponse,
  ExpenseSummary,
  ExpensesOverviewResponse,
  MonthlyExpenseTrendEntry,
  ShopExpansionResponse,
  ShopFeeBreakdown,
  ShopSpendRow,
  TopExpenseDriver,
} from "@myakiba/contracts/expenses/schema";
import { app, getErrorMessage } from "@/lib/treaty-client";

export type {
  ExpenseCostBreakdown,
  ExpenseFilters,
  ExpenseOrder,
  ExpenseShopsFilters,
  ExpenseShopsResponse,
  ExpenseSummary,
  ExpensesOverviewResponse,
  MonthlyExpenseTrendEntry,
  ShopExpansionResponse,
  ShopFeeBreakdown,
  ShopSpendRow,
  TopExpenseDriver,
};

export type ShopExpansionFilters = Pick<ExpenseShopsFilters, "dateStart" | "dateEnd" | "status">;

export async function getExpensesOverview(
  filters: ExpenseFilters = {},
): Promise<ExpensesOverviewResponse> {
  const { data, error } = await app.api.expenses.get({ query: filters });

  if (error) {
    throw new Error(getErrorMessage(error, "Failed to get expenses overview"));
  }

  return data;
}

export async function getShopsBreakdown(
  filters: ExpenseShopsFilters = {},
): Promise<ExpenseShopsResponse> {
  const { data, error } = await app.api.expenses.shops.get({ query: filters });

  if (error) {
    throw new Error(getErrorMessage(error, "Failed to get shops breakdown"));
  }

  return data;
}

export async function getShopExpansion(
  shop: string,
  filters: ShopExpansionFilters = {},
): Promise<ShopExpansionResponse> {
  const { data, error } = await app.api.expenses.shops({ shop }).expansion.get({ query: filters });

  if (error) {
    throw new Error(getErrorMessage(error, "Failed to get shop expansion"));
  }

  return data;
}
