import type { ReactNode } from "react";
import type { Currency, ShippingMethod } from "@myakiba/contracts/shared/types";
import type {
  ExpenseBundleEfficiencyPoint,
  ExpenseTotals,
} from "@myakiba/contracts/expenses/schema";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import {
  Bar,
  EvilComposedChart,
  Grid as ComposedGrid,
  Legend as ComposedLegend,
  Tooltip as ComposedTooltip,
  XAxis as ComposedXAxis,
  YAxis as ComposedYAxis,
} from "@/components/evilcharts/charts/composed-chart";
import { Section } from "@/components/expenses/section";
import { shippingMethodChartConfig } from "@/components/expenses/chart-utils";

type BundleChartRow = { readonly itemCountLabel: string } & Record<ShippingMethod, number>;

function toBundleRow(point: ExpenseBundleEfficiencyPoint): BundleChartRow {
  return {
    itemCountLabel: `${point.itemCount} item${point.itemCount === 1 ? "" : "s"}`,
    ...point.values,
  };
}

function MethodBars({ methods }: { readonly methods: readonly ShippingMethod[] }): ReactNode {
  return methods.map((method) => (
    <Bar key={method} dataKey={method} isClickable enableHoverHighlight />
  ));
}

interface BundleEfficiencyChartProps {
  readonly bundleEfficiency: readonly ExpenseBundleEfficiencyPoint[];
  readonly usedMethods: readonly ShippingMethod[];
  readonly totals: ExpenseTotals;
  readonly isLoading: boolean;
  readonly currency: Currency;
  readonly locale: string;
}

export default function BundleEfficiencyChart({
  bundleEfficiency,
  usedMethods,
  totals,
  isLoading,
  currency,
  locale,
}: BundleEfficiencyChartProps): ReactNode {
  const formatCurrency = (value: number): string =>
    formatCurrencyFromMinorUnits(value, currency, locale);
  const formatCurrencyTick = (value: string | number): string =>
    formatCurrencyFromMinorUnits(Number(value), currency, locale);

  return (
    <Section
      title="average shipping by item count"
      isLoading={isLoading}
      stats={[{ label: "paid orders", value: String(totals.paidOrderCount) }]}
    >
      <EvilComposedChart<BundleChartRow, typeof shippingMethodChartConfig>
        data={bundleEfficiency.map(toBundleRow)}
        config={shippingMethodChartConfig}
        isLoading={isLoading}
        xDataKey="itemCountLabel"
        className="h-80"
        barCategoryGap={12}
      >
        <ComposedGrid />
        <ComposedXAxis dataKey="itemCountLabel" />
        <ComposedYAxis tickFormatter={formatCurrencyTick} width={80} />
        <ComposedTooltip valueFormatter={formatCurrency} />
        <ComposedLegend isClickable />
        <MethodBars methods={usedMethods} />
      </EvilComposedChart>
    </Section>
  );
}
