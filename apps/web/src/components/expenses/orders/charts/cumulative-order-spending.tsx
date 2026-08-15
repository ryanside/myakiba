import { useState } from "react";
import type { ReactNode } from "react";
import type { OrderSpendPoint } from "@myakiba/contracts/expenses/schema";
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

type SpendKey = "total" | "orderItems" | "fees";
const keys = ["total", "orderItems", "fees"] as const;
const labels = {
  total: "Total",
  orderItems: "Order Items",
  fees: "Fees",
} satisfies Record<SpendKey, string>;
const config = {
  total: { label: labels.total, colors: { light: [EXPENSE_CHART_COLORS[0]] } },
  orderItems: { label: labels.orderItems, colors: { light: [EXPENSE_CHART_COLORS[1]] } },
  fees: { label: labels.fees, colors: { light: [EXPENSE_CHART_COLORS[2]] } },
} satisfies ChartConfig;
const legend = keys.map((key, index) => ({
  key,
  label: labels[key],
  color: EXPENSE_CHART_COLORS[index],
}));

export function CumulativeOrderSpending({
  data,
  isLoading,
  currency,
  locale,
  selector,
}: {
  readonly data: readonly OrderSpendPoint[];
  readonly isLoading: boolean;
  readonly currency: Currency;
  readonly locale: string;
  readonly selector: ReactNode;
}): ReactNode {
  const [visibleKeys, setVisibleKeys] = useState<ReadonlySet<SpendKey>>(() => new Set(["total"]));
  const toggle = (key: SpendKey): void => {
    setVisibleKeys((current) => {
      if (key === "total") return new Set(["total"]);
      const withoutTotal = new Set([...current].filter((visibleKey) => visibleKey !== "total"));
      if (withoutTotal.has(key) && withoutTotal.size > 1) {
        return new Set([...withoutTotal].filter((visibleKey) => visibleKey !== key));
      }
      return new Set([...withoutTotal, key]);
    });
  };
  return (
    <ChartSection
      title="Cumulative Order Spending"
      selector={selector}
      legend={<ChartSeriesLegend items={legend} visibleKeys={visibleKeys} onToggle={toggle} />}
      isEmpty={!isLoading && data.length === 0}
      emptyMessage="No dated order spending for these filters."
    >
      <EvilAreaChart
        data={data}
        config={config}
        isLoading={isLoading}
        xDataKey="bucket"
        stackType="stacked"
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
                  `${labels[name === "orderItems" || name === "fees" ? name : "total"]}: ${formatCurrencyFromMinorUnits(Number(value), currency, locale)}`
                }
              />
            }
          />
        ) : null}
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
