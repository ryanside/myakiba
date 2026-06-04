import type { ReactNode } from "react";
import type { Currency } from "@myakiba/contracts/shared/types";
import type { ExpensesShippingResponse } from "@myakiba/contracts/expenses/schema";
import BundleEfficiencyChart from "@/components/expenses/charts/bundle-efficiency-chart";
import ShippingFeesByMethodChart from "@/components/expenses/charts/shipping-fees-by-method-chart";
import type { ShippingFeesByMethodChartVariant } from "@/components/expenses/charts/shipping-fees-by-method-chart";
import { EMPTY_EXPENSE_TOTALS } from "@/components/expenses/chart-utils";

interface ShippingChartsProps {
  readonly data: ExpensesShippingResponse | undefined;
  readonly isLoading: boolean;
  readonly currency: Currency;
  readonly locale: string;
}

const METHOD_CHARTS: readonly {
  readonly variant: ShippingFeesByMethodChartVariant;
  readonly title: string;
  readonly getPoints: (
    data: ExpensesShippingResponse,
  ) => ExpensesShippingResponse["shippingFeeByMethod"];
}[] = [
  {
    variant: "fees",
    title: "shipping by method (each period)",
    getPoints: (data) => data.shippingFeeByMethod,
  },
  {
    variant: "fees",
    title: "shipping by method (cumulative)",
    getPoints: (data) => data.cumulativeShippingFeeByMethod,
  },
  {
    variant: "average",
    title: "average shipping by method (each period)",
    getPoints: (data) => data.averageShippingFeeByMethod,
  },
  {
    variant: "average",
    title: "average shipping by method (cumulative)",
    getPoints: (data) => data.cumulativeAverageShippingFeeByMethod,
  },
];

export default function ShippingCharts({
  data,
  isLoading,
  currency,
  locale,
}: ShippingChartsProps): ReactNode {
  const totals = data?.totals ?? EMPTY_EXPENSE_TOTALS;
  const usedMethods = data?.usedShippingMethods ?? [];

  return (
    <div className="flex flex-col gap-6">
      {METHOD_CHARTS.map((chart) => (
        <ShippingFeesByMethodChart
          key={chart.title}
          variant={chart.variant}
          title={chart.title}
          points={data ? chart.getPoints(data) : []}
          usedMethods={usedMethods}
          totals={totals}
          isLoading={isLoading}
          currency={currency}
          locale={locale}
        />
      ))}
      <BundleEfficiencyChart
        bundleEfficiency={data?.bundleEfficiency ?? []}
        usedMethods={usedMethods}
        totals={totals}
        isLoading={isLoading}
        currency={currency}
        locale={locale}
      />
    </div>
  );
}
