import { useMemo } from "react";
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type {
  ExpenseFilters,
  ExpensesCollectionResponse,
} from "@myakiba/contracts/expenses/schema";
import type { Currency } from "@myakiba/contracts/shared/types";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { BreakdownChart } from "@/components/breakdown-chart";
import { ExpensePanel } from "@/components/expenses/dashboard-shell";
import { getCategoryColor } from "@/lib/category-colors";

export function Breakdown({
  data,
  filters,
  isLoading,
  isError,
  currency,
  locale,
}: {
  readonly data: ExpensesCollectionResponse | undefined;
  readonly filters: ExpenseFilters;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly currency: Currency;
  readonly locale: string;
}): ReactNode {
  const entries = useMemo(
    () =>
      (data?.breakdown ?? []).map((entry) => ({
        ...entry,
        id: entry.category,
        label: entry.category,
        color: getCategoryColor(entry.category),
        tooltip: (
          <div className="flex flex-col gap-0.5">
            <p className="text-xs font-medium">{entry.category}</p>
            <p className="flex items-baseline gap-3 text-xs">
              <span className="tabular-nums">
                {entry.count} {entry.count === 1 ? "item" : "items"}
              </span>
              <span className="tabular-nums text-muted-foreground">
                {entry.percentage.toFixed(1)}%
              </span>
            </p>
          </div>
        ),
      })),
    [data?.breakdown],
  );
  return (
    <ExpensePanel title="Breakdown" className="min-h-80" panelClassName="flex flex-col gap-3">
      <BreakdownChart
        data={entries}
        isLoading={isLoading}
        isError={isError}
        emptyMessage="No collection items."
        variant="scrollable"
      >
        {({ item, rowProps, markerProps }) => (
          <Link
            to="/collection"
            search={{
              category: [item.category],
              shop: filters.shop,
              payDateStart: filters.dateStart,
              payDateEnd: filters.dateEnd,
            }}
            {...rowProps}
          >
            <div {...markerProps} />
            <span className="truncate text-sm">{item.label}</span>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {item.count}
            </span>
            <span className="ml-auto shrink-0 text-sm font-medium tabular-nums">
              {formatCurrencyFromMinorUnits(item.spend, currency, locale)}
            </span>
          </Link>
        )}
      </BreakdownChart>
    </ExpensePanel>
  );
}
