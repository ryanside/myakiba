import { useMemo, useState } from "react";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@/components/reui/frame";
import { Skeleton } from "@/components/ui/skeleton";
import type { CostBreakdownData } from "@/queries/dashboard";
import type { Currency } from "@myakiba/contracts/shared/types";
import Loader from "../loader";

interface CostBreakdownProps {
  readonly data: CostBreakdownData | undefined;
  readonly currency: Currency;
  readonly locale: string;
  readonly isLoading?: boolean;
}

const COST_CATEGORIES: ReadonlyArray<{
  readonly key: keyof CostBreakdownData;
  readonly label: string;
}> = [
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

export function CostBreakdown({
  data,
  currency,
  locale,
  isLoading,
}: CostBreakdownProps): React.ReactNode {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const { total, entries } = useMemo(() => {
    if (!data) return { total: 0, entries: [] };

    const allEntries = COST_CATEGORIES.map((cat, i) => ({
      ...cat,
      amount: data[cat.key],
      color: CHART_PALETTE[i],
    }));

    const totalAmount = allEntries.reduce((acc, e) => acc + e.amount, 0);

    return {
      total: totalAmount,
      entries: allEntries
        .filter((e) => e.amount > 0)
        .map((e) => ({
          ...e,
          percentage: totalAmount > 0 ? (e.amount / totalAmount) * 100 : 0,
        })),
    };
  }, [data]);

  if (isLoading) {
    return (
      <Frame className="border-none ring-1 ring-foreground/10 shadow-xs! min-h-[320px]">
        <FrameHeader>
          <Skeleton className="h-4 my-1 w-32" />
        </FrameHeader>
        <FramePanel className="space-y-3 shadow-none!">
          <Loader className="justify-center text-muted" />
        </FramePanel>
      </Frame>
    );
  }

  return (
    <Frame className="border-none ring-1 ring-foreground/10 shadow-xs! min-h-[320px]">
      <FrameHeader>
        <FrameTitle className="animate-data-in text-base font-medium">
          {formatCurrencyFromMinorUnits(total, currency, locale)} total
        </FrameTitle>
      </FrameHeader>
      <FramePanel className="space-y-3 shadow-none!">
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No costs this month</p>
        ) : (
          <>
            <TooltipProvider>
              <div className="animate-data-in flex h-2.5 w-full rounded-sm overflow-hidden [--data-in-delay:60ms]">
                {entries.map((entry, index) => {
                  const isOtherHovered = hoveredIndex !== null && hoveredIndex !== index;
                  const minWidth =
                    entry.percentage < 3 && entry.percentage > 0 ? 3 : entry.percentage;
                  return (
                    <Tooltip key={entry.key} open={hoveredIndex === index}>
                      <TooltipTrigger
                        render={
                          <div
                            className="transition-opacity duration-200 cursor-default first:rounded-l-sm last:rounded-r-sm"
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
                    className="flex items-center gap-2.5 py-1 transition-opacity duration-200 cursor-default"
                    style={{ opacity: isOtherHovered ? 0.4 : 1 }}
                    onMouseEnter={() => setHoveredIndex(index)}
                    onMouseLeave={() => setHoveredIndex(null)}
                  >
                    <div
                      className="h-4 rounded-full shrink-0 transition-all duration-200"
                      style={{
                        backgroundColor: entry.color,
                        width: isHovered ? "0.5rem" : "0.375rem",
                      }}
                    />
                    <span className="text-sm text-foreground">{entry.label}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {entry.percentage.toFixed(1)}%
                    </span>
                    <span className="ml-auto text-sm tabular-nums font-medium shrink-0">
                      {formatCurrencyFromMinorUnits(entry.amount, currency, locale)}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </FramePanel>
    </Frame>
  );
}
