import { useMemo } from "react";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@/components/reui/frame";
import { Skeleton } from "@/components/ui/skeleton";
import type { ShopBreakdownEntry } from "@/queries/dashboard";
import type { Currency } from "@myakiba/contracts/shared/types";
import { BreakdownChart } from "@/components/breakdown-chart";

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
  readonly isError?: boolean;
}

export function ShopBreakdown({
  data,
  currency,
  locale,
  isLoading,
  isError = false,
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
            <p className="flex items-baseline gap-3 text-xs">
              <span className="tabular-nums">
                {s.orderCount} {s.orderCount === 1 ? "order" : "orders"}
              </span>
              <span className="text-muted-foreground tabular-nums">
                {totalOrderCount > 0 ? ((s.orderCount / totalOrderCount) * 100).toFixed(1) : "0.0"}%
              </span>
            </p>
          </div>
        ),
      })),
    };
  }, [data]);

  const shopCount = entries.length;

  return (
    <Frame spacing="sm" className="border-none ring-1 ring-foreground/10 shadow-xs! min-h-[320px]">
      <FrameHeader>
        {isLoading ? (
          <Skeleton className="h-4 my-1 w-32" />
        ) : (
          <FrameTitle className="animate-data-in text-base font-medium">
            {totalOrders} {totalOrders === 1 ? "order" : "orders"} across {shopCount}{" "}
            {shopCount === 1 ? "shop" : "shops"}
          </FrameTitle>
        )}
      </FrameHeader>
      <FramePanel className="space-y-3 shadow-none! border-none m-1 mt-0">
        <BreakdownChart
          data={entries}
          isLoading={Boolean(isLoading)}
          isError={isError}
          emptyMessage="No orders this month"
        >
          {({ item, rowProps, markerProps }) => (
            <div {...rowProps}>
              <div {...markerProps} />
              <span className="text-sm text-foreground truncate">{item.shopName}</span>
              <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                {item.orderCount}
              </span>
              <span className="ml-auto text-sm tabular-nums font-medium shrink-0">
                {formatCurrencyFromMinorUnits(item.totalAmount, currency, locale)}
              </span>
            </div>
          )}
        </BreakdownChart>
      </FramePanel>
    </Frame>
  );
}
