import { useMemo, useState } from "react";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@/components/reui/frame";
import { Skeleton } from "@/components/ui/skeleton";
import type { ShopBreakdownEntry } from "@/queries/dashboard";
import type { Currency } from "@myakiba/contracts/shared/types";
import Loader from "../loader";

const CHART_PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
] as const;

interface ShopBreakdownProps {
  readonly data: ReadonlyArray<ShopBreakdownEntry> | undefined;
  readonly currency: Currency;
  readonly locale: string;
  readonly isLoading?: boolean;
}

export function ShopBreakdown({
  data,
  currency,
  locale,
  isLoading,
}: ShopBreakdownProps): React.ReactNode {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const { totalOrders, entries } = useMemo(() => {
    if (!data || data.length === 0) {
      return { totalOrders: 0, entries: [] };
    }
    const total = data.reduce((acc, s) => acc + s.totalAmount, 0);
    const orders = data.reduce((acc, s) => acc + s.orderCount, 0);
    return {
      totalOrders: orders,
      entries: data.map((s, i) => ({
        ...s,
        color: CHART_PALETTE[i % CHART_PALETTE.length],
        percentage: total > 0 ? (s.totalAmount / total) * 100 : 0,
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

  const shopCount = entries.length;

  return (
    <Frame className="border-none ring-1 ring-foreground/10 shadow-xs! min-h-[320px]">
      <FrameHeader>
        <FrameTitle className="animate-data-in text-base font-medium">
          {totalOrders} {totalOrders === 1 ? "order" : "orders"} across {shopCount}{" "}
          {shopCount === 1 ? "shop" : "shops"}
        </FrameTitle>
      </FrameHeader>
      <FramePanel className="space-y-3 shadow-none!">
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No orders this month</p>
        ) : (
          <>
            <TooltipProvider>
              <div className="animate-data-in flex h-2.5 w-full rounded-sm overflow-hidden [--data-in-delay:60ms]">
                {entries.map((entry, index) => {
                  const isOtherHovered = hoveredIndex !== null && hoveredIndex !== index;
                  const minWidth =
                    entry.percentage < 3 && entry.percentage > 0 ? 3 : entry.percentage;
                  return (
                    <Tooltip key={entry.shopName} open={hoveredIndex === index}>
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
                          <p className="text-xs font-medium">{entry.shopName}</p>
                          <p className="text-xs">
                            {entry.orderCount} {entry.orderCount === 1 ? "order" : "orders"} ·{" "}
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
                    key={entry.shopName}
                    className="flex items-center gap-2.5 py-1 transition-opacity duration-200 cursor-default"
                    style={{ opacity: isOtherHovered ? 0.4 : 1 }}
                    onMouseEnter={() => setHoveredIndex(index)}
                    onMouseLeave={() => setHoveredIndex(null)}
                  >
                    <div
                      className="h-4 rounded-full shrink-0 transition-[width] duration-200"
                      style={{
                        backgroundColor: entry.color,
                        width: isHovered ? "0.5rem" : "0.375rem",
                      }}
                    />
                    <span className="text-sm text-foreground truncate">{entry.shopName}</span>
                    <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                      {entry.orderCount}
                    </span>
                    <span className="ml-auto text-sm tabular-nums font-medium shrink-0">
                      {formatCurrencyFromMinorUnits(entry.totalAmount, currency, locale)}
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
