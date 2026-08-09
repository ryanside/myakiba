import type { ReactNode } from "react";
import type { ExpensesOrdersResponse } from "@myakiba/contracts/expenses/schema";
import type { Currency } from "@myakiba/contracts/shared/types";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { ExpensePanel } from "@/components/expenses/dashboard-shell";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

export function OrderSummary({
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
  const rows = [
    { label: "Order Items", value: data?.summary.orderItems },
    { label: "Fees", value: data?.summary.fees },
  ];

  return (
    <ExpensePanel title="Summary" className="h-full lg:h-[400px]">
      <div className="flex h-full flex-col gap-8" aria-busy={isLoading}>
        <div className="flex flex-col gap-1">
          <p className="text-xs text-muted-foreground">Order Spend</p>
          {isLoading ? (
            <Skeleton className="my-1 h-10 w-40" />
          ) : (
            <p className="animate-data-in text-3xl font-medium tabular-nums">
              {formatCurrencyFromMinorUnits(data?.summary.spend ?? 0, currency, locale)}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-5">
          {rows.map((row) => (
            <div key={row.label} className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-4 text-sm">
                <span>{row.label}</span>
                {isLoading ? (
                  <Skeleton className="h-4 w-20" />
                ) : (
                  <span className="animate-data-in font-medium tabular-nums">
                    {formatCurrencyFromMinorUnits(row.value?.spend ?? 0, currency, locale)}
                  </span>
                )}
              </div>
              {isLoading ? (
                <Skeleton className="h-1 w-full rounded-full" />
              ) : (
                <Progress
                  value={row.value?.percentage ?? 0}
                  className="animate-data-in [--data-in-delay:60ms]"
                />
              )}
              {isLoading ? (
                <Skeleton className="h-3 w-36" />
              ) : (
                <p className="animate-data-in text-xs text-muted-foreground [--data-in-delay:100ms]">
                  {(row.value?.percentage ?? 0).toFixed(1)}%
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </ExpensePanel>
  );
}
