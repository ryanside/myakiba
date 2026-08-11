import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import { InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
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
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import {
  getExpenseFilterOptions,
  getExpensesCollection,
  getExpensesOrders,
  getExpensesShipping,
} from "@/queries/expenses";

const expensesSearchSchema = expenseFiltersSchema.extend({
  tab: z.enum(EXPENSE_SCOPES).optional(),
});
const TAB_LABELS = {
  collection: "Collection",
  orders: "Orders",
  shipping: "Shipping",
} satisfies Record<ExpenseScope, string>;
const EXPENSES_QUERY_OPTIONS = {
  staleTime: 1000 * 60 * 5,
  retry: false,
} as const;

export const Route = createFileRoute("/(app)/expenses")({
  validateSearch: expensesSearchSchema,
  component: RouteComponent,
  head: () => ({
    meta: [{ name: "description", content: "your expenses" }, { title: "Expenses - myakiba" }],
  }),
});

function tabParam(tab: ExpenseScope): ExpenseScope | undefined {
  return tab === "collection" ? undefined : tab;
}

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
  const filterOptionsQuery = useQuery({
    queryKey: ["expenses", "filter-options"],
    queryFn: getExpenseFilterOptions,
    ...EXPENSES_QUERY_OPTIONS,
  });
  const collectionQuery = useQuery({
    queryKey: ["expenses", "collection", filters],
    queryFn: () => getExpensesCollection(filters),
    enabled: tab === "collection",
    ...EXPENSES_QUERY_OPTIONS,
  });
  const ordersQuery = useQuery({
    queryKey: ["expenses", "orders", filters],
    queryFn: () => getExpensesOrders(filters),
    enabled: tab === "orders",
    ...EXPENSES_QUERY_OPTIONS,
  });
  const shippingQuery = useQuery({
    queryKey: ["expenses", "shipping", filters],
    queryFn: () => getExpensesShipping(filters),
    enabled: tab === "shipping",
    ...EXPENSES_QUERY_OPTIONS,
  });
  const activeQuery = {
    collection: collectionQuery,
    orders: ordersQuery,
    shipping: shippingQuery,
  }[tab];

  const setFilters = useCallback(
    (next: ExpenseFilters): void => {
      navigate({ search: { ...next, tab: tabParam(tab) }, resetScroll: false });
    },
    [navigate, tab],
  );
  const clearFilters = useCallback((): void => {
    navigate({ search: { tab: tabParam(tab) }, resetScroll: false });
  }, [navigate, tab]);
  const setTab = useCallback(
    (nextTab: ExpenseScope): void => {
      navigate({
        search: {
          dateStart: search.dateStart,
          dateEnd: search.dateEnd,
          shop: search.shop,
          tab: tabParam(nextTab),
        },
        resetScroll: false,
      });
    },
    [navigate, search.dateStart, search.dateEnd, search.shop],
  );

  return (
    <div className="mx-auto flex max-w-[88rem] flex-col gap-4" aria-busy={activeQuery.isPending}>
      <output className="sr-only" aria-live="polite">
        {activeQuery.isPending ? `Loading ${TAB_LABELS[tab]} expenses` : ""}
      </output>
      <div className="mb-2 flex items-center gap-2">
        <h1 className="font-heading text-2xl font-medium tracking-tight">Expenses</h1>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="About expense accounting"
                className="mt-0.75"
              >
                <HugeiconsIcon icon={InformationCircleIcon} className="size-4" />
              </Button>
            }
          />
          <TooltipContent side="right" sideOffset={12}>
            <div className="flex max-w-sm flex-col gap-2 text-pretty">
              <div className="flex flex-col gap-1">
                <h3 className="text-sm font-medium">dev note:</h3>
                <p className="text-pretty">This is an early implementation of the expense page.</p>
              </div>
              <p>Owned order items also appear in Collection because they belong to both views.</p>
              <p>Undated expenses do not appear in charts.</p>
            </div>
          </TooltipContent>
        </Tooltip>
      </div>

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
          <div className="flex h-64 items-center justify-center">
            <p className="animate-data-in text-lg font-medium text-destructive">
              Error: {activeQuery.error.message}
            </p>
          </div>
        ) : (
          <>
            <TabsContent value="collection">
              {tab === "collection" ? (
                <CollectionTab
                  data={collectionQuery.data}
                  isLoading={collectionQuery.isPending}
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
