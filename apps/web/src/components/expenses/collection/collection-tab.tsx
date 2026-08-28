import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { CollectionFilters } from "@myakiba/contracts/collection/schema";
import type {
  ExpenseFilters,
  ExpensesCollectionResponse,
} from "@myakiba/contracts/expenses/schema";
import type { Currency, DateFormat } from "@myakiba/contracts/shared/types";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import type { ChartOption } from "@/components/expenses/dashboard-shell";
import { ChartSelector, KpiStrip } from "@/components/expenses/dashboard-shell";
import { ShopTable } from "@/components/expenses/shop-table";
import { Breakdown } from "./breakdown";
import { CollectionSummary } from "./collection-summary";
import { CollectionSpendingByPeriod } from "./charts/collection-spending-by-period";
import { CumulativeCollectionSpending } from "./charts/cumulative-collection-spending";
import { AverageCollectionItemCostByPeriod } from "./charts/average-collection-item-cost-by-period";
import { AverageCollectionItemCostToDate } from "./charts/average-collection-item-cost-to-date";

const options = [
  { value: "cumulative", label: "Cumulative Spending" },
  { value: "period", label: "Spending by Period" },
  { value: "average-period", label: "Average Cost by Period" },
  { value: "average-to-date", label: "Average Cost to Date" },
] as const satisfies readonly ChartOption<string>[];
export type CollectionChart = (typeof options)[number]["value"];

export default function CollectionTab({
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
  readonly data: ExpensesCollectionResponse | undefined;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly filters: ExpenseFilters;
  readonly currency: Currency;
  readonly locale: string;
  readonly dateFormat: DateFormat;
  readonly chart: CollectionChart;
  readonly onChartChange: (chart: CollectionChart) => void;
}): ReactNode {
  const selector = <ChartSelector value={chart} options={options} onValueChange={onChartChange} />;
  let chartNode: ReactNode;
  switch (chart) {
    case "period":
      chartNode = (
        <CollectionSpendingByPeriod
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
        <CumulativeCollectionSpending
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
        <AverageCollectionItemCostByPeriod
          data={data?.averageCostByPeriod ?? []}
          isLoading={isLoading}
          currency={currency}
          locale={locale}
          selector={selector}
        />
      );
      break;
    case "average-to-date":
      chartNode = (
        <AverageCollectionItemCostToDate
          data={data?.averageCostToDate ?? []}
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
  const collectionSearch = {
    shop: filters.shop,
    payDateStart: filters.dateStart,
    payDateEnd: filters.dateEnd,
  } satisfies CollectionFilters;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid items-stretch gap-4 lg:grid-cols-3">
        <CollectionSummary data={data} isLoading={isLoading} currency={currency} locale={locale} />
        <div className="min-w-0 lg:col-span-2">{chartNode}</div>
      </div>
      <KpiStrip
        isLoading={isLoading}
        items={[
          {
            title: "Collection Items",
            value: (
              <Link to="/collection" search={collectionSearch} className="hover:underline">
                {data?.kpis.itemCount ?? 0}
              </Link>
            ),
          },
          {
            title: "Average Item Cost",
            value: (
              <Link to="/collection" search={collectionSearch} className="hover:underline">
                {formatCurrencyFromMinorUnits(data?.kpis.averageItemCost ?? 0, currency, locale)}
              </Link>
            ),
          },
          {
            title: "Shops",
            value: (
              <Link to="/collection" search={collectionSearch} className="hover:underline">
                {data?.kpis.shopCount ?? 0}
              </Link>
            ),
          },
        ]}
      />
      <div className="grid items-start gap-4 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <ShopTable
            scope="collection"
            filters={filters}
            currency={currency}
            locale={locale}
            dateFormat={dateFormat}
          />
        </div>
        <Breakdown
          data={data}
          filters={filters}
          isLoading={isLoading}
          isError={isError}
          currency={currency}
          locale={locale}
        />
      </div>
    </div>
  );
}
