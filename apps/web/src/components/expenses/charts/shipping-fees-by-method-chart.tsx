import type { ReactNode } from "react";
import type { Currency, ShippingMethod } from "@myakiba/contracts/shared/types";
import type { ExpenseShippingMethodPoint, ExpenseTotals } from "@myakiba/contracts/expenses/schema";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { ActiveDot, Dot, Line } from "@/components/evilcharts/charts/line-chart";
import { shippingMethodChartConfig } from "@/components/expenses/chart-utils";
import { ExpenseMetricLineChart } from "@/components/expenses/charts/metric-line-chart";

type ShippingChartRow = { readonly bucket: string } & Record<ShippingMethod, number>;

function toShippingRow(point: ExpenseShippingMethodPoint): ShippingChartRow {
  return { bucket: point.bucket, ...point.values };
}

function MethodLines({ methods }: { readonly methods: readonly ShippingMethod[] }): ReactNode {
  return methods.map((method) => (
    <Line key={method} dataKey={method} isClickable connectNulls>
      <Dot variant="colored-border" />
      <ActiveDot variant="border" />
    </Line>
  ));
}

export type ShippingFeesByMethodChartVariant = "fees" | "average";

interface ShippingFeesByMethodChartProps {
  readonly variant: ShippingFeesByMethodChartVariant;
  readonly title: string;
  readonly points: readonly ExpenseShippingMethodPoint[];
  readonly usedMethods: readonly ShippingMethod[];
  readonly totals: ExpenseTotals;
  readonly isLoading: boolean;
  readonly currency: Currency;
  readonly locale: string;
}

export default function ShippingFeesByMethodChart({
  variant,
  title,
  points,
  usedMethods,
  totals,
  isLoading,
  currency,
  locale,
}: ShippingFeesByMethodChartProps): ReactNode {
  const stats =
    variant === "fees"
      ? [
          {
            label: "shipping",
            value: formatCurrencyFromMinorUnits(totals.shippingSpend, currency, locale),
          },
        ]
      : [
          {
            label: "shipping avg",
            value: formatCurrencyFromMinorUnits(totals.averageShippingSpend, currency, locale),
          },
        ];

  return (
    <ExpenseMetricLineChart
      title={title}
      config={shippingMethodChartConfig}
      data={points.map(toShippingRow)}
      xDataKey="bucket"
      stats={stats}
      isLoading={isLoading}
      currency={currency}
      locale={locale}
    >
      <MethodLines methods={usedMethods} />
    </ExpenseMetricLineChart>
  );
}
