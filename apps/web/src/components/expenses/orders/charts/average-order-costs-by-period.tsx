import { useState } from "react";
import type { ReactNode } from "react";
import type { OrderAveragePoint } from "@myakiba/contracts/expenses/schema";
import type { Currency } from "@myakiba/contracts/shared/types";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { EvilBarChart } from "@/components/evilcharts/charts/recharts-bar-chart";
import type { ChartConfig } from "@/components/evilcharts/ui/recharts-chart";
import { ChartTooltip, ChartTooltipContent } from "@/components/evilcharts/ui/recharts-tooltip";
import { ChartSection, ChartSeriesLegend } from "@/components/expenses/dashboard-shell";
import { EXPENSE_CHART_COLORS, shouldShowExpenseBrush } from "@/components/expenses/chart-utils";

type AverageKey = "orderTotal" | "orderItem" | "feesPerOrder";
const keys = ["orderTotal", "orderItem", "feesPerOrder"] as const;
const labels = {
  orderTotal: "Average Order",
  orderItem: "Average Item",
  feesPerOrder: "Average Fees per Order",
} satisfies Record<AverageKey, string>;
const config = {
  orderTotal: { label: labels.orderTotal, colors: { light: [EXPENSE_CHART_COLORS[0]] } },
  orderItem: { label: labels.orderItem, colors: { light: [EXPENSE_CHART_COLORS[1]] } },
  feesPerOrder: { label: labels.feesPerOrder, colors: { light: [EXPENSE_CHART_COLORS[2]] } },
} satisfies ChartConfig;
const legend = keys.map((key, index) => ({
  key,
  label: labels[key],
  color: EXPENSE_CHART_COLORS[index],
}));

export function AverageOrderCostsByPeriod({
  data,
  isLoading,
  currency,
  locale,
  selector,
}: {
  readonly data: readonly OrderAveragePoint[];
  readonly isLoading: boolean;
  readonly currency: Currency;
  readonly locale: string;
  readonly selector: ReactNode;
}): ReactNode {
  const [visibleKeys, setVisibleKeys] = useState<ReadonlySet<AverageKey>>(() => new Set(keys));
  const toggle = (key: AverageKey): void =>
    setVisibleKeys((current) => {
      if (current.has(key)) {
        return current.size > 1
          ? new Set([...current].filter((visibleKey) => visibleKey !== key))
          : current;
      }
      return new Set([...current, key]);
    });
  return (
    <ChartSection
      title="Average Order Costs by Period"
      selector={selector}
      legend={<ChartSeriesLegend items={legend} visibleKeys={visibleKeys} onToggle={toggle} />}
      isEmpty={!isLoading && data.length === 0}
      emptyMessage="No dated paid orders for these filters."
    >
      <EvilBarChart
        data={data}
        config={config}
        isLoading={isLoading}
        xDataKey="bucket"
        className="h-full"
      >
        <EvilBarChart.Grid />
        <EvilBarChart.XAxis dataKey="bucket" />
        <EvilBarChart.YAxis
          tickFormatter={(value) => formatCurrencyFromMinorUnits(Number(value), currency, locale)}
        />
        {!isLoading ? (
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                formatter={(value, name) =>
                  `${labels[name === "orderItem" || name === "feesPerOrder" ? name : "orderTotal"]}: ${formatCurrencyFromMinorUnits(Number(value), currency, locale)}`
                }
              />
            }
          />
        ) : null}
        {keys.map((key) =>
          visibleKeys.has(key) ? (
            <EvilBarChart.Bar key={key} dataKey={key} variant="gradient" />
          ) : null,
        )}
        {shouldShowExpenseBrush(data.length) ? <EvilBarChart.Brush /> : null}
      </EvilBarChart>
    </ChartSection>
  );
}
