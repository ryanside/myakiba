import { lazy, Suspense } from "react";
import type { ReactNode } from "react";
import type { Currency, DateFormat } from "@myakiba/contracts/shared/types";
import type { ExpenseFilters, ExpensesOverviewResponse } from "@myakiba/contracts/expenses/schema";
import { Section } from "@/components/expenses/section";
import { EMPTY_EXPENSE_TOTALS } from "@/components/expenses/chart-utils";
import { OverviewSummary } from "@/components/expenses/overview-summary";
import { ShopTable } from "@/components/expenses/shop-table";
import { UnpaidCosts } from "@/components/expenses/unpaid-costs";

const ExpenseBreakdownChart = lazy(() => import("@/components/expenses/charts/breakdown-chart"));

export interface OverviewTabProps {
  readonly data: ExpensesOverviewResponse | undefined;
  readonly isLoading: boolean;
  readonly filters: ExpenseFilters;
  readonly currency: Currency;
  readonly dateFormat: DateFormat;
  readonly locale: string;
}

export function OverviewTab({
  data,
  isLoading,
  filters,
  currency,
  dateFormat,
  locale,
}: OverviewTabProps): ReactNode {
  const totals = data?.totals ?? EMPTY_EXPENSE_TOTALS;
  const breakdown = data?.breakdown ?? [];

  return (
    <div className="flex flex-col gap-6">
      <OverviewSummary totals={totals} isLoading={isLoading} currency={currency} locale={locale} />
      <Suspense fallback={<Section title="expense breakdown" isLoading chartSkeleton />}>
        <ExpenseBreakdownChart
          breakdown={breakdown}
          isLoading={isLoading}
          currency={currency}
          locale={locale}
        />
      </Suspense>
      <UnpaidCosts
        breakdown={data?.unpaidBreakdown}
        orders={data?.unpaidOrders}
        orderCount={data?.unpaidOrderCount}
        filters={filters}
        isLoading={isLoading}
        currency={currency}
        locale={locale}
        dateFormat={dateFormat}
      />
      <ShopTable filters={filters} currency={currency} dateFormat={dateFormat} locale={locale} />
    </div>
  );
}
