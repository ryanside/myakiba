import { Fragment, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const MIN_VISIBLE_SEGMENT_PERCENTAGE = 3;

export interface BreakdownChartData {
  readonly id: string;
  readonly label: string;
  readonly color: string;
  readonly percentage: number;
  readonly tooltip: ReactNode;
}

interface BreakdownChartRenderState<TData extends BreakdownChartData> {
  readonly item: TData;
  readonly isHovered: boolean;
  readonly isOtherHovered: boolean;
  readonly rowProps: {
    readonly className: string;
    readonly style: CSSProperties;
    readonly onMouseEnter: () => void;
    readonly onMouseLeave: () => void;
  };
  readonly markerProps: {
    readonly className: string;
    readonly style: CSSProperties;
  };
}

interface BreakdownChartProps<TData extends BreakdownChartData> {
  readonly data: readonly TData[] | undefined;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly children?: (state: BreakdownChartRenderState<TData>) => ReactNode;
  readonly emptyMessage?: ReactNode;
  readonly errorMessage?: ReactNode;
  readonly variant?: "default" | "scrollable";
}

const CHART_VARIANTS = {
  default: {
    legendClassName: "animate-data-in flex flex-col gap-0.5 [--data-in-delay:100ms]",
    rowClassName: "flex cursor-default items-center gap-2.5 py-1 transition-opacity duration-200",
    skeletonLegendClassName: "flex flex-col gap-0.5",
  },
  scrollable: {
    legendClassName:
      "animate-data-in -mx-(--frame-panel-p) flex max-h-50 flex-col gap-0 overflow-y-auto [--data-in-delay:100ms]",
    rowClassName:
      "flex items-center gap-2.5 px-(--frame-panel-p) py-1 transition-opacity duration-200",
    skeletonLegendClassName: "flex flex-col",
  },
} as const;

const SKELETON_ROWS = [
  { label: "w-24", detail: "w-9", value: "w-16" },
  { label: "w-32", detail: "w-11", value: "w-20" },
  { label: "w-20", detail: "w-8", value: "w-14" },
] as const;

function BreakdownChartSkeleton({ variant }: { readonly variant: keyof typeof CHART_VARIANTS }) {
  return (
    <>
      <Skeleton className="h-2.5 w-full rounded-sm" />
      <div className={CHART_VARIANTS[variant].skeletonLegendClassName}>
        {SKELETON_ROWS.map((row) => (
          <div key={row.label} className="flex h-7 items-center gap-2.5 py-1">
            <Skeleton className="h-4 w-1.5 shrink-0 rounded-full" />
            <Skeleton className={`h-3.5 ${row.label}`} />
            <Skeleton className={`h-3 ${row.detail}`} />
            <Skeleton className={`ml-auto h-3.5 ${row.value}`} />
          </div>
        ))}
      </div>
    </>
  );
}

function DefaultLegendItem({ item }: { readonly item: BreakdownChartData }): ReactNode {
  return (
    <>
      <span className="truncate text-sm text-foreground">{item.label}</span>
      <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
        {item.percentage.toFixed(1)}%
      </span>
    </>
  );
}

export function BreakdownChart<TData extends BreakdownChartData>({
  data,
  isLoading,
  isError,
  children,
  emptyMessage = "No data available.",
  errorMessage = "Unable to load breakdown.",
  variant = "default",
}: BreakdownChartProps<TData>): ReactNode {
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
  const items = data ?? [];
  const variantStyles = CHART_VARIANTS[variant];

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3" aria-busy aria-hidden>
        <BreakdownChartSkeleton variant={variant} />
      </div>
    );
  }

  if (isError) {
    return <p className="py-4 text-center text-sm text-destructive">{errorMessage}</p>;
  }

  if (items.length === 0) {
    return (
      <p className="animate-data-in py-4 text-center text-sm text-muted-foreground [--data-in-delay:60ms]">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <TooltipProvider>
        <div className="animate-data-in flex h-2.5 w-full overflow-hidden rounded-sm [--data-in-delay:60ms]">
          {items.map((item) => {
            const isOtherHovered = hoveredItemId !== null && hoveredItemId !== item.id;
            return (
              <Tooltip key={item.id} open={hoveredItemId === item.id}>
                <TooltipTrigger
                  render={
                    <div
                      className="cursor-default transition-opacity duration-200 first:rounded-l-sm last:rounded-r-sm"
                      style={{
                        width: `${item.percentage > 0 && item.percentage < MIN_VISIBLE_SEGMENT_PERCENTAGE ? MIN_VISIBLE_SEGMENT_PERCENTAGE : item.percentage}%`,
                        backgroundColor: item.color,
                        opacity: isOtherHovered ? 0.3 : 1,
                      }}
                      onMouseEnter={() => setHoveredItemId(item.id)}
                      onMouseLeave={() => setHoveredItemId(null)}
                    />
                  }
                />
                <TooltipContent side="top">{item.tooltip}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>

      <div className={variantStyles.legendClassName}>
        {items.map((item) => {
          const isHovered = hoveredItemId === item.id;
          const isOtherHovered = hoveredItemId !== null && hoveredItemId !== item.id;
          const state: BreakdownChartRenderState<TData> = {
            item,
            isHovered,
            isOtherHovered,
            rowProps: {
              className: variantStyles.rowClassName,
              style: { opacity: isOtherHovered ? 0.4 : 1 },
              onMouseEnter: () => setHoveredItemId(item.id),
              onMouseLeave: () => setHoveredItemId(null),
            },
            markerProps: {
              className: "h-4 shrink-0 rounded-full transition-[width] duration-200",
              style: {
                backgroundColor: item.color,
                width: isHovered ? "0.5rem" : "0.375rem",
              },
            },
          };

          if (children) {
            return <Fragment key={item.id}>{children(state)}</Fragment>;
          }

          return (
            <div key={item.id} {...state.rowProps}>
              <div {...state.markerProps} />
              <DefaultLegendItem item={item} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
