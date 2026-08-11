import type { ReactNode } from "react";
import type { ExpensesShippingResponse } from "@myakiba/contracts/expenses/schema";
import type { Currency } from "@myakiba/contracts/shared/types";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { ExpensePanel } from "@/components/expenses/dashboard-shell";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

export function ShippingSummary({
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
  let methodsContent: ReactNode;
  if (isLoading) {
    methodsContent = ["w-12", "w-16", "w-10"].map((labelWidth) => (
      <div key={labelWidth} className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-4">
          <Skeleton className={`h-4 ${labelWidth}`} />
          <Skeleton className="h-4 w-20" />
        </div>
        <Skeleton className="h-1 w-full rounded-full" />
        <Skeleton className="h-3 w-24" />
      </div>
    ));
  } else if (data?.breakdown.length) {
    methodsContent = data.breakdown.slice(0, 3).map((method, index) => (
      <div
        key={method.method}
        className="animate-data-in flex flex-col gap-1.5"
        style={{ animationDelay: `${index * 30}ms` }}
      >
        <div className="flex items-baseline justify-between gap-4 text-sm">
          <span>{method.method}</span>
          <span className="font-medium tabular-nums">
            {formatCurrencyFromMinorUnits(method.spend, currency, locale)}
          </span>
        </div>
        <Progress value={method.percentage} />
        <p className="text-xs text-muted-foreground">
          {method.orderCount} {method.orderCount === 1 ? "order" : "orders"},{" "}
          {method.percentage.toFixed(1)}%
        </p>
      </div>
    ));
  } else {
    methodsContent = (
      <p className="text-sm text-muted-foreground">No shipping spend for these filters.</p>
    );
  }

  return (
    <ExpensePanel title="Summary" className="h-full lg:h-[400px]">
      <div className="flex h-full flex-col gap-6" aria-busy={isLoading}>
        <div className="flex flex-col gap-1">
          <p className="text-xs text-muted-foreground">Shipping Spend</p>
          {isLoading ? (
            <Skeleton className="my-1 h-10 w-40" />
          ) : (
            <p className="animate-data-in text-3xl font-medium tabular-nums">
              {formatCurrencyFromMinorUnits(data?.summary.spend ?? 0, currency, locale)}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-3.5">{methodsContent}</div>
      </div>
    </ExpensePanel>
  );
}
