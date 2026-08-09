import { useMemo } from "react";
import type { ReactNode } from "react";
import type { ExpensesOrdersResponse } from "@myakiba/contracts/expenses/schema";
import type { Currency } from "@myakiba/contracts/shared/types";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import * as BreakdownChart from "@/components/dashboard/breakdown-chart";
import { EXPENSE_CHART_COLORS } from "@/components/expenses/chart-utils";
import { BreakdownSkeleton, ExpensePanel } from "@/components/expenses/dashboard-shell";

const COST_COLORS = {
  orderItems: EXPENSE_CHART_COLORS[0],
  shipping: EXPENSE_CHART_COLORS[1],
  taxes: EXPENSE_CHART_COLORS[2],
  duties: EXPENSE_CHART_COLORS[3],
  tariffs: EXPENSE_CHART_COLORS[4],
  misc: EXPENSE_CHART_COLORS[5],
} as const;

export function Breakdown({
  data,
  isLoading,
  currency,
  locale,
}: {
  readonly data: ExpensesOrdersResponse | undefined;
  readonly isLoading: boolean;
  readonly currency: Currency;
  readonly locale: string;
}): ReactNode {
  const entries = useMemo(
    () =>
      (data?.breakdown ?? []).map((entry) => ({
        ...entry,
        id: entry.key,
        color: COST_COLORS[entry.key],
        tooltip: (
          <div className="flex flex-col gap-0.5">
            <p className="text-xs font-medium">{entry.label}</p>
            <p className="flex items-baseline gap-3 text-xs">
              <span className="tabular-nums">
                {formatCurrencyFromMinorUnits(entry.value, currency, locale)}
              </span>
              <span className="tabular-nums text-muted-foreground">
                {entry.percentage.toFixed(1)}%
              </span>
            </p>
          </div>
        ),
      })),
    [currency, data?.breakdown, locale],
  );
  let content: ReactNode;
  if (isLoading) {
    content = <BreakdownSkeleton />;
  } else if (entries.length === 0) {
    content = (
      <p className="py-4 text-center text-sm text-muted-foreground">No paid order costs.</p>
    );
  } else {
    content = (
      <BreakdownChart.Root entries={entries}>
        <BreakdownChart.Bar />
        <BreakdownChart.Legend>
          {entries.map((entry) => (
            <BreakdownChart.LegendItem key={entry.id} entryId={entry.id}>
              {({ rowProps, markerProps }) => (
                <div {...rowProps}>
                  <div {...markerProps} />
                  <span className="text-sm">{entry.label}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {entry.percentage.toFixed(1)}%
                  </span>
                  <span className="ml-auto shrink-0 text-sm font-medium tabular-nums">
                    {formatCurrencyFromMinorUnits(entry.value, currency, locale)}
                  </span>
                </div>
              )}
            </BreakdownChart.LegendItem>
          ))}
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
