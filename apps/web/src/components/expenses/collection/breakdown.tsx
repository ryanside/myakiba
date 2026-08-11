import { useMemo } from "react";
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type {
  ExpenseFilters,
  ExpensesCollectionResponse,
} from "@myakiba/contracts/expenses/schema";
import type { Currency } from "@myakiba/contracts/shared/types";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import * as BreakdownChart from "@/components/dashboard/breakdown-chart";
import { BreakdownSkeleton, ExpensePanel } from "@/components/expenses/dashboard-shell";
import { getCategoryColor } from "@/lib/category-colors";

export function Breakdown({
  data,
  filters,
  isLoading,
  currency,
  locale,
}: {
  readonly data: ExpensesCollectionResponse | undefined;
  readonly filters: ExpenseFilters;
  readonly isLoading: boolean;
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
  let content: ReactNode;
  if (isLoading) {
    content = <BreakdownSkeleton />;
  } else if (entries.length === 0) {
    content = (
      <p className="py-4 text-center text-sm text-muted-foreground">No collection items.</p>
    );
  } else {
    content = (
      <BreakdownChart.Root entries={entries}>
        <BreakdownChart.Bar />
        <BreakdownChart.Legend className="contents">
          <div className="scroll-fade animate-data-in -mx-(--frame-panel-p) flex max-h-50 flex-col gap-0 overflow-y-auto [--data-in-delay:100ms]">
            {entries.map((entry) => (
              <BreakdownChart.LegendItem
                key={entry.id}
                entryId={entry.id}
                className="flex items-center gap-2.5 px-(--frame-panel-p) py-1 transition-opacity duration-200"
              >
                {({ rowProps, markerProps }) => (
                  <Link
                    to="/collection"
                    search={{
                      category: [entry.category],
                      shop: filters.shop,
                      payDateStart: filters.dateStart,
                      payDateEnd: filters.dateEnd,
                    }}
                    {...rowProps}
                  >
                    <div {...markerProps} />
                    <span className="truncate text-sm">{entry.label}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {entry.count}
                    </span>
                    <span className="ml-auto shrink-0 text-sm font-medium tabular-nums">
                      {formatCurrencyFromMinorUnits(entry.spend, currency, locale)}
                    </span>
                  </Link>
                )}
              </BreakdownChart.LegendItem>
            ))}
          </div>
        </BreakdownChart.Legend>
      </BreakdownChart.Root>
    );
  }

  return (
    <ExpensePanel title="Breakdown" className="min-h-80" panelClassName="flex flex-col gap-3">
      {content}
    </ExpensePanel>
  );
}
