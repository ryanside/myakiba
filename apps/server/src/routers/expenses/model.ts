import * as z from "zod";

export {
  expenseFilterOptionsSchema,
  expenseFiltersSchema,
  expenseShopFiltersSchema,
  expenseShopsResponseSchema,
  expensesOverviewResponseSchema,
  expensesShippingResponseSchema,
  expensesTrendsResponseSchema,
  shopExpansionResponseSchema,
} from "@myakiba/contracts/expenses/schema";

export type {
  ExpenseFilterOptions,
  ExpenseBucket,
  ExpenseFilters,
  ExpenseOrder,
  ExpenseShopFilters,
  ExpenseShopsResponse,
  ExpensesShippingResponse,
  ExpensesTrendsResponse,
  ExpensesOverviewResponse,
  ShopExpansionResponse,
  ShopFeeBreakdown,
  ShopSpendRow,
} from "@myakiba/contracts/expenses/schema";

export const shopParamSchema = z.object({
  shop: z.string().min(1),
});
