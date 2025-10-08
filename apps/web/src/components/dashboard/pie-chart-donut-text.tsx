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

export function ChartPieDonutText({
  data,
  innerRadius,
  withIcon = true,
  ...props
}: {
  data: { name: string | null; count: number; totalValue: string | null }[];
  className?: string;
  innerRadius?: number;
  withIcon?: boolean;
}) {
  const chartData = data.map((item, index) => ({
    name: item.name || "other",
    count: item.count,
    value: item.totalValue || "0.00",
    fill: `var(--chart-${index + 1})`,
  }));

  const chartConfig = {
    ...chartData.reduce(
      (acc, curr) => {
        acc[curr.name || "other"] = {
          label: curr.name || "other",
          color: curr.fill,
        };
        return acc;
      },
      {} as Record<string, { label: string; color: string }>
    ),
  } satisfies ChartConfig;

  const totalItems = React.useMemo(() => {
    return chartData.reduce((acc, curr) => acc + curr.count, 0);
  }, []);

  if (totalItems === 0) {
    return (
      <Card className="flex flex-col">
        <CardHeader className="flex flex-row items-center space-y-0 gap-2">
          {withIcon && <Shapes className="h-4 w-4 text-muted-foreground" />}
          <CardTitle className="font-medium">Collection Breakdown</CardTitle>
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
    <Card className="flex flex-col">
      <CardHeader className="flex flex-row items-center space-y-0 gap-2">
        {withIcon && <Shapes className="h-4 w-4 text-muted-foreground" />}
        <CardTitle className="font-medium">Collection Breakdown</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col">
        <ChartContainer
          config={chartConfig}
          className={cn(`flex items-center justify-center x-auto aspect-auto`)}
          {...props}
        >
          <PieChart>
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel />}
            />
            <Pie
              data={chartData}
              dataKey="count"
              nameKey="name"
              innerRadius={innerRadius || 75}
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
                          className="fill-foreground text-3xl font-bold"
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
        <div className="flex flex-col gap-2 mt-auto h-26 overflow-y-auto">
          {chartData.map((item) => (
            <div key={item.name} className="flex flex-row gap-2 items-center">
              <div
                className="w-1 h-4 rounded-2xl"
                style={{ backgroundColor: item.fill }}
              />
              <span className="text-sm text-muted-foreground">{item.name}</span>
              <span className="text-sm text-muted-foreground">
                {item.count}
              </span>
              <span className="ml-auto text-sm text-muted-foreground">
                {formatCurrency(item.value)}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
