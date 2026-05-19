import { expenseShopsFiltersSchema } from "@myakiba/contracts/expenses/schema";
import type { ExpenseCostBreakdown } from "@myakiba/contracts/expenses/schema";
import type { OrderStatus } from "@myakiba/contracts/shared/types";
import * as z from "zod";

export {
  expenseFiltersSchema,
  expenseShopsFiltersSchema,
} from "@myakiba/contracts/expenses/schema";

export type {
  ExpenseFilters,
  ExpenseShopsFilters,
  ExpenseOrder,
  ExpenseShopsResponse,
  ExpensesOverviewResponse,
  MonthlyExpenseTrendEntry,
  ShopSpendRow,
  ShopExpansionItem,
  ShopExpansionResponse,
} from "@myakiba/contracts/expenses/schema";

export const shopParamSchema = z.object({
  shop: z.string().min(1),
});

export const shopExpansionQuerySchema = expenseShopsFiltersSchema.pick({
  dateStart: true,
  dateEnd: true,
  status: true,
});

export const ACTUAL_STATUSES = [
  "Paid",
  "Shipped",
  "Owned",
] as const satisfies readonly OrderStatus[];
export const UNPAID_STATUSES = ["Ordered"] as const satisfies readonly OrderStatus[];
export const TOP_DRIVERS = 10;
export const TOP_ORDERS_PER_SHOP = 5;
export const UNPAID_ORDER_PREVIEW = 6;
export const ITEMS_PER_SHOP = 6;
export const UNKNOWN_SHOP = "Unknown shop";

export type MoneyValue = number | string | bigint;

export type SpendQuery = {
  readonly userId: string;
  readonly dateStart?: string;
  readonly dateEnd?: string;
  readonly statuses: readonly OrderStatus[];
  readonly shops?: readonly string[];
};

export type ExpenseTotals = ExpenseCostBreakdown & {
  readonly orderCount: number;
  readonly itemCount: number;
};

export type OrderDetail = {
  readonly orderId: string;
  readonly title: string;
  readonly shop: string;
  readonly status: OrderStatus;
  readonly expenseDate: string | null;
  readonly images: readonly string[];
  readonly itemSpend: number;
  readonly itemCount: number;
  readonly shipping: number;
  readonly taxes: number;
  readonly duties: number;
  readonly tariffs: number;
  readonly miscFees: number;
  readonly feeSpend: number;
  readonly totalSpend: number;
  readonly totalCount: number;
};

export type ShopAggregate = {
  readonly shop: string;
  readonly orderCount: number;
  readonly itemCount: number;
  readonly itemSpend: number;
  readonly feeSpend: number;
};

export type PagedRows<T> = {
  readonly rows: readonly T[];
  readonly total: number;
};
