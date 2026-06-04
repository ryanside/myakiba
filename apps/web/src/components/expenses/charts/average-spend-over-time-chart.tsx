import type { ReactNode } from "react";
import type { Currency } from "@myakiba/contracts/shared/types";
import type { ExpenseAveragePoint, ExpenseTotals } from "@myakiba/contracts/expenses/schema";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import type { ChartConfig } from "@/components/evilcharts/ui/chart";
import { ExpenseMetricLineChart } from "@/components/expenses/charts/metric-line-chart";

type AverageChartRow = ExpenseAveragePoint & Record<string, string | number>;

const averageConfig = {
  averageOrderSpend: { label: "order avg", colors: { light: ["var(--chart-1)"] } },
  averageCollectionItemSpend: {
    label: "collection item avg",
    colors: { light: ["var(--chart-2)"] },
  },
  averageOrderItemSpend: { label: "order item avg", colors: { light: ["var(--chart-3)"] } },
  averageFeeSpend: { label: "fee avg", colors: { light: ["var(--chart-4)"] } },
} satisfies ChartConfig;

const averageLineKeys = [
  "averageOrderSpend",
  "averageCollectionItemSpend",
  "averageOrderItemSpend",
  "averageFeeSpend",
] as const satisfies readonly (keyof AverageChartRow)[];

interface AverageSpendOverTimeChartProps {
  readonly averagesOverTime: readonly ExpenseAveragePoint[];
  readonly cumulativeAveragesOverTime: readonly ExpenseAveragePoint[];
  readonly totals: ExpenseTotals;
  readonly isLoading: boolean;
  readonly currency: Currency;
  readonly locale: string;
}

export default function AverageSpendOverTimeChart({
  averagesOverTime,
  cumulativeAveragesOverTime,
  totals,
  isLoading,
  currency,
  locale,
}: AverageSpendOverTimeChartProps): ReactNode {
  const stats = [
    {
      label: "order avg",
      value: formatCurrencyFromMinorUnits(totals.averageOrderSpend, currency, locale),
    },
    {
      label: "collection item avg",
      value: formatCurrencyFromMinorUnits(totals.averageCollectionItemSpend, currency, locale),
    },
    {
      label: "order item avg",
      value: formatCurrencyFromMinorUnits(totals.averageOrderItemSpend, currency, locale),
    },
    {
      label: "fee avg",
      value: formatCurrencyFromMinorUnits(totals.averageFeeSpend, currency, locale),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <ExpenseMetricLineChart
        title="average costs (each period)"
        config={averageConfig}
        data={averagesOverTime}
        xDataKey="bucket"
        lineDataKeys={averageLineKeys}
        stats={stats}
        isLoading={isLoading}
        currency={currency}
        locale={locale}
      />
      <ExpenseMetricLineChart
        title="average costs (cumulative)"
        config={averageConfig}
        data={cumulativeAveragesOverTime}
        xDataKey="bucket"
        lineDataKeys={averageLineKeys}
        stats={stats}
        isLoading={isLoading}
        currency={currency}
        locale={locale}
      />
    </div>
  );
}
