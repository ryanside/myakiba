import { Bar, BarChart, CartesianGrid, LabelList, XAxis } from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

export const description = "A bar chart with a label";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

interface MonthlyBreakdownData {
  month: number;
  itemsAdded: number;
  amountSpent: number | null;
}

interface ChartBarLabelProps extends React.ComponentProps<typeof Card> {
  monthlyBreakdown?: MonthlyBreakdownData[];
}

const chartConfig = {
  itemsAdded: {
    label: "Items Added",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

function processMonthlyData(monthlyBreakdown?: MonthlyBreakdownData[]) {
  // Create a map for existing data
  const dataMap = new Map<number, MonthlyBreakdownData>();

  if (monthlyBreakdown) {
    monthlyBreakdown.forEach((item) => {
      // Handle both string and number types safely
      const monthNumber = Number(item.month);
      dataMap.set(monthNumber, item);
    });
  }

  // Generate data for all 12 months
  return MONTH_NAMES.map((monthName, index) => {
    const monthNumber = index + 1;
    const monthData = dataMap.get(monthNumber);

    return {
      month: monthName,
      itemsAdded: monthData?.itemsAdded || 0,
      amountSpent: monthData?.amountSpent ?? 0,
    };
  });
}

export function ChartBarLabel({ monthlyBreakdown, ...props }: ChartBarLabelProps) {
  const chartData = processMonthlyData(monthlyBreakdown);
  const totalItems = chartData.reduce((sum, month) => sum + month.itemsAdded, 0);
  const currentYear = new Date().getFullYear();

  return (
    <Card className="col-span-2">
      <CardHeader>
        <CardTitle>Monthly Collection Activity</CardTitle>
        <CardDescription>Items added to collection - {currentYear}</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} {...props}>
          <BarChart
            accessibilityLayer
            data={chartData}
            margin={{
              top: 25,
            }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="month"
              tickLine={false}
              tickMargin={10}
              axisLine={false}
              tickFormatter={(value) => value.slice(0, 3)}
            />
            <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
            <Bar dataKey="itemsAdded" fill="var(--color-itemsAdded)" radius={8}>
              <LabelList position="top" offset={12} className="fill-foreground" fontSize={12} />
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col items-start gap-2 text-sm">
        <div className="flex gap-2 leading-none font-medium">
          {totalItems} items added this year
        </div>
        <div className="text-muted-foreground leading-none">
          Showing monthly collection activity for {currentYear}
        </div>
      </CardFooter>
    </Card>
  );
}
