import { createContext, useContext, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const MIN_VISIBLE_SEGMENT_PERCENTAGE = 3;

export interface BreakdownChartEntry {
  readonly id: string;
  readonly label: string;
  readonly color: string;
  readonly percentage: number;
  readonly tooltip: ReactNode;
}

interface BreakdownChartContextValue {
  readonly entries: readonly BreakdownChartEntry[];
  readonly hoveredEntryId: string | null;
  readonly setHoveredEntryId: (entryId: string | null) => void;
}

const BreakdownChartContext = createContext<BreakdownChartContextValue | null>(null);

interface BreakdownChartRootProps {
  readonly entries: readonly BreakdownChartEntry[];
  readonly children: ReactNode;
}

interface BreakdownChartLegendProps {
  readonly children: ReactNode;
  readonly className?: string;
}

interface BreakdownChartLegendItemState {
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

interface BreakdownChartLegendItemProps {
  readonly entryId: string;
  readonly className?: string;
  readonly children: (state: BreakdownChartLegendItemState) => ReactNode;
}

function useBreakdownChartContext(): BreakdownChartContextValue {
  const context = useContext(BreakdownChartContext);

  if (context === null) {
    throw new Error("BreakdownChart components must be rendered inside BreakdownChart.Root.");
  }

  return context;
}

function getSegmentWidth(percentage: number): number {
  if (percentage > 0 && percentage < MIN_VISIBLE_SEGMENT_PERCENTAGE) {
    return MIN_VISIBLE_SEGMENT_PERCENTAGE;
  }

  return percentage;
}

function BreakdownChartRoot({ entries, children }: BreakdownChartRootProps): ReactNode {
  const [hoveredEntryId, setHoveredEntryId] = useState<string | null>(null);

  const contextValue = useMemo(
    () => ({
      entries,
      hoveredEntryId,
      setHoveredEntryId,
    }),
    [entries, hoveredEntryId],
  );

  return <BreakdownChartContext value={contextValue}>{children}</BreakdownChartContext>;
}

function BreakdownChartBar(): ReactNode {
  const { entries, hoveredEntryId, setHoveredEntryId } = useBreakdownChartContext();

  return (
    <TooltipProvider>
      <div className="animate-data-in flex h-2.5 w-full overflow-hidden rounded-sm [--data-in-delay:60ms]">
        {entries.map((entry) => {
          const isOtherHovered = hoveredEntryId !== null && hoveredEntryId !== entry.id;
          return (
            <Tooltip key={entry.id} open={hoveredEntryId === entry.id}>
              <TooltipTrigger
                render={
                  <div
                    className="cursor-default transition-opacity duration-200 first:rounded-l-sm last:rounded-r-sm"
                    style={{
                      width: `${getSegmentWidth(entry.percentage)}%`,
                      backgroundColor: entry.color,
                      opacity: isOtherHovered ? 0.3 : 1,
                    }}
                    onMouseEnter={() => setHoveredEntryId(entry.id)}
                    onMouseLeave={() => setHoveredEntryId(null)}
                  />
                }
              />
              <TooltipContent side="top">{entry.tooltip}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

function BreakdownChartLegend({ children, className }: BreakdownChartLegendProps): ReactNode {
  return (
    <div className={className ?? "animate-data-in flex flex-col gap-0.5 [--data-in-delay:100ms]"}>
      {children}
    </div>
  );
}

function BreakdownChartLegendItem({
  entryId,
  className,
  children,
}: BreakdownChartLegendItemProps): ReactNode {
  const { entries, hoveredEntryId, setHoveredEntryId } = useBreakdownChartContext();
  const entry = entries.find((item) => item.id === entryId);

  if (!entry) {
    return null;
  }

  const isHovered = hoveredEntryId === entryId;
  const isOtherHovered = hoveredEntryId !== null && hoveredEntryId !== entryId;

  return children({
    isHovered,
    isOtherHovered,
    rowProps: {
      className:
        className ??
        "flex cursor-default items-center gap-2.5 py-1 transition-opacity duration-200",
      style: { opacity: isOtherHovered ? 0.4 : 1 },
      onMouseEnter: () => setHoveredEntryId(entryId),
      onMouseLeave: () => setHoveredEntryId(null),
    },
    markerProps: {
      className: "h-4 shrink-0 rounded-full transition-[width] duration-200",
      style: {
        backgroundColor: entry.color,
        width: isHovered ? "0.5rem" : "0.375rem",
      },
    },
  });
}

export const BreakdownChart = {
  Root: BreakdownChartRoot,
  Bar: BreakdownChartBar,
  Legend: BreakdownChartLegend,
  LegendItem: BreakdownChartLegendItem,
} as const;
