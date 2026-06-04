import * as z from "zod";
import { SHIPPING_METHODS } from "../shared/constants";

export const EXPENSE_BUCKETS = ["month", "year"] as const;

export const EXPENSE_BREAKDOWN_KEYS = [
  "items",
  "shipping",
  "taxes",
  "duties",
  "tariffs",
  "misc",
] as const;

const stringArraySchema = z
  .union([z.array(z.string()), z.string()])
  .transform((value) => (Array.isArray(value) ? value : [value]));

export const expenseFiltersSchema = z.object({
  dateStart: z.iso.date().optional(),
  dateEnd: z.iso.date().optional(),
  shop: stringArraySchema.optional(),
});

export const expenseShopFiltersSchema = expenseFiltersSchema.extend({
  search: z.string().optional(),
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const expenseFilterOptionsSchema = z.object({
  shopOptions: z.array(z.string()),
});

const expenseTotalsSchema = z.object({
  totalSpend: z.number(),
  feeSpend: z.number(),
  collectionItemSpend: z.number(),
  orderItemSpend: z.number(),
  orderSpend: z.number(),
  shippingSpend: z.number(),
  taxesSpend: z.number(),
  dutiesSpend: z.number(),
  tariffsSpend: z.number(),
  miscSpend: z.number(),
  averageOrderSpend: z.number(),
  averageCollectionItemSpend: z.number(),
  averageOrderItemSpend: z.number(),
  averageFeeSpend: z.number(),
  averageShippingSpend: z.number(),
  averageTaxesSpend: z.number(),
  averageDutiesSpend: z.number(),
  averageTariffsSpend: z.number(),
  averageMiscSpend: z.number(),
  paidOrderCount: z.number(),
  paidItemCount: z.number(),
  ownedItemCount: z.number(),
});

const expenseSeriesPointSchema = z.object({
  bucket: z.string(),
  totalSpend: z.number(),
  collectionItemSpend: z.number(),
  orderItemSpend: z.number(),
  orderSpend: z.number(),
  feeSpend: z.number(),
});

const expenseAveragePointSchema = z.object({
  bucket: z.string(),
  averageOrderSpend: z.number(),
  averageCollectionItemSpend: z.number(),
  averageOrderItemSpend: z.number(),
  averageFeeSpend: z.number(),
});

const expenseBreakdownEntrySchema = z.object({
  key: z.enum(EXPENSE_BREAKDOWN_KEYS),
  label: z.string(),
  value: z.number(),
  percentage: z.number(),
});

const expenseShippingMethodPointSchema = z.object({
  bucket: z.string(),
  values: z.record(z.enum(SHIPPING_METHODS), z.number()),
});

const expenseBundleEfficiencyPointSchema = z.object({
  itemCount: z.number(),
  values: z.record(z.enum(SHIPPING_METHODS), z.number()),
});

const shopSpendRowSchema = z.object({
  shop: z.string(),
  orderCount: z.number(),
  ownedItemCount: z.number(),
  orderItemCount: z.number(),
  collectionItemSpend: z.number(),
  orderItemSpend: z.number(),
  feeSpend: z.number(),
  totalSpend: z.number(),
  averageOrderSpend: z.number(),
  averageCollectionItemSpend: z.number(),
  averageOrderItemSpend: z.number(),
  averageFeeSpend: z.number(),
});

const expenseShopsResponseSchema = z.object({
  rows: z.array(shopSpendRowSchema),
  totalCount: z.number(),
});

export { expenseShopsResponseSchema };

const expenseOrderSchema = z.object({
  orderId: z.string(),
  title: z.string(),
  shop: z.string(),
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

const expenseUnpaidBreakdownSchema = z.object({
  items: z.number(),
  shipping: z.number(),
  taxes: z.number(),
  duties: z.number(),
  tariffs: z.number(),
  miscFees: z.number(),
});

export const expensesOverviewResponseSchema = z.object({
  totals: expenseTotalsSchema,
  breakdown: z.array(expenseBreakdownEntrySchema),
  unpaidBreakdown: expenseUnpaidBreakdownSchema,
  unpaidOrders: z.array(expenseOrderSchema),
  unpaidOrderCount: z.number(),
});

export const expensesTrendsResponseSchema = z.object({
  bucket: z.enum(EXPENSE_BUCKETS),
  totals: expenseTotalsSchema,
  spendOverTime: z.array(expenseSeriesPointSchema),
  cumulativeSpendOverTime: z.array(expenseSeriesPointSchema),
  averagesOverTime: z.array(expenseAveragePointSchema),
  cumulativeAveragesOverTime: z.array(expenseAveragePointSchema),
});

export const expensesShippingResponseSchema = z.object({
  bucket: z.enum(EXPENSE_BUCKETS),
  totals: expenseTotalsSchema,
  usedShippingMethods: z.array(z.enum(SHIPPING_METHODS)),
  shippingFeeByMethod: z.array(expenseShippingMethodPointSchema),
  averageShippingFeeByMethod: z.array(expenseShippingMethodPointSchema),
  cumulativeShippingFeeByMethod: z.array(expenseShippingMethodPointSchema),
  cumulativeAverageShippingFeeByMethod: z.array(expenseShippingMethodPointSchema),
  bundleEfficiency: z.array(expenseBundleEfficiencyPointSchema),
});

export const shopExpansionResponseSchema = z.object({
  feeBreakdown: shopFeeBreakdownSchema,
  topOrders: z.array(expenseOrderSchema),
  items: z.array(shopExpansionItemSchema),
});

export type ExpenseFilters = z.infer<typeof expenseFiltersSchema>;
export type ExpenseShopFilters = z.infer<typeof expenseShopFiltersSchema>;
export type ExpenseFilterOptions = z.infer<typeof expenseFilterOptionsSchema>;
export type ExpenseBucket = (typeof EXPENSE_BUCKETS)[number];
export type ExpenseTotals = z.infer<typeof expenseTotalsSchema>;
export type ExpenseSeriesPoint = z.infer<typeof expenseSeriesPointSchema>;
export type ExpenseAveragePoint = z.infer<typeof expenseAveragePointSchema>;
export type ExpenseBreakdownEntry = z.infer<typeof expenseBreakdownEntrySchema>;
export type ExpenseShippingMethodPoint = z.infer<typeof expenseShippingMethodPointSchema>;
export type ExpenseBundleEfficiencyPoint = z.infer<typeof expenseBundleEfficiencyPointSchema>;
export type ShopSpendRow = z.infer<typeof shopSpendRowSchema>;
export type ExpenseShopsResponse = z.infer<typeof expenseShopsResponseSchema>;
export type ExpenseOrder = z.infer<typeof expenseOrderSchema>;
export type ShopFeeBreakdown = z.infer<typeof shopFeeBreakdownSchema>;
export type ShopExpansionItem = z.infer<typeof shopExpansionItemSchema>;
export type ExpenseUnpaidBreakdown = z.infer<typeof expenseUnpaidBreakdownSchema>;
export type ExpensesOverviewResponse = z.infer<typeof expensesOverviewResponseSchema>;
export type ExpensesTrendsResponse = z.infer<typeof expensesTrendsResponseSchema>;
export type ExpensesShippingResponse = z.infer<typeof expensesShippingResponseSchema>;
export type ShopExpansionResponse = z.infer<typeof shopExpansionResponseSchema>;
