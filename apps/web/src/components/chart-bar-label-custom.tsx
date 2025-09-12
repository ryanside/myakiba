"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { ChartNoAxesColumn } from "lucide-react";
import {
  Select,
  SelectItem,
  SelectContent,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

const chartConfig = {
  cost: {
    label: "Costs",
    color: "var(--foreground)",
  },
  label: {
    color: "var(--background)",
  },
} satisfies ChartConfig;

export function ChartBarLabelCustom({
  data,
}: {
  data: {
    totalSpent: string;
    totalShipping: string;
    totalTaxes: string;
    totalDuties: string;
    totalTariffs: string;
    totalMiscFees: string;
  };
}) {
  const chartData = [
    { expense: "Item Costs", cost: parseFloat(data.totalSpent) },
    { expense: "Shipping", cost: parseFloat(data.totalShipping) },
    { expense: "Taxes", cost: parseFloat(data.totalTaxes) },
    { expense: "Duties", cost: parseFloat(data.totalDuties) },
    { expense: "Tariffs", cost: parseFloat(data.totalTariffs) },
    { expense: "Misc Fees", cost: parseFloat(data.totalMiscFees) },
  ];

  return (
    <Card className="">
      <CardHeader className="flex flex-row items-center space-y-0 gap-2">
        <ChartNoAxesColumn className="h-4 w-4 text-muted-foreground" />
        <CardTitle className="font-medium">Total Expenses</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[200px]">
          <BarChart
            accessibilityLayer
            data={chartData}
            layout="vertical"
            margin={{
              right: 80,
            }}
          >
            <CartesianGrid horizontal={false} />
            <YAxis
              dataKey="expense"
              type="category"
              tickLine={false}
              tickMargin={10}
              axisLine={false}
              tickFormatter={(value) => value.slice(0, 3)}
              hide
            />
            <XAxis dataKey="cost" type="number" hide />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent indicator="line" />}
            />
            <Bar
              dataKey="cost"
              layout="vertical"
              fill="var(--color-cost)"
              radius={4}
            >
              <LabelList
                dataKey="expense"
                position="insideLeft"
                offset={8}
                className="fill-(--color-label)"
                fontSize={12}
              />
              <LabelList
                dataKey="cost"
                position="right"
                offset={8}
                className="fill-foreground"
                fontSize={12}
                formatter={(value: number) => `$${value.toFixed(2)}`}
              />
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
      <div className="flex flex-col gap-2 text-xs text-muted-foreground px-6 mt-1">
        <div className="grid grid-cols-2 gap-2">
          <div className="flex justify-between">
            <span>Item Costs</span>
            <span className="font-medium">
              ${data.totalSpent}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Shipping</span>
            <span className="font-medium">
              ${data.totalShipping}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Taxes</span>
            <span className="font-medium">
              ${data.totalTaxes}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Duties</span>
            <span className="font-medium">
              ${data.totalDuties}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Tariffs</span>
            <span className="font-medium">
              ${data.totalTariffs}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Misc Fees</span>
            <span className="font-medium">
              ${data.totalMiscFees}
            </span>
          </div>
        </div>
        <div className="flex justify-between text-foreground font-medium text-sm mt-2.5">
          <span>Total</span>
          <span>
            $
            {(
              Number(data.totalSpent) +
              Number(data.totalShipping) +
              Number(data.totalTaxes) +
              Number(data.totalDuties) +
              Number(data.totalTariffs) +
              Number(data.totalMiscFees)
            ).toFixed(2)}
          </span>
        </div>
      </div>
    </Card>
  );
}
