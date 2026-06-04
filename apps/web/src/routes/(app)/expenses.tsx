import { lazy, Suspense, useCallback } from "react";
import type { ReactNode } from "react";
import { InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import * as z from "zod";
import { expenseFiltersSchema } from "@myakiba/contracts/expenses/schema";
import type { ExpenseFilters } from "@myakiba/contracts/expenses/schema";
import { ExpensesFilters } from "@/components/expenses/filters";
import { OverviewTab } from "@/components/expenses/overview-tab";
import { Section } from "@/components/expenses/section";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import {
  getExpenseFilterOptions,
  getExpensesOverview,
  getExpensesShipping,
  getExpensesTrends,
} from "@/queries/expenses";
import { ThemedBadge } from "@/components/reui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const EXPENSE_TABS = ["overview", "trends", "shipping"] as const;

type ExpenseTab = (typeof EXPENSE_TABS)[number];

const expensesSearchSchema = expenseFiltersSchema.extend({
  tab: z.enum(EXPENSE_TABS).optional(),
});

const TAB_LABELS = {
  overview: "Overview",
  trends: "Trends",
  shipping: "Shipping",
} satisfies Record<ExpenseTab, string>;

const EXPENSES_QUERY_OPTIONS = {
  staleTime: 1000 * 60 * 5,
  retry: false,
} as const;

const TrendsCharts = lazy(() => import("@/components/expenses/charts/trends-charts"));
const ShippingCharts = lazy(() => import("@/components/expenses/charts/shipping-charts"));

export const Route = createFileRoute("/(app)/expenses")({
  validateSearch: (search: Record<string, unknown>) => expensesSearchSchema.parse(search),
  component: RouteComponent,
  head: () => ({
    meta: [{ name: "description", content: "your expenses" }, { title: "Expenses - myakiba" }],
  }),
});

function tabParam(tab: ExpenseTab): ExpenseTab | undefined {
  return tab === "overview" ? undefined : tab;
}

function RouteComponent(): ReactNode {
  const navigate = useNavigate({ from: Route.fullPath });
  const { currency, dateFormat, locale } = useUserPreferences();
  const search = Route.useSearch();
  const tab: ExpenseTab = search.tab ?? "overview";
  const filters: ExpenseFilters = {
    dateStart: search.dateStart,
    dateEnd: search.dateEnd,
    shop: search.shop,
  };

  const filterOptionsQuery = useQuery({
    queryKey: ["expenses", "filter-options"],
    queryFn: getExpenseFilterOptions,
    ...EXPENSES_QUERY_OPTIONS,
  });

  const overviewQuery = useQuery({
    queryKey: ["expenses", "overview", filters],
    queryFn: () => getExpensesOverview(filters),
    enabled: tab === "overview",
    ...EXPENSES_QUERY_OPTIONS,
  });

  const trendsQuery = useQuery({
    queryKey: ["expenses", "trends", filters],
    queryFn: () => getExpensesTrends(filters),
    enabled: tab === "trends",
    ...EXPENSES_QUERY_OPTIONS,
  });

  const shippingQuery = useQuery({
    queryKey: ["expenses", "shipping", filters],
    queryFn: () => getExpensesShipping(filters),
    enabled: tab === "shipping",
    ...EXPENSES_QUERY_OPTIONS,
  });

  const tabQueries = {
    overview: overviewQuery,
    trends: trendsQuery,
    shipping: shippingQuery,
  } as const;
  const activeQuery = tabQueries[tab];

  const setFilters = useCallback(
    (next: ExpenseFilters): void => {
      navigate({
        search: { ...next, tab: tabParam(tab) },
        resetScroll: false,
      });
    },
    [navigate, tab],
  );

  const clearFilters = useCallback((): void => {
    navigate({
      search: { tab: tabParam(tab) },
      resetScroll: false,
    });
  }, [navigate, tab]);

  const setTab = useCallback(
    (nextTab: ExpenseTab): void => {
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
    <div className="mx-auto flex max-w-[88rem] flex-col gap-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl tracking-tight font-heading font-medium">Expenses</h1>
            <ThemedBadge variant="default" className="mt-1">
              New
            </ThemedBadge>
            <Tooltip>
              <TooltipTrigger
                render={
                  <HugeiconsIcon
                    icon={InformationCircleIcon}
                    className="size-4 mt-1 text-muted-foreground"
                  />
                }
              />
              <TooltipContent side="right" sideOffset={12}>
                <div className="flex max-w-xs flex-col gap-2">
                  <div className="flex flex-col gap-1">
                    <h3 className="text-sm font-medium">dev note:</h3>
                    <p className="text-pretty">
                      This is an early implementation of the expense page.
                    </p>
                  </div>
                  <p className="text-pretty">
                    For the most accurate reports, fill in price, shop, dates, shipping method, and
                    fees on your orders and collection items.
                  </p>
                </div>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        <ExpensesFilters
          filters={filters}
          shopOptions={filterOptionsQuery.data?.shopOptions ?? []}
          onChange={setFilters}
          onClear={clearFilters}
        />
      </div>

      {activeQuery.isError && (
        <div className="flex flex-col items-center justify-center h-64 gap-y-4">
          <div className="text-lg font-medium text-destructive">
            Error: {activeQuery.error?.message ?? "Failed to load expenses"}
          </div>
        </div>
      )}

      {!activeQuery.isError ? (
        <Tabs
          value={tab}
          onValueChange={(value) => {
            setTab(value);
          }}
          className="gap-6"
        >
          <TabsList variant="line" className="w-full px-0">
            {EXPENSE_TABS.map((item) => (
              <TabsTrigger key={item} value={item}>
                {TAB_LABELS[item]}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="overview">
            {tab === "overview" ? (
              <OverviewTab
                data={overviewQuery.data}
                isLoading={overviewQuery.isPending}
                filters={filters}
                currency={currency}
                dateFormat={dateFormat}
                locale={locale}
              />
            ) : null}
          </TabsContent>

          <TabsContent value="trends">
            {tab === "trends" ? (
              <Suspense
                fallback={
                  <div className="flex flex-col gap-6">
                    <Section title="spending (each period)" isLoading stats={[]} chartSkeleton />
                    <Section
                      title="average costs (each period)"
                      isLoading
                      stats={[]}
                      chartSkeleton
                    />
                  </div>
                }
              >
                <TrendsCharts
                  data={trendsQuery.data}
                  isLoading={trendsQuery.isPending}
                  currency={currency}
                  locale={locale}
                />
              </Suspense>
            ) : null}
          </TabsContent>

          <TabsContent value="shipping">
            {tab === "shipping" ? (
              <Suspense
                fallback={
                  <div className="flex flex-col gap-6">
                    <Section
                      title="shipping by method (each period)"
                      isLoading
                      stats={[]}
                      chartSkeleton
                    />
                    <Section
                      title="shipping by method (cumulative)"
                      isLoading
                      stats={[]}
                      chartSkeleton
                    />
                  </div>
                }
              >
                <ShippingCharts
                  data={shippingQuery.data}
                  isLoading={shippingQuery.isPending}
                  currency={currency}
                  locale={locale}
                />
              </Suspense>
            ) : null}
          </TabsContent>
        </Tabs>
      ) : null}
    </div>
  );
}
