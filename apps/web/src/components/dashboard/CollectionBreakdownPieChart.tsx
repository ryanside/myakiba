import * as React from "react";
import { Label, Pie, PieChart } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Shapes } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";

// const chartData = [
//   { browser: "chrome", visitors: 275, fill: "var(--color-chrome)" },
//   { browser: "safari", visitors: 200, fill: "var(--color-safari)" },
//   { browser: "firefox", visitors: 287, fill: "var(--color-firefox)" },
//   { browser: "edge", visitors: 173, fill: "var(--color-edge)" },
//   { browser: "other", visitors: 190, fill: "var(--color-other)" },
// ];

// const chartConfig = {
//   visitors: {
//     label: "Visitors",
//   },
//   chrome: {
//     label: "Chrome",
//     color: "var(--chart-1)",
//   },
//   safari: {
//     label: "Safari",
//     color: "var(--chart-2)",
//   },
//   firefox: {
//     label: "Firefox",
//     color: "var(--chart-3)",
//   },
//   edge: {
//     label: "Edge",
//     color: "var(--chart-4)",
//   },
//   other: {
//     label: "Other",
//     color: "var(--chart-5)",
//   },
// } satisfies ChartConfig;

export function CollectionBreakdownPieChart({
  data,
  innerRadius,
  currency = "USD",
  className,
  ...props
}: {
  data: { name: string | null; count: number; totalValue: string | null }[];
  className?: string;
  innerRadius?: number;
  withIcon?: boolean;
  currency?: string;
}) {
  const chartData = data.map((item, index) => ({
    name: item.name || "other",
    count: item.count,
    value: item.totalValue || "0.00",
    fill: `var(--chart-${index + 1})`,
  }));

  const chartConfig = {
    ...chartData.reduce((acc, curr) => {
      acc[curr.name || "other"] = {
        label: curr.name || "other",
        color: curr.fill,
      };
      return acc;
    }, {} as Record<string, { label: string; color: string }>),
  } satisfies ChartConfig;

  const totalItems = React.useMemo(() => {
    return chartData.reduce((acc, curr) => acc + curr.count, 0);
  }, []);

  if (totalItems === 0) {
    return (
      <Card className={cn("flex flex-col", className)}>
        <CardHeader className="flex flex-row items-center gap-2">
          <CardTitle className="text-sm font-medium">Collection Breakdown</CardTitle>
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
    <Card className={cn("flex flex-col h-full ", className)}>
      <CardHeader className="flex flex-row items-center gap-2">
        <CardTitle className="text-md font-medium">Collection Breakdown</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-row items-center justify-center gap-4 pl-0">
        <div className="flex-1 h-full ml-6">
          <ChartContainer
            config={chartConfig}
            className="flex items-center justify-center aspect-square size-50 -m-4"
          >
            <PieChart className="">
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent hideLabel />}
              />
              <Pie
                data={chartData}
                dataKey="count"
                nameKey="name"
                innerRadius={65}
                strokeWidth={5}
              >
                <Label
                  content={({ viewBox }) => {
                    if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                      return (
                        <text
                          x={viewBox.cx}
                          y={viewBox.cy}
                          textAnchor="middle"
                          dominantBaseline="middle"
                        >
                          <tspan
                            x={viewBox.cx}
                            y={viewBox.cy}
                            className="fill-foreground text-4xl font-semibold"
                          >
                            {totalItems.toLocaleString()}
                          </tspan>
                          <tspan
                            x={viewBox.cx}
                            y={(viewBox.cy || 0) + 24}
                            className="fill-muted-foreground"
                          >
                            Total Items
                          </tspan>
                        </text>
                      );
                    }
                  }}
                />
              </Pie>
            </PieChart>
          </ChartContainer>
        </div>
        <div className="flex-2 flex flex-col gap-2 overflow-y-auto">
          {chartData.map((item) => (
            <div key={item.name} className="flex flex-row gap-2 items-center font-light">
              <div
                className="w-1 h-4 rounded-2xl"
                style={{ backgroundColor: item.fill }}
              />
              <span className="text-sm text-muted-foreground">{item.name}</span>
              <span className="text-sm text-muted-foreground">
                {item.count}
              </span>
              <span className="ml-auto text-sm text-foreground">
                {formatCurrency(item.value, currency)}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
