import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import type { Currency } from "@myakiba/contracts/shared/types";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { ExpenseLedgerBand, ExpenseLedgerEmpty } from "@/components/expenses/expense-ledger";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import type { MonthlyExpenseTrendEntry } from "@/queries/expenses";

const monthlyExpenseTrendChartConfig = {
  itemSpend: { label: "Items", color: "var(--primary)" },
  feeSpend: { label: "Fees", color: "var(--muted-foreground)" },
} satisfies ChartConfig;

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
        <ExpenseLedgerBand title="monthly expense trend">
          <Skeleton className="h-72 w-full rounded-sm" />
        </ExpenseLedgerBand>
      </section>
    );
  }

  return (
    <section className="border-t border-border">
      <ExpenseLedgerBand title="monthly expense trend">
        {!data || data.length === 0 ? (
          <ExpenseLedgerEmpty>No dated expenses yet</ExpenseLedgerEmpty>
        ) : (
          <ChartContainer config={monthlyExpenseTrendChartConfig} className="h-72 w-full mt-10">
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
                    formatter={(value, _name, item) => {
                      const dataKey = String(item.dataKey ?? "");
                      const series =
                        monthlyExpenseTrendChartConfig[
                          dataKey as keyof typeof monthlyExpenseTrendChartConfig
                        ];
                      const indicatorColor = series?.color ?? String(item.color ?? "");

                      return (
                        <>
                          <div
                            className="size-2.5 shrink-0 rounded-[2px] border-(--color-border) bg-(--color-bg)"
                            style={
                              {
                                "--color-bg": indicatorColor,
                                "--color-border": indicatorColor,
                              } as React.CSSProperties
                            }
                          />
                          <div className="flex flex-1 items-center justify-between gap-4 leading-none">
                            <span className="text-muted-foreground">{series?.label ?? _name}</span>
                            <span className="font-medium tabular-nums text-foreground">
                              {formatCurrencyFromMinorUnits(Number(value), currency, locale)}
                            </span>
                          </div>
                        </>
                      );
                    }}
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
