import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import type { Currency } from "@myakiba/contracts/shared/types";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { ExpenseLedgerBand, ExpenseLedgerEmpty } from "@/components/expenses/expense-ledger";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import type { MonthlyExpenseTrendEntry } from "@/queries/expenses";

interface MonthlyExpenseTrendProps {
  readonly data: readonly MonthlyExpenseTrendEntry[] | undefined;
  readonly currency: Currency;
  readonly locale: string;
  readonly isLoading?: boolean;
}

export function MonthlyExpenseTrend({
  data,
  currency,
  locale,
  isLoading,
}: MonthlyExpenseTrendProps): React.ReactNode {
  if (isLoading) {
    return (
      <section className="border-t border-border">
        <ExpenseLedgerBand title="monthly expense trend" leading>
          <Skeleton className="h-72 w-full rounded-sm" />
        </ExpenseLedgerBand>
      </section>
    );
  }

  return (
    <section className="border-t border-border">
      <ExpenseLedgerBand title="monthly expense trend" leading>
        {!data || data.length === 0 ? (
          <ExpenseLedgerEmpty>No dated expenses yet</ExpenseLedgerEmpty>
        ) : (
          <ChartContainer
            config={{
              itemSpend: { label: "Items", color: "var(--chart-1)" },
              feeSpend: { label: "Fees", color: "var(--chart-2)" },
            }}
            className="h-72 w-full"
          >
            <BarChart accessibilityLayer data={[...data]}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={72}
                tickFormatter={(value: number) =>
                  formatCurrencyFromMinorUnits(value, currency, locale)
                }
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name) => (
                      <>
                        <span className="text-muted-foreground">{name}</span>
                        <span className="ml-auto font-medium tabular-nums text-foreground">
                          {formatCurrencyFromMinorUnits(Number(value), currency, locale)}
                        </span>
                      </>
                    )}
                  />
                }
              />
              <Bar dataKey="itemSpend" stackId="spend" fill="var(--color-itemSpend)" radius={3} />
              <Bar dataKey="feeSpend" stackId="spend" fill="var(--color-feeSpend)" radius={3} />
            </BarChart>
          </ChartContainer>
        )}
      </ExpenseLedgerBand>
    </section>
  );
}
