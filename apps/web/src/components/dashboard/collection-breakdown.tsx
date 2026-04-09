import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { Scroller } from "@/components/ui/scroller";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@/components/reui/frame";
import { Skeleton } from "@/components/ui/skeleton";
import type { Category, Currency } from "@myakiba/contracts/shared/types";
import { getCategoryColor } from "@/lib/category-colors";
import Loader from "../loader";

interface CollectionBreakdownProps {
  readonly data: ReadonlyArray<{ name: Category; count: number; totalValue: number | null }>;
  readonly currency: Currency;
  readonly locale: string;
  readonly isLoading?: boolean;
}

export function CollectionBreakdown({
  data,
  currency,
  locale,
  isLoading,
}: CollectionBreakdownProps): React.ReactNode {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const { totalItems, entries } = useMemo(() => {
    if (!data || data.length === 0) {
      return { totalItems: 0, entries: [] };
    }
    const total = data.reduce((acc, curr) => acc + curr.count, 0);
    return {
      totalItems: total,
      entries: data.map((item) => ({
        name: item.name,
        count: item.count,
        value: item.totalValue ?? 0,
        color: getCategoryColor(item.name),
        percentage: total > 0 ? (item.count / total) * 100 : 0,
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

  const categoryCount = entries.length;

  return (
    <Frame className="border-none ring-1 ring-foreground/10 shadow-xs! min-h-[320px]">
      <FrameHeader>
        <FrameTitle className="animate-data-in text-base font-medium">
          {totalItems} {totalItems === 1 ? "item" : "items"} across {categoryCount}{" "}
          {categoryCount === 1 ? "category" : "categories"}
        </FrameTitle>
      </FrameHeader>
      <FramePanel className="space-y-3 shadow-none!">
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No items in collection</p>
        ) : (
          <>
            <TooltipProvider>
              <div className="animate-data-in flex h-2.5 w-full rounded-sm overflow-hidden [--data-in-delay:60ms]">
                {entries.map((entry, index) => {
                  const isOtherHovered = hoveredIndex !== null && hoveredIndex !== index;
                  const minWidth =
                    entry.percentage < 3 && entry.percentage > 0 ? 3 : entry.percentage;
                  return (
                    <Tooltip key={entry.name} open={hoveredIndex === index}>
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
                          <p className="text-xs font-medium">{entry.name}</p>
                          <p className="text-xs">
                            {entry.count} {entry.count === 1 ? "item" : "items"} ·{" "}
                            {entry.percentage.toFixed(1)}%
                          </p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </TooltipProvider>

            <Scroller className="animate-data-in -mx-(--frame-panel-p) max-h-50 flex flex-col gap-0.5 [--data-in-delay:100ms]">
              {entries.map((entry, index) => {
                const isHovered = hoveredIndex === index;
                const isOtherHovered = hoveredIndex !== null && hoveredIndex !== index;
                return (
                  <Link
                    key={entry.name}
                    to="/collection"
                    search={{ category: [entry.name] }}
                    className="flex items-center gap-2.5 px-(--frame-panel-p) py-1 transition-opacity duration-200"
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
                    <span className="text-sm text-foreground truncate">{entry.name}</span>
                    <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                      {entry.count}
                    </span>
                    <span className="ml-auto text-sm tabular-nums font-medium shrink-0">
                      {formatCurrencyFromMinorUnits(entry.value, currency, locale)}
                    </span>
                  </Link>
                );
              })}
            </Scroller>
          </>
        )}
      </FramePanel>
    </Frame>
  );
}
