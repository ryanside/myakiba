import { useMemo } from "react";
import type { ReactNode } from "react";
import type { ShippingMethodPoint } from "@myakiba/contracts/expenses/schema";
import type { Currency, ShippingMethod } from "@myakiba/contracts/shared/types";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { EvilAreaChart } from "@/components/evilcharts/charts/recharts-area-chart";
import { ChartTooltip, ChartTooltipContent } from "@/components/evilcharts/ui/recharts-tooltip";
import { ChartSection, ChartSeriesLegend } from "@/components/expenses/dashboard-shell";
import {
  shippingChartKey,
  shippingMethodChartConfig,
  shippingMethodColor,
  shouldShowExpenseBrush,
  shouldShowExpenseDots,
  toShippingChartRows,
  useShippingMethodVisibility,
} from "@/components/expenses/chart-utils";

export function CumulativeShippingSpendByMethod({
  data,
  isLoading,
  currency,
  locale,
  selector,
  rankedMethods,
}: {
  readonly data: readonly ShippingMethodPoint[];
  readonly isLoading: boolean;
  readonly currency: Currency;
  readonly locale: string;
  readonly selector: ReactNode;
  readonly rankedMethods: readonly ShippingMethod[];
}): ReactNode {
  const chartData = useMemo(() => toShippingChartRows(data), [data]);
  const { methods, visibleKeys, toggle } = useShippingMethodVisibility({
    points: data,
    rankedMethods,
    initialVisibleCount: 1,
  });
  const legend = methods.map((method) => ({
    key: shippingChartKey(method),
    label: method,
    color: shippingMethodColor(method),
  }));

  return (
    <ChartSection
      title="Cumulative Shipping Spend by Method"
      selector={selector}
      legend={<ChartSeriesLegend items={legend} visibleKeys={visibleKeys} onToggle={toggle} />}
      isEmpty={!isLoading && methods.length === 0}
      emptyMessage="No dated shipping spend for these filters."
    >
      <EvilAreaChart
        data={chartData}
        config={shippingMethodChartConfig}
        isLoading={isLoading}
        xDataKey="bucket"
        className="h-full"
      >
        <EvilAreaChart.Grid />
        <EvilAreaChart.XAxis dataKey="bucket" />
        <EvilAreaChart.YAxis
          tickFormatter={(value) => formatCurrencyFromMinorUnits(Number(value), currency, locale)}
        />
        {!isLoading ? (
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value, name) =>
                  `${name === "na" ? "n/a" : String(name)}: ${formatCurrencyFromMinorUnits(Number(value), currency, locale)}`
                }
              />
            }
          />
        ) : null}
        {methods.map((method) =>
          visibleKeys.has(shippingChartKey(method)) ? (
            <EvilAreaChart.Area key={method} dataKey={shippingChartKey(method)} variant="gradient">
              {shouldShowExpenseDots(chartData.length) ? (
                <EvilAreaChart.Dot variant="border" />
              ) : null}
              <EvilAreaChart.ActiveDot variant="colored-border" />
            </EvilAreaChart.Area>
          ) : null,
        )}
        {shouldShowExpenseBrush(chartData.length) ? <EvilAreaChart.Brush /> : null}
      </EvilAreaChart>
    </ChartSection>
  );
}
