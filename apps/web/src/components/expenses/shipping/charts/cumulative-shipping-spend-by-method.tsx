import { useMemo } from "react";
import type { ReactNode } from "react";
import type { ShippingMethodPoint } from "@myakiba/contracts/expenses/schema";
import { SHIPPING_METHODS } from "@myakiba/contracts/shared/constants";
import type { Currency, ShippingMethod } from "@myakiba/contracts/shared/types";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { EvilAreaChart } from "@/components/evilcharts/charts/recharts-area-chart";
import { ChartTooltip, ChartTooltipContent } from "@/components/evilcharts/ui/recharts-tooltip";
import { ChartSection, ChartSeriesLegend } from "@/components/expenses/dashboard-shell";
import {
  EXPENSE_CHART_BRUSH_MIN_POINTS,
  EXPENSE_CHART_COLORS,
  EXPENSE_CHART_DOT_MAX_POINTS,
  shippingMethodChartConfig,
  shippingMethodKeys,
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
  const chartData = useMemo(
    () =>
      data.map((point) => ({
        bucket: point.bucket,
        na: point.values["n/a"],
        EMS: point.values.EMS,
        SAL: point.values.SAL,
        AIRMAIL: point.values.AIRMAIL,
        SURFACE: point.values.SURFACE,
        FEDEX: point.values.FEDEX,
        DHL: point.values.DHL,
        Colissimo: point.values.Colissimo,
        UPS: point.values.UPS,
        Domestic: point.values.Domestic,
      })),
    [data],
  );
  const { methods, visibleKeys, toggle } = useShippingMethodVisibility({
    points: data,
    rankedMethods,
    initialVisibleCount: 1,
  });
  const legend = methods.map((method) => ({
    key: shippingMethodKeys[method],
    label: method,
    color: EXPENSE_CHART_COLORS[SHIPPING_METHODS.indexOf(method)] ?? EXPENSE_CHART_COLORS[0],
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
          visibleKeys.has(shippingMethodKeys[method]) ? (
            <EvilAreaChart.Area
              key={method}
              dataKey={shippingMethodKeys[method]}
              variant="gradient"
            >
              {chartData.length <= EXPENSE_CHART_DOT_MAX_POINTS ? (
                <EvilAreaChart.Dot variant="border" />
              ) : null}
              <EvilAreaChart.ActiveDot variant="colored-border" />
            </EvilAreaChart.Area>
          ) : null,
        )}
        {chartData.length >= EXPENSE_CHART_BRUSH_MIN_POINTS ? <EvilAreaChart.Brush /> : null}
      </EvilAreaChart>
    </ChartSection>
  );
}
