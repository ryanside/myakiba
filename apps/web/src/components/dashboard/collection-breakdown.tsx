import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@/components/reui/frame";
import { Skeleton } from "@/components/ui/skeleton";
import type { Category, Currency } from "@myakiba/contracts/shared/types";
import { getCategoryColor } from "@/lib/category-colors";
import Loader from "../loader";
import * as BreakdownChart from "./breakdown-chart";

interface CollectionBreakdownProps {
  readonly data: readonly { name: Category; count: number; totalValue: number | null }[];
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
  const { totalItems, entries } = useMemo(() => {
    if (!data || data.length === 0) {
      return { totalItems: 0, entries: [] };
    }
    const total = data.reduce((acc, curr) => acc + curr.count, 0);
    return {
      totalItems: total,
      entries: data.map((item) => ({
        id: item.name,
        label: item.name,
        name: item.name,
        count: item.count,
        value: item.totalValue ?? 0,
        color: getCategoryColor(item.name),
        percentage: total > 0 ? (item.count / total) * 100 : 0,
        tooltip: (
          <div className="flex flex-col gap-0.5">
            <p className="text-xs font-medium">{item.name}</p>
            <p className="text-xs">
              {item.count} {item.count === 1 ? "item" : "items"} ·{" "}
              {total > 0 ? ((item.count / total) * 100).toFixed(1) : "0.0"}%
            </p>
          </div>
        ),
      })),
    };
  }, [data]);

  if (isLoading) {
    return (
      <Frame
        spacing="sm"
        className="border-none ring-1 ring-foreground/10 shadow-xs! min-h-[320px]"
      >
        <FrameHeader>
          <Skeleton className="h-4 my-1 w-32" />
        </FrameHeader>
        <FramePanel className="space-y-3 shadow-none! border-none m-1 mt-0">
          <Loader className="justify-center" />
        </FramePanel>
      </Frame>
    );
  }

  const categoryCount = entries.length;

  return (
    <Frame spacing="sm" className="border-none ring-1 ring-foreground/10 shadow-xs! min-h-[320px]">
      <FrameHeader>
        <FrameTitle className="animate-data-in text-base font-medium">
          {totalItems} {totalItems === 1 ? "item" : "items"} across {categoryCount}{" "}
          {categoryCount === 1 ? "category" : "categories"}
        </FrameTitle>
      </FrameHeader>
      <FramePanel className="space-y-3 shadow-none! border-none m-1 mt-0">
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No items in collection</p>
        ) : (
          <BreakdownChart.Root entries={entries}>
            <BreakdownChart.Bar />
            <BreakdownChart.Legend className="contents">
              <div className="scroll-fade overflow-y-auto animate-data-in -mx-(--frame-panel-p) max-h-50 flex flex-col gap-0 [--data-in-delay:100ms]">
                {entries.map((entry) => (
                  <BreakdownChart.LegendItem
                    key={entry.name}
                    entryId={entry.name}
                    className="flex items-center gap-2.5 px-(--frame-panel-p) py-1 transition-opacity duration-200"
                  >
                    {({ rowProps, markerProps }) => (
                      <Link to="/collection" search={{ category: [entry.name] }} {...rowProps}>
                        <div {...markerProps} />
                        <span className="text-sm text-foreground truncate">{entry.name}</span>
                        <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                          {entry.count}
                        </span>
                        <span className="ml-auto text-sm tabular-nums font-medium shrink-0">
                          {formatCurrencyFromMinorUnits(entry.value, currency, locale)}
                        </span>
                      </Link>
                    )}
                  </BreakdownChart.LegendItem>
                ))}
              </div>
            </BreakdownChart.Legend>
          </BreakdownChart.Root>
        )}
      </FramePanel>
    </Frame>
  );
}
