import type { ReactNode } from "react";
import type { Currency } from "@myakiba/contracts/shared/types";
import type { ExpenseBreakdownEntry } from "@myakiba/contracts/expenses/schema";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import * as BreakdownChart from "@/components/dashboard/breakdown-chart";
import type { BreakdownChartEntry } from "@/components/dashboard/breakdown-chart";
import { Section } from "@/components/expenses/section";
import { EXPENSE_CHART_COLORS } from "@/components/expenses/chart-utils";

interface ExpenseBreakdownChartProps {
  readonly breakdown: readonly ExpenseBreakdownEntry[];
  readonly isLoading: boolean;
  readonly currency: Currency;
  readonly locale: string;
}

export default function ExpenseBreakdownChart({
  breakdown,
  isLoading,
  currency,
  locale,
}: ExpenseBreakdownChartProps): ReactNode {
  const entries: readonly (BreakdownChartEntry & { readonly amount: number })[] = breakdown.reduce<
    (BreakdownChartEntry & { readonly amount: number })[]
  >((visibleEntries, entry) => {
    if (entry.value <= 0) return visibleEntries;
    const index = visibleEntries.length;
    visibleEntries.push({
      id: entry.key,
      label: entry.label,
      amount: entry.value,
      color: EXPENSE_CHART_COLORS[index % EXPENSE_CHART_COLORS.length],
      percentage: entry.percentage,
      tooltip: (
        <div className="flex flex-col gap-0.5">
          <p className="text-xs font-medium">{entry.label}</p>
          <p className="flex items-baseline gap-3 text-xs">
            <span className="tabular-nums">
              {formatCurrencyFromMinorUnits(entry.value, currency, locale)}
            </span>
            <span className="text-muted-foreground tabular-nums">
              {entry.percentage.toFixed(1)}%
            </span>
          </p>
        </div>
      ),
    });
    return visibleEntries;
  }, []);

  return (
    <Section title="expense breakdown" isLoading={isLoading} chartSkeleton>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No paid expenses yet.</p>
      ) : (
        <BreakdownChart.Root entries={entries}>
          <div className="flex flex-col gap-4">
            <BreakdownChart.Bar />
            <BreakdownChart.Legend>
              {entries.map((entry) => (
                <BreakdownChart.LegendItem key={entry.id} entryId={entry.id}>
                  {({ rowProps, markerProps }) => (
                    <div {...rowProps}>
                      <div {...markerProps} />
                      <span className="text-sm text-foreground">{entry.label}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {entry.percentage.toFixed(1)}%
                      </span>
                      <span className="ml-auto text-sm tabular-nums font-medium shrink-0">
                        {formatCurrencyFromMinorUnits(entry.amount, currency, locale)}
                      </span>
                    </div>
                  )}
                </BreakdownChart.LegendItem>
              ))}
            </BreakdownChart.Legend>
          </div>
        </BreakdownChart.Root>
      )}
    </Section>
  );
}
