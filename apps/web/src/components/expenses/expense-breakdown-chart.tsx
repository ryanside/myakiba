import { useMemo, useState } from "react";
import type { Currency } from "@myakiba/contracts/shared/types";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { ExpenseLedgerBand, ExpenseLedgerEmpty } from "@/components/expenses/expense-ledger";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { ExpenseCostBreakdown } from "@/queries/expenses";

interface ExpenseBreakdownChartProps {
  readonly data: ExpenseCostBreakdown | undefined;
  readonly currency: Currency;
  readonly locale: string;
  readonly isLoading?: boolean;
}

const COST_CATEGORIES: readonly {
  readonly key: keyof ExpenseCostBreakdown;
  readonly label: string;
}[] = [
  { key: "items", label: "Items" },
  { key: "shipping", label: "Shipping" },
  { key: "taxes", label: "Taxes" },
  { key: "duties", label: "Duties" },
  { key: "tariffs", label: "Tariffs" },
  { key: "miscFees", label: "Misc Fees" },
];

const CHART_PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
] as const;

export function ExpenseBreakdownChart({
  data,
  currency,
  locale,
  isLoading,
}: ExpenseBreakdownChartProps): React.ReactNode {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const { entries, total } = useMemo(() => {
    if (!data) return { entries: [], total: 0 };

    const categories = COST_CATEGORIES.map((category, index) => ({
      ...category,
      amount: data[category.key],
      color: CHART_PALETTE[index],
    }));
    const totalAmount = categories.reduce((sum, category) => sum + category.amount, 0);

    return {
      total: totalAmount,
      entries: categories
        .filter((category) => category.amount > 0)
        .map((category) => ({
          ...category,
          percentage: totalAmount > 0 ? (category.amount / totalAmount) * 100 : 0,
        })),
    };
  }, [data]);

  const title = `${formatCurrencyFromMinorUnits(total, currency, locale)} by expense type`;

  if (isLoading) {
    return (
      <section className="border-t border-border">
        <ExpenseLedgerBand title="by expense type" leading>
          <Skeleton className="h-2.5 w-full rounded-sm" />
          <div className="space-y-2 pt-1">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-3/5" />
          </div>
        </ExpenseLedgerBand>
      </section>
    );
  }

  return (
    <section className="border-t border-border">
      <ExpenseLedgerBand title={title} leading>
        {entries.length === 0 ? (
          <ExpenseLedgerEmpty>No expenses yet</ExpenseLedgerEmpty>
        ) : (
          <>
            <TooltipProvider>
              <div className="animate-data-in flex h-2.5 w-full overflow-hidden rounded-sm [--data-in-delay:60ms]">
                {entries.map((entry, index) => {
                  const isOtherHovered = hoveredIndex !== null && hoveredIndex !== index;
                  const minWidth =
                    entry.percentage < 3 && entry.percentage > 0 ? 3 : entry.percentage;

                  return (
                    <Tooltip key={entry.key} open={hoveredIndex === index}>
                      <TooltipTrigger
                        render={
                          <div
                            className="cursor-default transition-opacity duration-200 first:rounded-l-sm last:rounded-r-sm"
                            style={{
                              width: `${minWidth}%`,
                              backgroundColor: entry.color,
                              opacity: isOtherHovered ? 0.3 : 1,
                            }}
                            onMouseEnter={() => setHoveredIndex(index)}
                            onMouseLeave={() => setHoveredIndex(null)}
                          />
                        }
                      />
                      <TooltipContent side="top">
                        <div className="flex flex-col gap-0.5">
                          <p className="text-xs font-medium">{entry.label}</p>
                          <p className="text-xs">
                            {formatCurrencyFromMinorUnits(entry.amount, currency, locale)} ·{" "}
                            {entry.percentage.toFixed(1)}%
                          </p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </TooltipProvider>

            <div className="animate-data-in flex flex-col gap-0.5 [--data-in-delay:100ms]">
              {entries.map((entry, index) => {
                const isHovered = hoveredIndex === index;
                const isOtherHovered = hoveredIndex !== null && hoveredIndex !== index;

                return (
                  <div
                    key={entry.key}
                    className="flex cursor-default items-center gap-2.5 py-1 transition-opacity duration-200"
                    style={{ opacity: isOtherHovered ? 0.4 : 1 }}
                    onMouseEnter={() => setHoveredIndex(index)}
                    onMouseLeave={() => setHoveredIndex(null)}
                  >
                    <div
                      className="h-4 shrink-0 rounded-full transition-[width] duration-200"
                      style={{
                        backgroundColor: entry.color,
                        width: isHovered ? "0.5rem" : "0.375rem",
                      }}
                    />
                    <span className="text-sm text-foreground">{entry.label}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {entry.percentage.toFixed(1)}%
                    </span>
                    <span className="ml-auto shrink-0 text-sm font-medium tabular-nums">
                      {formatCurrencyFromMinorUnits(entry.amount, currency, locale)}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </ExpenseLedgerBand>
    </section>
  );
}
