import * as z from "zod";
import { ORDER_STATUSES } from "../shared/constants";

const expenseStatusSchema = z.enum(ORDER_STATUSES);

const expenseStatusArraySchema = z
  .union([z.array(expenseStatusSchema), expenseStatusSchema])
  .transform((value) => (Array.isArray(value) ? value : [value]));

const stringArraySchema = z
  .union([z.array(z.string()), z.string()])
  .transform((value) => (Array.isArray(value) ? value : [value]));

export const expenseFiltersSchema = z.object({
  dateStart: z.iso.date().optional(),
  dateEnd: z.iso.date().optional(),
  status: expenseStatusArraySchema.optional(),
  shop: stringArraySchema.optional(),
  shopSearch: z.string().optional(),
  shopLimit: z.coerce.number().int().positive().optional(),
  shopOffset: z.coerce.number().int().min(0).optional(),
  expand: z.string().optional(),
});

const expenseSummarySchema = z.object({
  totalSpend: z.number(),
  itemSpend: z.number(),
  feeSpend: z.number(),
  orderCount: z.number(),
  itemCount: z.number(),
  avgOrder: z.number(),
  avgItem: z.number(),
  avgFee: z.number(),
});

const expenseCostBreakdownSchema = z.object({
  items: z.number(),
  shipping: z.number(),
  taxes: z.number(),
  duties: z.number(),
  tariffs: z.number(),
  miscFees: z.number(),
});

const monthlyExpenseTrendEntrySchema = z.object({
  month: z.string(),
  itemSpend: z.number(),
  feeSpend: z.number(),
  totalSpend: z.number(),
  orderCount: z.number(),
});

const expenseOrderSchema = z.object({
  orderId: z.string(),
  title: z.string(),
  shop: z.string(),
  status: expenseStatusSchema,
  expenseDate: z.string().nullable(),
  images: z.array(z.string()),
  itemSpend: z.number(),
  shipping: z.number(),
  taxes: z.number(),
  duties: z.number(),
  tariffs: z.number(),
  miscFees: z.number(),
  feeSpend: z.number(),
  totalSpend: z.number(),
});

const expenseFilterOptionsSchema = z.object({
  shopOptions: z.array(z.string()),
});

const expensesOverviewResponseSchema = z.object({
  summary: expenseSummarySchema,
  unpaidBreakdown: expenseCostBreakdownSchema,
  unpaidOrders: z.array(expenseOrderSchema),
  unpaidOrderCount: z.number(),
  uniqueShopCount: z.number(),
  costBreakdown: expenseCostBreakdownSchema,
  monthlyTrend: z.array(monthlyExpenseTrendEntrySchema),
  topDrivers: z.array(expenseOrderSchema),
  filterOptions: expenseFilterOptionsSchema,
});

export const expenseShopsFiltersSchema = z.object({
  dateStart: z.iso.date().optional(),
  dateEnd: z.iso.date().optional(),
  status: expenseStatusArraySchema.optional(),
  shop: stringArraySchema.optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().min(0).optional(),
  expand: z.string().optional(),
});

const shopSpendRowSchema = z.object({
  shop: z.string(),
  orderCount: z.number(),
  itemCount: z.number(),
  itemSpend: z.number(),
  feeSpend: z.number(),
  totalSpend: z.number(),
  avgOrder: z.number(),
});

const expenseShopsKpisSchema = z.object({
  uniqueShops: z.number(),
  orderCount: z.number(),
  totalSpend: z.number(),
  avgPerShop: z.number(),
});

const expenseShopsResponseSchema = z.object({
  kpis: expenseShopsKpisSchema,
  rows: z.array(shopSpendRowSchema),
  totalCount: z.number(),
});

const shopFeeBreakdownSchema = z.object({
  shipping: z.number(),
  taxes: z.number(),
  duties: z.number(),
  tariffs: z.number(),
  miscFees: z.number(),
});

const shopExpansionItemSchema = z.object({
  collectionId: z.string(),
  itemId: z.string(),
  externalId: z.number().nullable(),
  title: z.string(),
  image: z.string().nullable(),
});

const shopExpansionResponseSchema = z.object({
  feeBreakdown: shopFeeBreakdownSchema,
  topOrders: z.array(expenseOrderSchema),
  totalOrders: z.number(),
  items: z.array(shopExpansionItemSchema),
  totalItems: z.number(),
});

export type ExpenseFilters = z.infer<typeof expenseFiltersSchema>;
export type ExpenseShopsFilters = z.infer<typeof expenseShopsFiltersSchema>;
export type ExpenseSummary = z.infer<typeof expenseSummarySchema>;
export type ExpenseCostBreakdown = z.infer<typeof expenseCostBreakdownSchema>;
export type MonthlyExpenseTrendEntry = z.infer<typeof monthlyExpenseTrendEntrySchema>;
export type ExpenseOrder = z.infer<typeof expenseOrderSchema>;
export type TopExpenseDriver = ExpenseOrder;
export type ExpensesOverviewResponse = z.infer<typeof expensesOverviewResponseSchema>;
export type ShopSpendRow = z.infer<typeof shopSpendRowSchema>;
export type ExpenseShopsResponse = z.infer<typeof expenseShopsResponseSchema>;
export type ShopFeeBreakdown = z.infer<typeof shopFeeBreakdownSchema>;
export type ShopExpansionItem = z.infer<typeof shopExpansionItemSchema>;
export type ShopExpansionResponse = z.infer<typeof shopExpansionResponseSchema>;
