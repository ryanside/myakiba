import { useMemo } from "react";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@/components/reui/frame";
import { Skeleton } from "@/components/ui/skeleton";
import type { ShopBreakdownEntry } from "@/queries/dashboard";
import type { Currency } from "@myakiba/contracts/shared/types";
import Loader from "../loader";
import * as BreakdownChart from "./breakdown-chart";

const CHART_PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
] as const;

interface ShopBreakdownProps {
  readonly data: readonly ShopBreakdownEntry[] | undefined;
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
  const { totalOrders, entries } = useMemo(() => {
    if (!data || data.length === 0) {
      return { totalOrders: 0, entries: [] };
    }
    const totalOrderCount = data.reduce((acc, s) => acc + s.orderCount, 0);
    return {
      totalOrders: totalOrderCount,
      entries: data.map((s, i) => ({
        ...s,
        id: s.shopName,
        label: s.shopName,
        color: CHART_PALETTE[i % CHART_PALETTE.length],
        percentage: totalOrderCount > 0 ? (s.orderCount / totalOrderCount) * 100 : 0,
        tooltip: (
          <div className="flex flex-col gap-0.5">
            <p className="text-xs font-medium">{s.shopName}</p>
            <p className="text-xs">
              {s.orderCount} {s.orderCount === 1 ? "order" : "orders"} ·{" "}
              {totalOrderCount > 0 ? ((s.orderCount / totalOrderCount) * 100).toFixed(1) : "0.0"}%
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

  const shopCount = entries.length;

  return (
    <Frame spacing="sm" className="border-none ring-1 ring-foreground/10 shadow-xs! min-h-[320px]">
      <FrameHeader>
        <FrameTitle className="animate-data-in text-base font-medium">
          {totalOrders} {totalOrders === 1 ? "order" : "orders"} across {shopCount}{" "}
          {shopCount === 1 ? "shop" : "shops"}
        </FrameTitle>
      </FrameHeader>
      <FramePanel className="space-y-3 shadow-none! border-none m-1 mt-0">
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No orders this month</p>
        ) : (
          <BreakdownChart.Root entries={entries}>
            <BreakdownChart.Bar />
            <BreakdownChart.Legend>
              {entries.map((entry) => (
                <BreakdownChart.LegendItem key={entry.shopName} entryId={entry.id}>
                  {({ rowProps, markerProps }) => (
                    <div {...rowProps}>
                      <div {...markerProps} />
                      <span className="text-sm text-foreground truncate">{entry.shopName}</span>
                      <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                        {entry.orderCount}
                      </span>
                      <span className="ml-auto text-sm tabular-nums font-medium shrink-0">
                        {formatCurrencyFromMinorUnits(entry.totalAmount, currency, locale)}
                      </span>
                    </div>
                  )}
                </BreakdownChart.LegendItem>
              ))}
            </BreakdownChart.Legend>
          </BreakdownChart.Root>
        )}
      </FramePanel>
    </Frame>
  );
}
