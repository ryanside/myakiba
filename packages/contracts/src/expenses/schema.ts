import * as z from "zod";
import { CATEGORIES, SHIPPING_METHODS } from "../shared/constants";
import { paginationLimitSchema, paginationOffsetSchema } from "../shared/pagination";

const EXPENSE_BUCKETS = ["month", "year"] as const;
export const EXPENSE_SCOPES = ["collection", "orders", "shipping"] as const;
const EXPENSE_BREAKDOWN_KEYS = [
  "orderItems",
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
  scope: z.enum(EXPENSE_SCOPES),
  search: z.string().optional(),
  limit: paginationLimitSchema.optional(),
  offset: paginationOffsetSchema.optional(),
});

export const expenseFilterOptionsSchema = z.object({
  shopOptions: z.array(z.string()),
});

const contributionSchema = z.object({
  spend: z.number(),
  percentage: z.number(),
  count: z.number(),
});

const collectionPeriodPointSchema = z.object({
  bucket: z.string(),
  collectionItems: z.number(),
});

const orderSpendPointSchema = z.object({
  bucket: z.string(),
  total: z.number(),
  orderItems: z.number(),
  fees: z.number(),
});

const orderAveragePointSchema = z.object({
  bucket: z.string(),
  orderTotal: z.number(),
  orderItem: z.number(),
  feesPerOrder: z.number(),
});

const shippingMethodPointSchema = z.object({
  bucket: z.string(),
  values: z.record(z.enum(SHIPPING_METHODS), z.number()),
});

const shippingItemCountPointSchema = z.object({
  itemCount: z.number(),
  values: z.record(z.enum(SHIPPING_METHODS), z.number()),
});

const categoryBreakdownEntrySchema = z.object({
  category: z.enum(CATEGORIES),
  count: z.number(),
  spend: z.number(),
  percentage: z.number(),
});

const costBreakdownEntrySchema = z.object({
  key: z.enum(EXPENSE_BREAKDOWN_KEYS),
  label: z.string(),
  value: z.number(),
  percentage: z.number(),
});

const shippingMethodBreakdownEntrySchema = z.object({
  method: z.enum(SHIPPING_METHODS),
  spend: z.number(),
  percentage: z.number(),
  orderCount: z.number(),
});

export const expensesCollectionResponseSchema = z.object({
  summary: z.object({
    spend: z.number(),
    orderLinked: contributionSchema,
    standalone: contributionSchema,
  }),
  kpis: z.object({
    itemCount: z.number(),
    averageItemCost: z.number(),
    shopCount: z.number(),
  }),
  breakdown: z.array(categoryBreakdownEntrySchema),
  spendingByPeriod: z.array(collectionPeriodPointSchema),
  cumulativeSpending: z.array(collectionPeriodPointSchema),
  averageCostByPeriod: z.array(collectionPeriodPointSchema),
  averageCostToDate: z.array(collectionPeriodPointSchema),
});

export const expensesOrdersResponseSchema = z.object({
  summary: z.object({
    spend: z.number(),
    orderItems: contributionSchema.omit({ count: true }),
    fees: contributionSchema.omit({ count: true }),
  }),
  kpis: z.object({
    paidOrderCount: z.number(),
    orderItemCount: z.number(),
    unpaidOrderCount: z.number(),
    unpaidCommitments: z.number(),
  }),
  breakdown: z.array(costBreakdownEntrySchema),
  spendingByPeriod: z.array(orderSpendPointSchema),
  cumulativeSpending: z.array(orderSpendPointSchema),
  averageCostsByPeriod: z.array(orderAveragePointSchema),
  averageCostsToDate: z.array(orderAveragePointSchema),
});

