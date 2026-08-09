import { db } from "@myakiba/db/client";
import { collection, order } from "@myakiba/db/schema/figure";
import { and, eq, ne } from "drizzle-orm";
import type {
  ExpenseFilterOptions,
  ExpenseFilters,
  ExpenseShopFilters,
  ExpenseShopsResponse,
  ExpensesCollectionResponse,
  ExpensesOrdersResponse,
  ExpensesShippingResponse,
  ShopExpansionResponse,
} from "./model";
import {
  projectCollectionDashboard,
  projectOrdersDashboard,
  projectShippingDashboard,
} from "./lib/expense-projections";
import {
  EMPTY_ORDER_TOTAL,
  getBucket,
  getBundleEfficiencyRows,
  getCollectionCategoryRows,
  getCollectionSummary,
  getOrderAggregates,
  getOwnedItemSeries,
  getShippingMethodTotals,
  getShippingSeries,
  getUnpaidOrderAggregates,
} from "./lib/expense-queries";
import { getScopedShopRows, loadScopedShopExpansion } from "./lib/shop-aggregates";

const ExpensesService = {
  async getExpensesCollection(
    userId: string,
    filters: ExpenseFilters,
  ): Promise<ExpensesCollectionResponse> {
    const bucket = getBucket(filters);
    const [summary, categories, series] = await Promise.all([
      getCollectionSummary(userId, filters),
      getCollectionCategoryRows(userId, filters),
      getOwnedItemSeries(userId, filters, bucket),
    ]);

    return projectCollectionDashboard({ filters, bucket, summary, categories, series });
  },

  async getExpensesOrders(
    userId: string,
    filters: ExpenseFilters,
  ): Promise<ExpensesOrdersResponse> {
    const bucket = getBucket(filters);
    const [totals, series, unpaid] = await Promise.all([
      getOrderAggregates(userId, filters),
      getOrderAggregates(userId, filters, { bucket }),
      getUnpaidOrderAggregates(userId, filters),
    ]);

    return projectOrdersDashboard({
      filters,
      bucket,
      total: totals[0] ?? EMPTY_ORDER_TOTAL,
      series,
      unpaid,
    });
  },

  async getExpensesShipping(
    userId: string,
    filters: ExpenseFilters,
  ): Promise<ExpensesShippingResponse> {
    const bucket = getBucket(filters);
    const [methodTotals, series, bundleRows] = await Promise.all([
      getShippingMethodTotals(userId, filters),
      getShippingSeries(userId, filters, bucket),
      getBundleEfficiencyRows(userId, filters),
    ]);

    return projectShippingDashboard({ filters, bucket, methodTotals, series, bundleRows });
  },

  async getExpensesShops(
    userId: string,
    filters: ExpenseShopFilters,
  ): Promise<ExpenseShopsResponse> {
    return getScopedShopRows(userId, filters);
  },

  async getExpenseFilterOptions(userId: string): Promise<ExpenseFilterOptions> {
    const [collectionShops, orderShops] = await Promise.all([
      db
        .select({ shop: collection.shop })
        .from(collection)
        .where(
          and(
            eq(collection.userId, userId),
            eq(collection.status, "Owned"),
            ne(collection.shop, ""),
          ),
        )
        .groupBy(collection.shop),
      db
        .select({ shop: order.shop })
        .from(order)
        .where(and(eq(order.userId, userId), ne(order.status, "Ordered"), ne(order.shop, "")))
        .groupBy(order.shop),
    ]);
    const shopOptions = [
      ...new Set([...collectionShops, ...orderShops].map(({ shop }) => shop)),
    ].toSorted((left, right) => left.localeCompare(right));

    return { shopOptions };
  },

  async getShopExpansion(
    userId: string,
    shopId: string,
    filters: ExpenseShopFilters,
  ): Promise<ShopExpansionResponse> {
    return loadScopedShopExpansion(userId, shopId, filters);
  },
};

export default ExpensesService;
