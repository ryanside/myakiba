import type { ReactNode } from "react";
import type { Currency } from "@myakiba/contracts/shared/types";
import type { ExpensesTrendsResponse } from "@myakiba/contracts/expenses/schema";
import { EMPTY_EXPENSE_TOTALS } from "@/components/expenses/chart-utils";
import AverageSpendOverTimeChart from "@/components/expenses/charts/average-spend-over-time-chart";
import TotalSpendOverTimeChart from "@/components/expenses/charts/total-spend-over-time-chart";

interface TrendsChartsProps {
  readonly data: ExpensesTrendsResponse | undefined;
  readonly isLoading: boolean;
  readonly currency: Currency;
  readonly locale: string;
}

export default function TrendsCharts({
  data,
  isLoading,
  currency,
  locale,
}: TrendsChartsProps): ReactNode {
  const totals = data?.totals ?? EMPTY_EXPENSE_TOTALS;

  return (
    <div className="flex flex-col gap-6">
      <TotalSpendOverTimeChart
        spendOverTime={data?.spendOverTime ?? []}
        cumulativeSpendOverTime={data?.cumulativeSpendOverTime ?? []}
        totals={totals}
        isLoading={isLoading}
        currency={currency}
        locale={locale}
      />
      <AverageSpendOverTimeChart
        averagesOverTime={data?.averagesOverTime ?? []}
        cumulativeAveragesOverTime={data?.cumulativeAveragesOverTime ?? []}
        totals={totals}
        isLoading={isLoading}
        currency={currency}
        locale={locale}
      />
    </div>
  );
}
