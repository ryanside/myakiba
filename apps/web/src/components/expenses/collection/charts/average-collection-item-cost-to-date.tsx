import type { ReactNode } from "react";
import type { CollectionPeriodPoint } from "@myakiba/contracts/expenses/schema";
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

const config = {
  collectionItems: { label: "Collection Items", colors: { light: [EXPENSE_CHART_COLORS[0]] } },
} satisfies ChartConfig;
const legend = [
  { key: "collectionItems", label: "Collection Items", color: EXPENSE_CHART_COLORS[0] },
] as const;

export function AverageCollectionItemCostToDate({
  data,
  isLoading,
  currency,
  locale,
  selector,
}: {
  readonly data: readonly CollectionPeriodPoint[];
  readonly isLoading: boolean;
  readonly currency: Currency;
  readonly locale: string;
  readonly selector: ReactNode;
}): ReactNode {
  return (
    <ChartSection
      title="Average Collection Item Cost to Date"
      selector={selector}
      legend={<ChartSeriesLegend items={legend} />}
      isEmpty={!isLoading && data.length === 0}
      emptyMessage="No dated collection items for these filters."
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
                formatter={(value) =>
                  `Collection Items: ${formatCurrencyFromMinorUnits(Number(value), currency, locale)}`
                }
              />
            }
          />
        )}
        <EvilAreaChart.Area dataKey="collectionItems" variant="gradient">
          {data.length <= EXPENSE_CHART_DOT_MAX_POINTS ? (
            <EvilAreaChart.Dot variant="border" />
          ) : null}
          <EvilAreaChart.ActiveDot variant="colored-border" />
        </EvilAreaChart.Area>
        {data.length >= EXPENSE_CHART_BRUSH_MIN_POINTS ? <EvilAreaChart.Brush /> : null}
      </EvilAreaChart>
    </ChartSection>
  );
}
