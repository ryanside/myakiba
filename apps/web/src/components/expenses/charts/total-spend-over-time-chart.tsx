import type { ReactNode } from "react";
import type { Currency } from "@myakiba/contracts/shared/types";
import type { ExpenseSeriesPoint, ExpenseTotals } from "@myakiba/contracts/expenses/schema";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import type { ChartConfig } from "@/components/evilcharts/ui/chart";
import { ExpenseMetricLineChart } from "@/components/expenses/charts/metric-line-chart";

type SpendChartRow = ExpenseSeriesPoint & Record<string, string | number>;

const spendConfig = {
  totalSpend: { label: "total", colors: { light: ["var(--chart-1)"] } },
  orderSpend: { label: "orders", colors: { light: ["var(--chart-2)"] } },
  collectionItemSpend: { label: "collection items", colors: { light: ["var(--chart-3)"] } },
  orderItemSpend: { label: "order items", colors: { light: ["var(--chart-4)"] } },
  feeSpend: { label: "fees", colors: { light: ["var(--chart-5)"] } },
} satisfies ChartConfig;

const spendLineKeys = [
  "totalSpend",
  "orderSpend",
  "collectionItemSpend",
  "orderItemSpend",
  "feeSpend",
] as const satisfies readonly (keyof SpendChartRow)[];

interface TotalSpendOverTimeChartProps {
  readonly spendOverTime: readonly ExpenseSeriesPoint[];
  readonly cumulativeSpendOverTime: readonly ExpenseSeriesPoint[];
  readonly totals: ExpenseTotals;
  readonly isLoading: boolean;
  readonly currency: Currency;
  readonly locale: string;
}

export default function TotalSpendOverTimeChart({
  spendOverTime,
  cumulativeSpendOverTime,
  totals,
  isLoading,
  currency,
  locale,
}: TotalSpendOverTimeChartProps): ReactNode {
  const stats = [
    { label: "total", value: formatCurrencyFromMinorUnits(totals.totalSpend, currency, locale) },
    { label: "orders", value: formatCurrencyFromMinorUnits(totals.orderSpend, currency, locale) },
    {
      label: "collection items",
      value: formatCurrencyFromMinorUnits(totals.collectionItemSpend, currency, locale),
    },
    {
      label: "order items",
      value: formatCurrencyFromMinorUnits(totals.orderItemSpend, currency, locale),
    },
    { label: "fees", value: formatCurrencyFromMinorUnits(totals.feeSpend, currency, locale) },
  ];

  return (
    <div className="flex flex-col gap-6">
      <ExpenseMetricLineChart
        title="spending (each period)"
        config={spendConfig}
        data={spendOverTime}
        xDataKey="bucket"
        lineDataKeys={spendLineKeys}
        stats={stats}
        isLoading={isLoading}
        currency={currency}
        locale={locale}
      />
      <ExpenseMetricLineChart
        title="spending (cumulative)"
        config={spendConfig}
        data={cumulativeSpendOverTime}
        xDataKey="bucket"
        lineDataKeys={spendLineKeys}
        stats={stats}
        isLoading={isLoading}
        currency={currency}
        locale={locale}
      />
    </div>
  );
}
