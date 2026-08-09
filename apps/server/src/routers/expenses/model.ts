import * as z from "zod";

export const EXPENSE_NAMED_SHOP_ID_PREFIX = "shop:";
export const EXPENSE_UNASSIGNED_SHOP_ID = "unassigned";

export { expenseFiltersSchema, expenseShopFiltersSchema } from "@myakiba/contracts/expenses/schema";

export type {
  ExpenseFilterOptions,
  ExpenseBucket,
  ExpenseFilters,
  ExpenseShopFilters,
  ExpenseShopsResponse,
  ExpensesCollectionResponse,
  ExpensesOrdersResponse,
  ExpensesShippingResponse,
  ShopExpansionResponse,
} from "@myakiba/contracts/expenses/schema";

export const shopParamSchema = z.object({
  shop: z.union([
    z.literal(EXPENSE_UNASSIGNED_SHOP_ID),
    z
      .string()
      .min(EXPENSE_NAMED_SHOP_ID_PREFIX.length + 1)
      .startsWith(EXPENSE_NAMED_SHOP_ID_PREFIX),
  ]),
});
