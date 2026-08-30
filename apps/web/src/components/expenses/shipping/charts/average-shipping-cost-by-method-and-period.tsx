import { useMemo } from "react";
import type { ReactNode } from "react";
import type { ShippingMethodPoint } from "@myakiba/contracts/expenses/schema";
import { SHIPPING_METHODS } from "@myakiba/contracts/shared/constants";
import type { Currency, ShippingMethod } from "@myakiba/contracts/shared/types";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { EvilBarChart } from "@/components/evilcharts/charts/recharts-bar-chart";
import { ChartTooltip, ChartTooltipContent } from "@/components/evilcharts/ui/recharts-tooltip";
import { ChartSection, ChartSeriesLegend } from "@/components/expenses/dashboard-shell";
import {
  EXPENSE_CHART_BRUSH_MIN_POINTS,
  EXPENSE_CHART_COLORS,
  shippingMethodChartConfig,
  shippingMethodKeys,
  useShippingMethodVisibility,
} from "@/components/expenses/chart-utils";

export function AverageShippingCostByMethodAndPeriod({
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
    initialVisibleCount: 3,
  });
  const legend = methods.map((method) => ({
    key: shippingMethodKeys[method],
    label: method,
    color: EXPENSE_CHART_COLORS[SHIPPING_METHODS.indexOf(method)] ?? EXPENSE_CHART_COLORS[0],
  }));

  return (
    <ChartSection
      title="Average Shipping Cost by Method and Period"
      selector={selector}
      legend={<ChartSeriesLegend items={legend} visibleKeys={visibleKeys} onToggle={toggle} />}
      isEmpty={!isLoading && methods.length === 0}
      emptyMessage="No dated shipping costs for these filters."
    >
      <EvilBarChart
        data={chartData}
        config={shippingMethodChartConfig}
        isLoading={isLoading}
        xDataKey="bucket"
        className="h-full"
      >
        <EvilBarChart.Grid />
        <EvilBarChart.XAxis dataKey="bucket" />
        <EvilBarChart.YAxis
          tickFormatter={(value) => formatCurrencyFromMinorUnits(Number(value), currency, locale)}
        />
        {isLoading ? null : (
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                formatter={(value, name) =>
                  `${name === "na" ? "n/a" : String(name)}: ${formatCurrencyFromMinorUnits(Number(value), currency, locale)}`
                }
              />
            }
          />
        )}
        {methods.map((method) =>
          visibleKeys.has(shippingMethodKeys[method]) ? (
            <EvilBarChart.Bar
              key={method}
              dataKey={shippingMethodKeys[method]}
              variant="gradient"
            />
          ) : null,
        )}
        {chartData.length >= EXPENSE_CHART_BRUSH_MIN_POINTS ? <EvilBarChart.Brush /> : null}
      </EvilBarChart>
    </ChartSection>
  );
}
