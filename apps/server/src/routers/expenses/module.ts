import { and, eq, ne } from "drizzle-orm";
import { collection, order } from "@myakiba/db/schema/figure";
import { ok, query } from "@/domain/kernel";
import type { ExpenseFilters, ExpenseShopFilters } from "./model";
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

export const Expenses = {
  filterOptions: query(
    { action: "get_expense_filter_options", failure: "Failed to get expense filter options" },
    async (scope) => {
      const userId = scope.viewer.userId;
      const [collectionShops, orderShops] = await Promise.all([
        scope.tx
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
        scope.tx
          .select({ shop: order.shop })
          .from(order)
          .where(and(eq(order.userId, userId), ne(order.status, "Ordered"), ne(order.shop, "")))
          .groupBy(order.shop),
      ]);
      const shopOptions = [
        ...new Set([...collectionShops, ...orderShops].map(({ shop }) => shop)),
      ].toSorted((left, right) => left.localeCompare(right));

      return ok({ shopOptions });
    },
  ),

  collection: query(
    { action: "get_expenses_collection", failure: "Failed to get collection expenses" },
    async (scope, filters: ExpenseFilters) => {
      scope.log.set({ query: filters });
      const userId = scope.viewer.userId;
      const bucket = getBucket(filters);
      const [summary, categories, series] = await Promise.all([
        getCollectionSummary(scope.tx, userId, filters),
        getCollectionCategoryRows(scope.tx, userId, filters),
        getOwnedItemSeries(scope.tx, userId, filters, bucket),
      ]);

      return ok(projectCollectionDashboard({ filters, bucket, summary, categories, series }));
    },
  ),

  shops: query(
    { action: "get_expenses_shops", failure: "Failed to get expense shops" },
    async (scope, filters: ExpenseShopFilters) => {
      scope.log.set({ query: filters });
      return ok(await getScopedShopRows(scope.tx, scope.viewer.userId, filters));
    },
  ),

  orders: query(
    { action: "get_expenses_orders", failure: "Failed to get order expenses" },
    async (scope, filters: ExpenseFilters) => {
      scope.log.set({ query: filters });
      const userId = scope.viewer.userId;
      const bucket = getBucket(filters);
      const [totals, series, unpaid] = await Promise.all([
        getOrderAggregates(scope.tx, userId, filters),
        getOrderAggregates(scope.tx, userId, filters, { bucket }),
        getUnpaidOrderAggregates(scope.tx, userId, filters),
      ]);

      return ok(
        projectOrdersDashboard({
          filters,
          bucket,
          total: totals[0] ?? EMPTY_ORDER_TOTAL,
          series,
          unpaid,
        }),
      );
    },
  ),

  shipping: query(
    { action: "get_expenses_shipping", failure: "Failed to get expenses shipping" },
    async (scope, filters: ExpenseFilters) => {
      scope.log.set({ query: filters });
      const userId = scope.viewer.userId;
      const bucket = getBucket(filters);
      const [methodTotals, series, bundleRows] = await Promise.all([
        getShippingMethodTotals(scope.tx, userId, filters),
        getShippingSeries(scope.tx, userId, filters, bucket),
        getBundleEfficiencyRows(scope.tx, userId, filters),
      ]);

      return ok(projectShippingDashboard({ filters, bucket, methodTotals, series, bundleRows }));
    },
  ),

  shopExpansion: query(
    { action: "get_expenses_shop_expansion", failure: "Failed to get shop expansion" },
    async (scope, input: { readonly shopId: string; readonly filters: ExpenseShopFilters }) => {
      scope.log.set({ shop: input.shopId, query: input.filters });
      return ok(
        await loadScopedShopExpansion(scope.tx, scope.viewer.userId, input.shopId, input.filters),
      );
    },
  ),
};
