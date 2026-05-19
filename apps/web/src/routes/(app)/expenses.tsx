import type { ReactNode } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { expenseFiltersSchema } from "@myakiba/contracts/expenses/schema";
import type { ExpenseFilters } from "@myakiba/contracts/expenses/schema";
import { ExpenseBreakdownChart } from "@/components/expenses/expense-breakdown-chart";
import { ExpensesActiveFilterChips } from "@/components/expenses/expenses-active-filter-chips";
import { ExpensesFiltersForm } from "@/components/expenses/expenses-filters-form";
import { ExpensesSummaryCards } from "@/components/expenses/expenses-summary-cards";
import { MonthlyExpenseTrend } from "@/components/expenses/monthly-expense-trend";
import { ShopsBreakdownSection } from "@/components/expenses/shops-breakdown-section";
import { TopExpenseDrivers } from "@/components/expenses/top-expense-drivers";
import { UnpaidCostsSection } from "@/components/expenses/unpaid-costs-callout";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import { getExpensesOverview } from "@/queries/expenses";
import { useCallback, useMemo } from "react";

export const Route = createFileRoute("/(app)/expenses")({
  validateSearch: expenseFiltersSchema,
  component: RouteComponent,
  head: () => ({
    meta: [{ name: "description", content: "your expenses" }, { title: "Expenses - myakiba" }],
  }),
});

function activeFilterCount(filters: ExpenseFilters): number {
  return [
    filters.dateStart,
    filters.dateEnd,
    filters.status?.length ? filters.status : undefined,
    filters.shop?.length ? filters.shop : undefined,
  ].filter((value) => value !== undefined).length;
}

function RouteComponent(): ReactNode {
  const navigate = useNavigate({ from: Route.fullPath });
  const filters = Route.useSearch();
  const { currency, locale, dateFormat } = useUserPreferences();
  const overviewFilters = useMemo(
    (): ExpenseFilters => ({
      dateStart: filters.dateStart,
      dateEnd: filters.dateEnd,
      status: filters.status,
      shop: filters.shop,
    }),
    [filters.dateEnd, filters.dateStart, filters.shop, filters.status],
  );
  const { data, error, isError, isPending } = useQuery({
    queryKey: ["expenses", "overview", overviewFilters],
    queryFn: () => getExpensesOverview(overviewFilters),
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  const setFilters = useCallback(
    (next: ExpenseFilters): void => {
      navigate({ search: next, resetScroll: false });
    },
    [navigate],
  );

  const clearFilters = useCallback((): void => {
    navigate({ search: {}, resetScroll: false });
  }, [navigate]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="mb-2 flex items-start gap-3">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-orbitron font-medium">
            expenses <span className="hidden sm:inline"> (・∀・)つ⑩</span>
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground">[early development]</p>
        </div>
        <div className="ml-auto">
          <ExpensesFiltersForm
            currentFilters={filters}
            shopOptions={data?.filterOptions.shopOptions ?? []}
            activeFilterCount={activeFilterCount(filters)}
            onApplyFilters={setFilters}
            onClearFilters={clearFilters}
          />
        </div>
      </div>

      <ExpensesActiveFilterChips
        filters={filters}
        onChange={setFilters}
        onClearAll={clearFilters}
      />

      {isError && (
        <div className="animate-data-in rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Failed to load expenses: {error.message}
        </div>
      )}

      <ExpensesSummaryCards
        summary={data?.summary}
        currency={currency}
        locale={locale}
        isLoading={isPending}
      />

      <UnpaidCostsSection
        breakdown={data?.unpaidBreakdown}
        orders={data?.unpaidOrders}
        orderCount={data?.unpaidOrderCount}
        filters={filters}
        currency={currency}
        locale={locale}
        dateFormat={dateFormat}
        isLoading={isPending}
      />

      <ExpenseBreakdownChart
        data={data?.costBreakdown}
        currency={currency}
        locale={locale}
        isLoading={isPending}
      />

      <MonthlyExpenseTrend
        data={data?.monthlyTrend}
        currency={currency}
        locale={locale}
        isLoading={isPending}
      />

      <ShopsBreakdownSection
        filters={filters}
        setFilters={setFilters}
        currency={currency}
        locale={locale}
        dateFormat={dateFormat}
      />

      <TopExpenseDrivers
        drivers={data?.topDrivers}
        currency={currency}
        locale={locale}
        dateFormat={dateFormat}
        isLoading={isPending}
      />
    </div>
  );
}
