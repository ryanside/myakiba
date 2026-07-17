import { useMemo } from "react";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@/components/reui/frame";
import { Skeleton } from "@/components/ui/skeleton";
import type { CostBreakdownData } from "@/queries/dashboard";
import type { Currency } from "@myakiba/contracts/shared/types";
import Loader from "../loader";
import * as BreakdownChart from "./breakdown-chart";

interface CostBreakdownProps {
  readonly data: CostBreakdownData | undefined;
  readonly currency: Currency;
  readonly locale: string;
  readonly isLoading?: boolean;
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

  return (
    <Frame spacing="sm" className="border-none ring-1 ring-foreground/10 shadow-xs! min-h-[320px]">
      <FrameHeader>
        <FrameTitle className="animate-data-in text-base font-medium">
          {formatCurrencyFromMinorUnits(total, currency, locale)} total
        </FrameTitle>
      </FrameHeader>
      <FramePanel className="space-y-3 shadow-none! border-none m-1 mt-0">
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No costs this month</p>
        ) : (
          <BreakdownChart.Root entries={entries}>
            <BreakdownChart.Bar />
            <BreakdownChart.Legend>
              {entries.map((entry) => (
                <BreakdownChart.LegendItem key={entry.key} entryId={entry.id}>
                  {({ rowProps, markerProps }) => (
                    <div {...rowProps}>
                      <div {...markerProps} />
                      <span className="text-sm text-foreground">{entry.label}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {entry.percentage.toFixed(1)}%
                      </span>
                      <span className="ml-auto text-sm tabular-nums font-medium shrink-0">
                        {formatCurrencyFromMinorUnits(entry.amount, currency, locale)}
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
