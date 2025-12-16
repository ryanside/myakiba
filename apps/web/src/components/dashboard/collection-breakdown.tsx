import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatCurrency, getCategoryColor } from "@/lib/utils";
import { ScrollArea } from "../ui/scroll-area";
import { Scroller } from "../ui/scroller";
import { Separator } from "../ui/separator";

export function CollectionBreakdown({
  data,
  currency = "USD",
  className,
  ...props
}: {
  data: { name: string | null; count: number; totalValue: string | null }[];
  className?: string;
  currency?: string;
}) {
  const [hoveredIndex, setHoveredIndex] = React.useState<number | null>(null);

  const chartData = React.useMemo(() => {
    return data.map((item) => ({
      name: item.name || "other",
      count: item.count,
      value: parseFloat(item.totalValue || "0"),
      fill: getCategoryColor(item.name),
    }));
  }, [data]);

  const totalItems = React.useMemo(() => {
    return chartData.reduce((acc, curr) => acc + curr.count, 0);
  }, [chartData]);

  const totalValue = React.useMemo(() => {
    return chartData.reduce((acc, curr) => acc + curr.value, 0);
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
          <CardTitle className="text-md font-medium">
            Collection Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 pb-0">
          <p className="text-sm text-muted-foreground text-center py-8">
            No items in collection
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("flex flex-col h-full", className)}>
      <CardHeader className="flex flex-row items-center gap-2">
        <CardTitle className="text-md font-medium">
          Collection Breakdown
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 px-0">
        {/* Horizontal Stacked Bar */}
        <div className="relative px-6">
          <div className="flex h-4 w-full rounded-xs">
            {chartDataWithPercentages.map((item, index) => {
              const isHovered = hoveredIndex === index;
              const isOtherHovered =
                hoveredIndex !== null && hoveredIndex !== index;
              const minWidth =
                item.percentage < 2 && item.percentage > 0
                  ? 2
                  : item.percentage;

              return (
                <div
                  key={item.name}
                  className="relative flex items-center justify-center transition-all duration-200 cursor-pointer group"
                  style={{
                    width: `${minWidth}%`,
                    backgroundColor: item.fill,
                    opacity: isOtherHovered ? 0.3 : 1,
                    transform: isHovered ? "scaleY(1.05)" : "scaleY(1)",
                  }}
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                >
                  {/* Tooltip */}
                  {isHovered && (
                    <div className="absolute -top-24 left-1/2 -translate-x-1/2 z-10 bg-popover text-popover-foreground px-3 py-2 rounded-md shadow-lg border min-w-[160px]">
                      <div className="flex flex-col gap-1">
                        <p className="text-sm font-medium">{item.name}</p>
                        <div className="flex justify-between items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            Spent:
                          </span>
                          <span className="text-xs font-medium">
                            {formatCurrency(item.value.toString(), currency)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            Percentage:
                          </span>
                          <span className="text-xs font-medium">
                            {item.percentage.toFixed(1)}%
                          </span>
                        </div>
                        <div className="flex justify-between items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            Items:
                          </span>
                          <span className="text-xs font-medium">
                            {item.count}
                          </span>
                        </div>
                      </div>
                      {/* Tooltip arrow */}
                      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-popover border-b border-r rotate-45" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="px-6 my-0">
          <Separator />
        </div>

        {/* Total Items Section */}
        <div className="flex flex-col gap-2 pt-4 px-6">
          <div className="flex justify-between items-center">
            <span className="text-lg tracking-tight">Total Items</span>
            <span className="text-lg ">{totalItems}</span>
          </div>
        </div>

        {/* Legend */}
        <Scroller className="h-34 px-6">
          {chartDataWithPercentages.map((item, index) => {
            const isHovered = hoveredIndex === index;
            const isOtherHovered =
              hoveredIndex !== null && hoveredIndex !== index;

            return (
              <div
                key={item.name}
                className="flex flex-row gap-2 items-center font-light  cursor-pointer transition-opacity py-1 duration-200"
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
                <span className="text-sm text-muted-foreground">
                  {item.name}
                </span>
                <span className="text-sm text-muted-foreground">
                  {item.count}
                </span>
                <span className="text-xs text-muted-foreground">
                  ({item.percentage.toFixed(1)}%)
                </span>
                <span className="ml-auto text-sm text-foreground">
                  {formatCurrency(item.value.toString(), currency)}
                </span>
              </div>
            );
          })}
        </Scroller>
      </CardContent>
    </Card>
  );
}
