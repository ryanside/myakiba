import { useMemo } from "react";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@/components/reui/frame";
import { Skeleton } from "@/components/ui/skeleton";
import type { CostBreakdownData } from "@/queries/dashboard";
import type { Currency } from "@myakiba/contracts/shared/types";
import { BreakdownChart } from "@/components/breakdown-chart";

interface CostBreakdownProps {
  readonly data: CostBreakdownData | undefined;
  readonly currency: Currency;
  readonly locale: string;
  readonly isLoading?: boolean;
  readonly isError?: boolean;
}

const COST_CATEGORIES: readonly {
  readonly key: keyof CostBreakdownData;
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

interface CostBreakdownEntry {
  readonly amount: number;
  readonly color: string;
  readonly id: keyof CostBreakdownData;
  readonly key: keyof CostBreakdownData;
  readonly label: string;
  readonly percentage: number;
  readonly tooltip: React.ReactNode;
}

export function CostBreakdown({
  data,
  currency,
  locale,
  isLoading,
  isError = false,
}: CostBreakdownProps): React.ReactNode {
  const { total, entries } = useMemo(() => {
    if (!data) return { total: 0, entries: [] };

    const allEntries = COST_CATEGORIES.map((cat, index) => ({
      ...cat,
      amount: data[cat.key],
      color: CHART_PALETTE[index],
    }));

    const totalAmount = allEntries.reduce((acc, e) => acc + e.amount, 0);
    const chartEntries: CostBreakdownEntry[] = [];

    for (const e of allEntries) {
      if (e.amount <= 0) {
        continue;
      }

      chartEntries.push({
        ...e,
        id: e.key,
        percentage: totalAmount > 0 ? (e.amount / totalAmount) * 100 : 0,
        tooltip: (
          <div className="flex flex-col gap-0.5">
            <p className="text-xs font-medium">{e.label}</p>
            <p className="flex items-baseline gap-3 text-xs">
              <span className="tabular-nums">
                {formatCurrencyFromMinorUnits(e.amount, currency, locale)}
              </span>
              <span className="text-muted-foreground tabular-nums">
                {totalAmount > 0 ? ((e.amount / totalAmount) * 100).toFixed(1) : "0.0"}%
              </span>
            </p>
          </div>
        ),
      });
    }

    return {
      total: totalAmount,
      entries: chartEntries,
    };
  }, [currency, data, locale]);

  return (
    <Frame spacing="sm" className="border-none ring-1 ring-foreground/10 shadow-xs! min-h-[320px]">
      <FrameHeader>
        {isLoading ? (
          <Skeleton className="h-4 my-1 w-32" />
        ) : (
          <FrameTitle className="animate-data-in text-base font-medium">
            {formatCurrencyFromMinorUnits(total, currency, locale)} total
          </FrameTitle>
        )}
      </FrameHeader>
      <FramePanel className="space-y-3 shadow-none! border-none m-1 mt-0">
        <BreakdownChart
          data={entries}
          isLoading={Boolean(isLoading)}
          isError={isError}
          emptyMessage="No costs this month"
        >
          {({ item, rowProps, markerProps }) => (
            <div {...rowProps}>
              <div {...markerProps} />
              <span className="text-sm text-foreground">{item.label}</span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {item.percentage.toFixed(1)}%
              </span>
              <span className="ml-auto text-sm tabular-nums font-medium shrink-0">
                {formatCurrencyFromMinorUnits(item.amount, currency, locale)}
              </span>
            </div>
          )}
        </BreakdownChart>
      </FramePanel>
    </Frame>
  );
}
