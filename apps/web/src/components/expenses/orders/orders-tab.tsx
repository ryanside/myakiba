import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { ExpenseFilters, ExpensesOrdersResponse } from "@myakiba/contracts/expenses/schema";
import type { OrderFilters } from "@myakiba/contracts/orders/schema";
import type { Currency, DateFormat } from "@myakiba/contracts/shared/types";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import type { ChartOption } from "@/components/expenses/dashboard-shell";
import { ChartSelector, KpiStrip } from "@/components/expenses/dashboard-shell";
import { ShopTable } from "@/components/expenses/shop-table";
import { Breakdown } from "./breakdown";
import { OrderSummary } from "./order-summary";
import { OrderSpendingByPeriod } from "./charts/order-spending-by-period";
import { CumulativeOrderSpending } from "./charts/cumulative-order-spending";
import { AverageOrderCostsByPeriod } from "./charts/average-order-costs-by-period";
import { AverageOrderCostsToDate } from "./charts/average-order-costs-to-date";

const options = [
  { value: "cumulative", label: "Cumulative Spending" },
  { value: "period", label: "Spending by Period" },
  { value: "average-period", label: "Average Costs by Period" },
  { value: "average-to-date", label: "Average Costs to Date" },
] as const satisfies readonly ChartOption<string>[];
export type OrdersChart = (typeof options)[number]["value"];

export default function OrdersTab({
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
  readonly data: ExpensesOrdersResponse | undefined;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly filters: ExpenseFilters;
  readonly currency: Currency;
  readonly locale: string;
  readonly dateFormat: DateFormat;
  readonly chart: OrdersChart;
  readonly onChartChange: (chart: OrdersChart) => void;
}): ReactNode {
  const selector = <ChartSelector value={chart} options={options} onValueChange={onChartChange} />;
  let chartNode: ReactNode;
  switch (chart) {
    case "period":
      chartNode = (
        <OrderSpendingByPeriod
          data={data?.spendingByPeriod ?? []}
          isLoading={isLoading}
          currency={currency}
          locale={locale}
          selector={selector}
        />
      );
      break;
    case "cumulative":
      chartNode = (
        <CumulativeOrderSpending
          data={data?.cumulativeSpending ?? []}
          isLoading={isLoading}
          currency={currency}
          locale={locale}
          selector={selector}
        />
      );
      break;
    case "average-period":
      chartNode = (
        <AverageOrderCostsByPeriod
          data={data?.averageCostsByPeriod ?? []}
          isLoading={isLoading}
          currency={currency}
          locale={locale}
          selector={selector}
        />
      );
      break;
    case "average-to-date":
      chartNode = (
        <AverageOrderCostsToDate
          data={data?.averageCostsToDate ?? []}
          isLoading={isLoading}
          currency={currency}
          locale={locale}
          selector={selector}
        />
      );
      break;
    default: {
      const exhaustive: never = chart;
      chartNode = exhaustive;
    }
  }
  const unpaidValue = formatCurrencyFromMinorUnits(
    data?.kpis.unpaidCommitments ?? 0,
    currency,
    locale,
  );
  const paidOrdersSearch = {
    status: ["Paid", "Shipped", "Owned"],
    shop: filters.shop,
    expenseDateStart: filters.dateStart,
    expenseDateEnd: filters.dateEnd,
  } satisfies OrderFilters;
  const unpaidOrdersSearch = {
    status: ["Ordered"],
    shop: filters.shop,
    expenseDateStart: filters.dateStart,
    expenseDateEnd: filters.dateEnd,
  } satisfies OrderFilters;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid items-stretch gap-4 lg:grid-cols-3">
        <OrderSummary data={data} isLoading={isLoading} currency={currency} locale={locale} />
        <div className="min-w-0 lg:col-span-2">{chartNode}</div>
      </div>
      <KpiStrip
        isLoading={isLoading}
        items={[
          {
            title: "Paid Orders",
            value: (
              <Link
                to="/orders"
                search={paidOrdersSearch}
                className="underline-offset-4 hover:underline"
              >
                {data?.kpis.paidOrderCount ?? 0}
              </Link>
            ),
          },
          {
            title: "Order Items",
            value: (
              <Link
                to="/orders"
                search={paidOrdersSearch}
                className="underline-offset-4 hover:underline"
              >
                {data?.kpis.orderItemCount ?? 0}
              </Link>
            ),
          },
          {
            title: "Unpaid Orders",
            value: (
              <Link
                to="/orders"
                search={unpaidOrdersSearch}
                className="underline-offset-4 hover:underline"
              >
                {data?.kpis.unpaidOrderCount ?? 0}
              </Link>
            ),
          },
          {
            title: "Unpaid",
            value: (
              <Link
                to="/orders"
                search={unpaidOrdersSearch}
                className="underline-offset-4 hover:underline"
              >
                {unpaidValue}
              </Link>
            ),
          },
        ]}
      />
      <div className="grid items-start gap-4 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <ShopTable
            scope="orders"
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
