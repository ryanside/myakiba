import { useMemo } from "react";
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { ExpenseFilters, ExpensesShippingResponse } from "@myakiba/contracts/expenses/schema";
import type { OrderFilters } from "@myakiba/contracts/orders/schema";
import type { Currency, DateFormat } from "@myakiba/contracts/shared/types";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import type { ChartOption } from "@/components/expenses/dashboard-shell";
import { ChartSelector, KpiStrip } from "@/components/expenses/dashboard-shell";
import { ShopTable } from "@/components/expenses/shop-table";
import { Breakdown } from "./breakdown";
import { ShippingSummary } from "./shipping-summary";
import { ShippingSpendByMethodAndPeriod } from "./charts/shipping-spend-by-method-and-period";
import { CumulativeShippingSpendByMethod } from "./charts/cumulative-shipping-spend-by-method";
import { AverageShippingCostByMethodAndPeriod } from "./charts/average-shipping-cost-by-method-and-period";
import { AverageShippingCostByMethodToDate } from "./charts/average-shipping-cost-by-method-to-date";
import { AverageShippingCostByItemCount } from "./charts/average-shipping-cost-by-item-count";

const options = [
  { value: "period", label: "Spend by Method and Period" },
  { value: "cumulative", label: "Cumulative Spend by Method" },
  { value: "average-period", label: "Average Cost by Method and Period" },
  { value: "average-to-date", label: "Average Cost by Method to Date" },
  { value: "item-count", label: "Average Cost by Item Count" },
] as const satisfies readonly ChartOption<string>[];
export type ShippingChart = (typeof options)[number]["value"];

export default function ShippingTab({
  data,
  isLoading,
  isError,
  filters,
  currency,
  locale,
  dateFormat,
  chart,
  onChartChange,
}: {
  readonly data: ExpensesShippingResponse | undefined;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly filters: ExpenseFilters;
  readonly currency: Currency;
  readonly locale: string;
  readonly dateFormat: DateFormat;
  readonly chart: ShippingChart;
  readonly onChartChange: (chart: ShippingChart) => void;
}): ReactNode {
  const selector = <ChartSelector value={chart} options={options} onValueChange={onChartChange} />;
  const rankedMethods = useMemo(
    () => data?.breakdown.map((entry) => entry.method) ?? [],
    [data?.breakdown],
  );
  let chartNode: ReactNode;
  switch (chart) {
    case "period":
      chartNode = (
        <ShippingSpendByMethodAndPeriod
          data={data?.spendByMethodAndPeriod ?? []}
          isLoading={isLoading}
          currency={currency}
          locale={locale}
          selector={selector}
          rankedMethods={rankedMethods}
        />
      );
      break;
    case "cumulative":
      chartNode = (
        <CumulativeShippingSpendByMethod
          data={data?.cumulativeSpendByMethod ?? []}
          isLoading={isLoading}
          currency={currency}
          locale={locale}
          selector={selector}
          rankedMethods={rankedMethods}
        />
      );
      break;
    case "average-period":
      chartNode = (
        <AverageShippingCostByMethodAndPeriod
          data={data?.averageCostByMethodAndPeriod ?? []}
          isLoading={isLoading}
          currency={currency}
          locale={locale}
          selector={selector}
          rankedMethods={rankedMethods}
        />
      );
      break;
    case "average-to-date":
      chartNode = (
        <AverageShippingCostByMethodToDate
          data={data?.averageCostByMethodToDate ?? []}
          isLoading={isLoading}
          currency={currency}
          locale={locale}
          selector={selector}
          rankedMethods={rankedMethods}
        />
      );
      break;
    case "item-count":
      chartNode = (
        <AverageShippingCostByItemCount
          data={data?.averageCostByItemCount ?? []}
          isLoading={isLoading}
          currency={currency}
          locale={locale}
          selector={selector}
          rankedMethods={rankedMethods}
        />
      );
      break;
    default: {
      const exhaustive: never = chart;
      chartNode = exhaustive;
    }
  }
  const paidOrdersSearch = {
    status: ["Paid", "Shipped", "Owned"],
    shop: filters.shop,
    expenseDateStart: filters.dateStart,
    expenseDateEnd: filters.dateEnd,
  } satisfies OrderFilters;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid items-stretch gap-4 lg:grid-cols-3">
        <ShippingSummary data={data} isLoading={isLoading} currency={currency} locale={locale} />
        <div className="min-w-0 lg:col-span-2">{chartNode}</div>
      </div>
      <KpiStrip
        isLoading={isLoading}
        items={[
          {
            title: "Shipping Methods",
            value: (
              <Link to="/orders" search={paidOrdersSearch} className="hover:underline">
                {data?.kpis.methodCount ?? 0}
              </Link>
            ),
          },
          {
            title: "Paid Shipping",
            value: (
              <Link
                to="/orders"
                search={{ ...paidOrdersSearch, shippingFeeMin: 1 }}
                className="hover:underline"
              >
                {data?.kpis.chargedOrderCount ?? 0}
              </Link>
            ),
          },
          {
            title: "Free Shipping",
            value: (
              <Link
                to="/orders"
                search={{ ...paidOrdersSearch, shippingFeeMax: 0 }}
                className="hover:underline"
              >
                {data?.kpis.freeOrderCount ?? 0}
              </Link>
            ),
          },
          {
            title: "Average per Order",
            value: (
              <Link to="/orders" search={paidOrdersSearch} className="hover:underline">
                {formatCurrencyFromMinorUnits(data?.kpis.averageShipping ?? 0, currency, locale)}
              </Link>
            ),
          },
        ]}
      />
      <div className="grid items-start gap-4 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <ShopTable
            scope="shipping"
            filters={filters}
            currency={currency}
            locale={locale}
            dateFormat={dateFormat}
          />
        </div>
        <Breakdown
          data={data}
          isLoading={isLoading}
          isError={isError}
          currency={currency}
          locale={locale}
        />
      </div>
    </div>
  );
}
