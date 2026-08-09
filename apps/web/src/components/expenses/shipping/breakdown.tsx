import { useMemo } from "react";
import type { ReactNode } from "react";
import type { ExpensesShippingResponse } from "@myakiba/contracts/expenses/schema";
import type { Currency } from "@myakiba/contracts/shared/types";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import * as BreakdownChart from "@/components/dashboard/breakdown-chart";
import { shippingMethodColor } from "@/components/expenses/chart-utils";
import { BreakdownSkeleton, ExpensePanel } from "@/components/expenses/dashboard-shell";

export function Breakdown({
  data,
  isLoading,
  currency,
  locale,
}: {
  readonly data: ExpensesShippingResponse | undefined;
  readonly isLoading: boolean;
  readonly currency: Currency;
  readonly locale: string;
}): ReactNode {
  const entries = useMemo(
    () =>
      (data?.breakdown ?? []).map((entry) => ({
        ...entry,
        id: entry.method,
        label: entry.method,
        color: shippingMethodColor(entry.method),
        tooltip: (
          <div className="flex flex-col gap-0.5">
            <p className="text-xs font-medium">{entry.method}</p>
            <p className="flex items-baseline gap-3 text-xs">
              <span className="tabular-nums">
                {formatCurrencyFromMinorUnits(entry.spend, currency, locale)}
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
    content = <p className="py-4 text-center text-sm text-muted-foreground">No shipping spend.</p>;
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
                  <div {...rowProps}>
                    <div {...markerProps} />
                    <span className="truncate text-sm">{entry.label}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {entry.percentage.toFixed(1)}%
                    </span>
                    <span className="ml-auto shrink-0 text-sm font-medium tabular-nums">
                      {formatCurrencyFromMinorUnits(entry.spend, currency, locale)}
                    </span>
                  </div>
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
