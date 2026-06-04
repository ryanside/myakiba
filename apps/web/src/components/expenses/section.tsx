import type { ReactNode } from "react";
import { EvilLineChart, Grid } from "@/components/evilcharts/charts/line-chart";
import type { ChartConfig } from "@/components/evilcharts/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";

type LoadingChartRow = { readonly bucket: string; readonly placeholder: number };

const lineChartLoadingConfig = {
  placeholder: { label: "loading", colors: { light: ["var(--chart-1)"] } },
} satisfies ChartConfig;

export interface Stat {
  readonly label: string;
  readonly value: string;
}

export function Section({
  title,
  stats,
  headerAction,
  isLoading = false,
  chartSkeleton = false,
  children,
}: {
  readonly title: string;
  readonly stats?: readonly Stat[];
  readonly headerAction?: ReactNode;
  readonly isLoading?: boolean;
  readonly chartSkeleton?: boolean;
  readonly children?: ReactNode;
}): ReactNode {
  const hasHeaderExtras = stats !== undefined || headerAction !== undefined;

  return (
    <div className="animate-data-in relative overflow-hidden border rounded-lg p-4 space-y-3">
      <div className="relative flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <h3 className="text-sm font-medium font-orbitron lowercase">{title}</h3>
        {hasHeaderExtras ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            {stats !== undefined ? (
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {stats.map((stat) => (
                  <span
                    key={stat.label}
                    className={isLoading ? "inline-flex items-center gap-1.5" : undefined}
                  >
                    {stat.label}:{" "}
                    {isLoading ? (
                      <Skeleton className="h-4 w-14" />
                    ) : (
                      <span className="text-foreground tabular-nums">{stat.value}</span>
                    )}
                  </span>
                ))}
              </div>
            ) : null}
            {headerAction}
          </div>
        ) : null}
      </div>
      <div className="relative">
        {chartSkeleton && isLoading ? (
          <EvilLineChart<LoadingChartRow, typeof lineChartLoadingConfig>
            data={[]}
            config={lineChartLoadingConfig}
            isLoading
            xDataKey="bucket"
            className="h-80"
          >
            <Grid />
          </EvilLineChart>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