export const expensesShippingResponseSchema = z.object({
  summary: z.object({
    spend: z.number(),
  }),
  kpis: z.object({
    methodCount: z.number(),
    chargedOrderCount: z.number(),
    freeOrderCount: z.number(),
    averageShipping: z.number(),
  }),
  breakdown: z.array(shippingMethodBreakdownEntrySchema),
  spendByMethodAndPeriod: z.array(shippingMethodPointSchema),
  cumulativeSpendByMethod: z.array(shippingMethodPointSchema),
  averageCostByMethodAndPeriod: z.array(shippingMethodPointSchema),
  averageCostByMethodToDate: z.array(shippingMethodPointSchema),
  averageCostByItemCount: z.array(shippingItemCountPointSchema),
});

const baseShopRowSchema = z.object({
  id: z.string(),
  shop: z.string(),
  spend: z.number(),
  share: z.number(),
});

const collectionShopRowSchema = baseShopRowSchema.extend({
  scope: z.literal("collection"),
  itemCount: z.number(),
  averageItemCost: z.number(),
});

const ordersShopRowSchema = baseShopRowSchema.extend({
  scope: z.literal("orders"),
  orderCount: z.number(),
  averageOrder: z.number(),
  orderItemCount: z.number(),
  fees: z.number(),
});

const shippingShopRowSchema = baseShopRowSchema.extend({
  scope: z.literal("shipping"),
  orderCount: z.number(),
  averageShipping: z.number(),
});

export const expenseShopRowSchema = z.discriminatedUnion("scope", [
  collectionShopRowSchema,
  ordersShopRowSchema,
  shippingShopRowSchema,
]);

export const expenseShopsResponseSchema = z.object({
  rows: z.array(expenseShopRowSchema),
  totalCount: z.number(),
});

const expenseOrderSchema = z.object({
  orderId: z.string(),
  title: z.string(),
  shop: z.string(),
  expenseDate: z.string().nullable(),
  images: z.array(z.string()),
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

const collectionShopExpansionSchema = z.object({
  scope: z.literal("collection"),
  items: z.array(shopExpansionItemSchema),
});

const ordersShopExpansionSchema = z.object({
  scope: z.literal("orders"),
  feeBreakdown: shopFeeBreakdownSchema,
  topOrders: z.array(expenseOrderSchema),
});

const shippingShopExpansionSchema = z.object({
  scope: z.literal("shipping"),
  methods: z.array(shippingMethodBreakdownEntrySchema.omit({ percentage: true })),
  topOrders: z.array(expenseOrderSchema),
});

export const shopExpansionResponseSchema = z.discriminatedUnion("scope", [
  collectionShopExpansionSchema,
  ordersShopExpansionSchema,
  shippingShopExpansionSchema,
]);

export type ExpenseScope = (typeof EXPENSE_SCOPES)[number];
export type ExpenseFilters = z.infer<typeof expenseFiltersSchema>;
export type ExpenseShopFilters = z.infer<typeof expenseShopFiltersSchema>;
export type ExpenseFilterOptions = z.infer<typeof expenseFilterOptionsSchema>;
export type ExpenseBucket = (typeof EXPENSE_BUCKETS)[number];
export type CollectionPeriodPoint = z.infer<typeof collectionPeriodPointSchema>;
export type OrderSpendPoint = z.infer<typeof orderSpendPointSchema>;
export type OrderAveragePoint = z.infer<typeof orderAveragePointSchema>;
export type ShippingMethodPoint = z.infer<typeof shippingMethodPointSchema>;
export type ShippingItemCountPoint = z.infer<typeof shippingItemCountPointSchema>;
export type ExpenseShopRow = z.infer<typeof expenseShopRowSchema>;
export type ExpenseShopsResponse = z.infer<typeof expenseShopsResponseSchema>;
export type ExpenseOrder = z.infer<typeof expenseOrderSchema>;
export type ExpensesCollectionResponse = z.infer<typeof expensesCollectionResponseSchema>;
export type ExpensesOrdersResponse = z.infer<typeof expensesOrdersResponseSchema>;
export type ExpensesShippingResponse = z.infer<typeof expensesShippingResponseSchema>;
export type ShopExpansionResponse = z.infer<typeof shopExpansionResponseSchema>;
