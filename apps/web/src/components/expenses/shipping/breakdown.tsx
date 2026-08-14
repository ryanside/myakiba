import { useMemo } from "react";
import type { ReactNode } from "react";
import type { ExpensesShippingResponse } from "@myakiba/contracts/expenses/schema";
import type { Currency } from "@myakiba/contracts/shared/types";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { BreakdownChart } from "@/components/breakdown-chart";
import { shippingMethodColor } from "@/components/expenses/chart-utils";
import { ExpensePanel } from "@/components/expenses/dashboard-shell";

export function Breakdown({
  data,
  isLoading,
  isError,
  currency,
  locale,
}: {
  readonly data: ExpensesShippingResponse | undefined;
  readonly isLoading: boolean;
  readonly isError: boolean;
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
  return (
    <ExpensePanel title="Breakdown" className="min-h-80" panelClassName="flex flex-col gap-3">
      <BreakdownChart
        data={entries}
        isLoading={isLoading}
        isError={isError}
        emptyMessage="No shipping spend."
        variant="scrollable"
      >
        {({ item, rowProps, markerProps }) => (
          <div {...rowProps}>
            <div {...markerProps} />
            <span className="truncate text-sm">{item.label}</span>
            <span className="text-xs tabular-nums text-muted-foreground">
              {item.percentage.toFixed(1)}%
            </span>
            <span className="ml-auto shrink-0 text-sm font-medium tabular-nums">
              {formatCurrencyFromMinorUnits(item.spend, currency, locale)}
            </span>
          </div>
        )}
      </BreakdownChart>
    </ExpensePanel>
  );
}
