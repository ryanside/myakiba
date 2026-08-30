import { useState } from "react";
import type { ReactNode } from "react";
import type { OrderAveragePoint } from "@myakiba/contracts/expenses/schema";
import type { Currency } from "@myakiba/contracts/shared/types";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { EvilAreaChart } from "@/components/evilcharts/charts/recharts-area-chart";
import type { ChartConfig } from "@/components/evilcharts/ui/recharts-chart";
import { ChartTooltip, ChartTooltipContent } from "@/components/evilcharts/ui/recharts-tooltip";
import { ChartSection, ChartSeriesLegend } from "@/components/expenses/dashboard-shell";
import {
  EXPENSE_CHART_BRUSH_MIN_POINTS,
  EXPENSE_CHART_COLORS,
  EXPENSE_CHART_DOT_MAX_POINTS,
} from "@/components/expenses/chart-utils";

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

export function AverageOrderCostsToDate({
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
  const [visibleKeys, setVisibleKeys] = useState<ReadonlySet<AverageKey>>(
    () => new Set(["orderTotal"]),
  );
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
      title="Average Order Costs to Date"
      selector={selector}
      legend={<ChartSeriesLegend items={legend} visibleKeys={visibleKeys} onToggle={toggle} />}
      isEmpty={!isLoading && data.length === 0}
      emptyMessage="No dated paid orders for these filters."
    >
      <EvilAreaChart
        data={data}
        config={config}
        isLoading={isLoading}
        xDataKey="bucket"
        className="h-full"
      >
        <EvilAreaChart.Grid />
        <EvilAreaChart.XAxis dataKey="bucket" />
        <EvilAreaChart.YAxis
          tickFormatter={(value) => formatCurrencyFromMinorUnits(Number(value), currency, locale)}
        />
        {isLoading ? null : (
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value, name) =>
                  `${labels[name === "orderItem" || name === "feesPerOrder" ? name : "orderTotal"]}: ${formatCurrencyFromMinorUnits(Number(value), currency, locale)}`
                }
              />
            }
          />
        )}
        {keys.map((key) =>
          visibleKeys.has(key) ? (
            <EvilAreaChart.Area key={key} dataKey={key} variant="gradient">
              {data.length <= EXPENSE_CHART_DOT_MAX_POINTS ? (
                <EvilAreaChart.Dot variant="border" />
              ) : null}
              <EvilAreaChart.ActiveDot variant="colored-border" />
            </EvilAreaChart.Area>
          ) : null,
        )}
        {data.length >= EXPENSE_CHART_BRUSH_MIN_POINTS ? <EvilAreaChart.Brush /> : null}
      </EvilAreaChart>
    </ChartSection>
  );
}
