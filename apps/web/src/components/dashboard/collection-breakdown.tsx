import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { Scroller } from "../ui/scroller";
import { Link } from "@tanstack/react-router";
import type { Category } from "@myakiba/contracts/shared/types";
import { getCategoryColor } from "@/lib/category-colors";

export function CollectionBreakdown({
  data,
  currency = "USD",
  className,
}: {
  data: { name: Category; count: number; totalValue: number | null }[];
  className?: string;
  currency?: string;
}) {
  const [hoveredIndex, setHoveredIndex] = React.useState<number | null>(null);

  const chartData = React.useMemo(() => {
    return data.map((item) => ({
      name: item.name,
      count: item.count,
      value: item.totalValue ?? 0,
      fill: getCategoryColor(item.name),
    }));
  }, [data]);

  const totalItems = React.useMemo(() => {
    return chartData.reduce((acc, curr) => acc + curr.count, 0);
  }, [chartData]);

  const chartDataWithPercentages = React.useMemo(() => {
    return chartData.map((item) => ({
      ...item,
      percentage: totalItems > 0 ? (item.count / totalItems) * 100 : 0,
    }));
  }, [chartData, totalItems]);

  if (totalItems === 0) {
    return (
      <Card className={cn("flex flex-col", className)}>
        <CardHeader className="flex flex-row items-center gap-2">
          <CardTitle className="text-base font-medium">Collection Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 pb-0">
          <p className="text-sm text-muted-foreground text-center py-8">No items in collection</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("flex flex-col h-full", className)}>
      <CardHeader className="flex flex-row items-center gap-2">
        <CardTitle className="text-base font-medium">Collection Breakdown</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 px-0">
        {/* Horizontal Stacked Bar */}
        <TooltipProvider>
          <div className="relative px-4">
            <div className="flex h-4 w-full rounded-xs">
              {chartDataWithPercentages.map((item, index) => {
                const isHovered = hoveredIndex === index;
                const isOtherHovered = hoveredIndex !== null && hoveredIndex !== index;
                const minWidth = item.percentage < 2 && item.percentage > 0 ? 2 : item.percentage;

                return (
                  <Tooltip key={item.name} open={hoveredIndex === index}>
                    <TooltipTrigger
                      render={
                        <div
                          className="relative flex items-center justify-center transition-all duration-200 cursor-pointer group"
                          style={{
                            width: `${minWidth}%`,
                            backgroundColor: item.fill,
                            opacity: isOtherHovered ? 0.3 : 1,
                            transform: isHovered ? "scaleY(1.05)" : "scaleY(1)",
                          }}
                          onMouseEnter={() => setHoveredIndex(index)}
                          onMouseLeave={() => setHoveredIndex(null)}
                        />
                      }
                    />
                    <TooltipContent side="top">
                      <div className="flex flex-col gap-1">
                        <p className="text-sm font-medium">{item.name}</p>
                        <div className="flex justify-between items-center gap-2">
                          <span className="text-xs">Spent:</span>
                          <span className="text-xs font-medium">
                            {formatCurrencyFromMinorUnits(item.value, currency)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center gap-2">
                          <span className="text-xs">Percentage:</span>
                          <span className="text-xs font-medium">{item.percentage.toFixed(1)}%</span>
                        </div>
                        <div className="flex justify-between items-center gap-2">
                          <span className="text-xs">Items:</span>
                          <span className="text-xs font-medium">{item.count}</span>
                        </div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </div>
        </TooltipProvider>

        <div className="flex flex-col gap-2 px-4">
          <div className="flex justify-between items-center">
            <span className="text-sm">Categories</span>
          </div>
        </div>

        {/* Legend */}
        <Scroller className="max-h-40 px-4">
          {chartDataWithPercentages.map((item, index) => {
            const isHovered = hoveredIndex === index;
            const isOtherHovered = hoveredIndex !== null && hoveredIndex !== index;

            return (
              <Link
                to="/collection"
                search={{ category: [item.name] }}
                key={item.name}
                className="flex flex-row gap-2 items-center font-normal transition-opacity py-1 duration-200"
                style={{ opacity: isOtherHovered ? 0.4 : 1 }}
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                <div
                  className="w-1 h-4 rounded-2xl transition-all duration-200"
                  style={{
                    backgroundColor: item.fill,
                    width: isHovered ? "0.5rem" : "0.25rem",
                  }}
                />
                <span className="text-sm text-muted-foreground">{item.name}</span>
                <span className="text-sm text-muted-foreground">{item.count}</span>
                <span className="text-xs text-muted-foreground">
                  ({item.percentage.toFixed(1)}%)
                </span>
                <span className="ml-auto text-sm text-foreground">
                  {formatCurrencyFromMinorUnits(item.value, currency)}
                </span>
              </Link>
            );
          })}
        </Scroller>
      </CardContent>
    </Card>
  );
}
