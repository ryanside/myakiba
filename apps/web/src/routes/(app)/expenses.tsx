import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRead } from "@/data/client";
import { expenses } from "@/data/resources/expenses";
import * as z from "zod";
import { EXPENSE_SCOPES, expenseFiltersSchema } from "@myakiba/contracts/expenses/schema";
import type { ExpenseFilters, ExpenseScope } from "@myakiba/contracts/expenses/schema";
import type { CollectionChart } from "@/components/expenses/collection/collection-tab";
import CollectionTab from "@/components/expenses/collection/collection-tab";
import type { OrdersChart } from "@/components/expenses/orders/orders-tab";
import OrdersTab from "@/components/expenses/orders/orders-tab";
import type { ShippingChart } from "@/components/expenses/shipping/shipping-tab";
import ShippingTab from "@/components/expenses/shipping/shipping-tab";
import { ExpensesFilters } from "@/components/expenses/filters";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/page-header";
import { LoadError } from "@/components/page-states";
import { useUserPreferences } from "@/hooks/use-user-preferences";

const expensesSearchSchema = expenseFiltersSchema.extend({
  tab: z.enum(EXPENSE_SCOPES).optional(),
});
const TAB_LABELS = {
  collection: "Collection",
  orders: "Orders",
  shipping: "Shipping",
} satisfies Record<ExpenseScope, string>;

export const Route = createFileRoute("/(app)/expenses")({
  validateSearch: expensesSearchSchema,
  component: RouteComponent,
  head: () => ({
    meta: [{ name: "description", content: "your expenses" }, { title: "Expenses - myakiba" }],
  }),
});

function RouteComponent(): ReactNode {
  const navigate = useNavigate({ from: Route.fullPath });
  const { currency, dateFormat, locale } = useUserPreferences();
  const search = Route.useSearch();
  const tab: ExpenseScope = search.tab ?? "collection";
  const filters: ExpenseFilters = {
    dateStart: search.dateStart,
    dateEnd: search.dateEnd,
    shop: search.shop,
  };
  const [collectionChart, setCollectionChart] = useState<CollectionChart>("cumulative");
  const [ordersChart, setOrdersChart] = useState<OrdersChart>("cumulative");
  const [shippingChart, setShippingChart] = useState<ShippingChart>("period");
  const filterOptionsQuery = useRead(expenses.filterOptions);
  const collectionQuery = useRead(expenses.collection, filters, { enabled: tab === "collection" });
  const ordersQuery = useRead(expenses.orders, filters, { enabled: tab === "orders" });
  const shippingQuery = useRead(expenses.shipping, filters, { enabled: tab === "shipping" });
  const activeQuery = {
    collection: collectionQuery,
    orders: ordersQuery,
    shipping: shippingQuery,
  }[tab];

  const setFilters = useCallback(
    (next: ExpenseFilters): void => {
      navigate({
        search: { ...next, tab: tab === "collection" ? undefined : tab },
        resetScroll: false,
      });
    },
    [navigate, tab],
  );
  const clearFilters = useCallback((): void => {
    navigate({
      search: { tab: tab === "collection" ? undefined : tab },
      resetScroll: false,
    });
  }, [navigate, tab]);
  const setTab = useCallback(
    (nextTab: ExpenseScope): void => {
      navigate({
        search: {
          dateStart: search.dateStart,
          dateEnd: search.dateEnd,
          shop: search.shop,
          tab: nextTab === "collection" ? undefined : nextTab,
        },
        resetScroll: false,
      });
    },
    [navigate, search.dateStart, search.dateEnd, search.shop],
  );

  return (
    <div className="mx-auto flex max-w-[88rem] flex-col gap-8" aria-busy={activeQuery.isPending}>
      <output className="sr-only" aria-live="polite">
        {activeQuery.isPending ? `Loading ${TAB_LABELS[tab]} expenses` : ""}
      </output>

      <PageHeader title="Expenses" />

      <Tabs value={tab} onValueChange={setTab} className="gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <TabsList className="w-full lg:w-fit">
            {EXPENSE_SCOPES.map((item) => (
              <TabsTrigger key={item} value={item}>
                {TAB_LABELS[item]}
              </TabsTrigger>
            ))}
          </TabsList>
          <ExpensesFilters
            filters={filters}
            isLoading={filterOptionsQuery.isPending}
            shopOptions={filterOptionsQuery.data?.shopOptions ?? []}
            onChange={setFilters}
            onClear={clearFilters}
          />
        </div>

        {activeQuery.error ? (
          <LoadError
            title={`Couldn't load ${TAB_LABELS[tab]} expenses`}
            message={activeQuery.error.message}
          />
        ) : (
          <>
            <TabsContent value="collection">
              {tab === "collection" ? (
                <CollectionTab
                  data={collectionQuery.data}
                  isLoading={collectionQuery.isPending}
                  isError={collectionQuery.isError}
                  filters={filters}
                  currency={currency}
                  locale={locale}
                  dateFormat={dateFormat}
                  chart={collectionChart}
                  onChartChange={setCollectionChart}
                />
              ) : null}
            </TabsContent>
            <TabsContent value="orders">
              {tab === "orders" ? (
                <OrdersTab
                  data={ordersQuery.data}
                  isLoading={ordersQuery.isPending}
                  isError={ordersQuery.isError}
                  filters={filters}
                  currency={currency}
                  locale={locale}
                  dateFormat={dateFormat}
                  chart={ordersChart}
                  onChartChange={setOrdersChart}
                />
              ) : null}
            </TabsContent>
            <TabsContent value="shipping">
              {tab === "shipping" ? (
                <ShippingTab
                  data={shippingQuery.data}
                  isLoading={shippingQuery.isPending}
                  isError={shippingQuery.isError}
                  filters={filters}
                  currency={currency}
                  locale={locale}
                  dateFormat={dateFormat}
                  chart={shippingChart}
                  onChartChange={setShippingChart}
                />
              ) : null}
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}
