import { EXPENSE_BREAKDOWN_KEYS } from "@myakiba/contracts/expenses/schema";
import { db } from "@myakiba/db/client";
import { collection, order } from "@myakiba/db/schema/figure";
import { and, eq, ne } from "drizzle-orm";
import type {
  ExpenseFilterOptions,
  ExpenseFilters,
  ExpenseShopFilters,
  ExpenseShopsResponse,
  ExpensesOverviewResponse,
  ExpensesShippingResponse,
  ExpensesTrendsResponse,
  ShopExpansionResponse,
} from "./model";
import { loadExpenseFacts, mergeExpenseFacts } from "./lib/expense-facts";
import { toExpenseOrder } from "./lib/expense-order";
import {
  buildExpenseTotals,
  deriveTotalsFromSeries,
  projectAveragesResponse,
  projectShippingResponse,
  projectSpendResponse,
} from "./lib/expense-projections";
import {
  getBucket,
  getBundleEfficiencyRows,
  loadNullDateExpenseFacts,
  getOrderAggregates,
  getOwnedItemAggregates,
  getPaidItemAggregates,
  getShippingSeries,
  getUnpaidOrderAggregates,
  getUnpaidOrderPreview,
  UNPAID_ORDER_PREVIEW,
} from "./lib/expense-queries";
import { getShopSpendRows, loadShopExpansion, toShopSpendRow } from "./lib/shop-aggregates";

const ExpensesService = {
  async getExpensesOverview(
    userId: string,
    filters: ExpenseFilters,
  ): Promise<ExpensesOverviewResponse> {
    const [facts, unpaidBreakdown, unpaidPreview] = await Promise.all([
      loadExpenseFacts(userId, filters),
      getUnpaidOrderAggregates(userId, filters),
      getUnpaidOrderPreview(userId, filters, UNPAID_ORDER_PREVIEW),
    ]);
    const totals = buildExpenseTotals(facts);
    const breakdownValues = {
      items: facts.paidItemTotal.itemSpend,
      shipping: facts.orderTotal.shippingSpend,
      taxes: facts.orderTotal.taxesSpend,
      duties: facts.orderTotal.dutiesSpend,
      tariffs: facts.orderTotal.tariffsSpend,
      misc: facts.orderTotal.miscSpend,
    } satisfies Record<(typeof EXPENSE_BREAKDOWN_KEYS)[number], number>;

    return {
      totals,
      breakdown: EXPENSE_BREAKDOWN_KEYS.map((key) => ({
        key,
        label: key,
        value: breakdownValues[key],
        percentage: totals.totalSpend > 0 ? (breakdownValues[key] / totals.totalSpend) * 100 : 0,
      })),
      unpaidBreakdown,
      unpaidOrders: unpaidPreview.rows.map(toExpenseOrder),
      unpaidOrderCount: unpaidPreview.totalCount,
    };
  },

  async getExpensesTrends(
    userId: string,
    filters: ExpenseFilters,
  ): Promise<ExpensesTrendsResponse> {
    const bucket = getBucket(filters);
    const [paidItemSeries, ownedItemSeries, orderSeries, nullDateFacts] = await Promise.all([
      getPaidItemAggregates(userId, filters, { bucket }),
      getOwnedItemAggregates(userId, filters, { bucket }),
      getOrderAggregates(userId, filters, { bucket }),
      filters.dateStart && filters.dateEnd ? null : loadNullDateExpenseFacts(userId, filters),
    ]);
    const seriesFacts = deriveTotalsFromSeries(paidItemSeries, ownedItemSeries, orderSeries);
    const facts = nullDateFacts ? mergeExpenseFacts(seriesFacts, nullDateFacts) : seriesFacts;

    return {
      ...projectSpendResponse({
        bucket,
        ...facts,
        paidItemSeries,
        ownedItemSeries,
        orderSeries,
      }),
      ...projectAveragesResponse({ ownedItemSeries, orderSeries }),
    };
  },

  async getExpensesShipping(
    userId: string,
    filters: ExpenseFilters,
  ): Promise<ExpensesShippingResponse> {
    const bucket = getBucket(filters);
    const [facts, shippingSeries, bundleRows] = await Promise.all([
      loadExpenseFacts(userId, filters),
      getShippingSeries(userId, filters, bucket),
      getBundleEfficiencyRows(userId, filters),
    ]);

    return {
      totals: buildExpenseTotals(facts),
      ...projectShippingResponse({ bucket, shippingSeries, bundleRows }),
    };
  },

  async getExpensesShops(
    userId: string,
    filters: ExpenseShopFilters,
  ): Promise<ExpenseShopsResponse> {
    const rows = await getShopSpendRows(userId, filters);

    return {
      rows: rows.map(toShopSpendRow),
      totalCount: rows[0]?.totalCount ?? 0,
    };
  },

  async getExpenseFilterOptions(userId: string): Promise<ExpenseFilterOptions> {
    const [collectionShops, orderShops] = await Promise.all([
      db
        .select({ shop: collection.shop })
        .from(collection)
        .where(
          and(
            eq(collection.userId, userId),
            ne(collection.status, "Ordered"),
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

    return {
      shopOptions,
    };
  },

  async getShopExpansion(
    userId: string,
    shop: string,
    filters: ExpenseFilters,
  ): Promise<ShopExpansionResponse> {
    const { feeBreakdown, topOrders, items } = await loadShopExpansion(userId, shop, filters);

    return {
      feeBreakdown,
      topOrders: topOrders.map(toExpenseOrder),
      items,
    };
  },
};

export default ExpensesService;
