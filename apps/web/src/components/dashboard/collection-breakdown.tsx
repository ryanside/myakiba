import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@/components/reui/frame";
import { Skeleton } from "@/components/ui/skeleton";
import type { Category, Currency } from "@myakiba/contracts/shared/types";
import { getCategoryColor } from "@/lib/category-colors";
import { BreakdownChart } from "@/components/breakdown-chart";

interface CollectionBreakdownProps {
  readonly data: readonly { name: Category; count: number; totalValue: number | null }[];
  readonly currency: Currency;
  readonly locale: string;
  readonly isLoading?: boolean;
  readonly isError?: boolean;
}

export function CollectionBreakdown({
  data,
  currency,
  locale,
  isLoading,
  isError = false,
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
            <p className="flex items-baseline gap-3 text-xs">
              <span className="tabular-nums">
                {item.count} {item.count === 1 ? "item" : "items"}
              </span>
              <span className="text-muted-foreground tabular-nums">
                {total > 0 ? ((item.count / total) * 100).toFixed(1) : "0.0"}%
              </span>
            </p>
          </div>
        ),
      })),
    };
  }, [data]);

  const categoryCount = entries.length;

  return (
    <Frame spacing="sm" className="border-none ring-1 ring-foreground/10 shadow-xs! min-h-[320px]">
      <FrameHeader>
        {isLoading ? (
          <Skeleton className="h-4 my-1 w-32" />
        ) : (
          <FrameTitle className="animate-data-in text-base font-medium">
            {totalItems} {totalItems === 1 ? "item" : "items"} across {categoryCount}{" "}
            {categoryCount === 1 ? "category" : "categories"}
          </FrameTitle>
        )}
      </FrameHeader>
      <FramePanel className="space-y-3 shadow-none! border-none m-1 mt-0">
        <BreakdownChart
          data={entries}
          isLoading={Boolean(isLoading)}
          isError={isError}
          emptyMessage="No items in collection"
          variant="scrollable"
        >
          {({ item, rowProps, markerProps }) => (
            <Link to="/collection" search={{ category: [item.name] }} {...rowProps}>
              <div {...markerProps} />
              <span className="text-sm text-foreground truncate">{item.name}</span>
              <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                {item.count}
              </span>
              <span className="ml-auto text-sm tabular-nums font-medium shrink-0">
                {formatCurrencyFromMinorUnits(item.value, currency, locale)}
              </span>
            </Link>
          )}
        </BreakdownChart>
      </FramePanel>
    </Frame>
  );
}
