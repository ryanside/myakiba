import { Bar, BarChart, Cell, XAxis, ReferenceLine } from "recharts";
import React from "react";
import { AnimatePresence } from "motion/react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { type ChartConfig, ChartContainer } from "@/components/ui/chart";
import { cn } from "@/lib/utils";
import { useMotionValueEvent, useSpring } from "motion/react";
import { useNavigate } from "@tanstack/react-router";

const CHART_MARGIN = 35;

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

const chartConfig = {
  desktop: {
    label: "Orders",
    color: "var(--secondary-foreground)",
  },
} satisfies ChartConfig;

interface MonthlyOrderData {
  month: number;
  orderCount: number;
}

interface ValueLineBarChartProps {
  data: MonthlyOrderData[];
}

export function ValueLineBarChart({ data }: ValueLineBarChartProps) {
  const navigate = useNavigate();

  // Transform data to include all 12 months with 0 for missing months
  const chartData = React.useMemo(() => {
    const monthMap = new Map(
      data.map((item) => [Number(item.month), Number(item.orderCount)])
    );
    return MONTH_NAMES.map((monthName, index) => ({
      month: monthName,
      desktop: monthMap.get(index + 1) || 0,
    }));
  }, [data]);

  // Get current month index (0-11)
  const currentMonthIndex = React.useMemo(() => new Date().getMonth(), []);

  const [activeIndex, setActiveIndex] = React.useState<number | undefined>(
    currentMonthIndex
  );

  // Calculate date range for a given month index (0-11)
  const getMonthDateRange = React.useCallback((monthIndex: number) => {
    const currentYear = new Date().getFullYear();
    // monthIndex is 0-11, but Date constructor expects 0-11 for months
    const startDate = new Date(currentYear, monthIndex, 1);
    // Get last day of the month by going to the first day of next month and subtracting 1 day
    const endDate = new Date(currentYear, monthIndex + 1, 0);
    
    // Format as YYYY-MM-DD
    const formatDate = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    return {
      releaseMonthYearStart: formatDate(startDate),
      releaseMonthYearEnd: formatDate(endDate),
    };
  }, []);

  // Handle bar click to navigate to orders page with filters
  const handleBarClick = React.useCallback(
    (monthIndex: number) => {
      const dateRange = getMonthDateRange(monthIndex);
      navigate({
        to: "/orders",
        search: dateRange,
      });
    },
    [navigate, getMonthDateRange]
  );

  const maxValueIndex = React.useMemo(() => {
    // if user is moving mouse over bar then set value to the bar value
    if (activeIndex !== undefined) {
      return { index: activeIndex, value: chartData[activeIndex].desktop };
    }
    // if no active index then set value to max value
    return chartData.reduce(
      (max, data, index) => {
        return data.desktop > max.value ? { index, value: data.desktop } : max;
      },
      { index: 0, value: 0 }
    );
  }, [activeIndex, chartData]);

  const maxValueIndexSpring = useSpring(maxValueIndex.value);

  const [springyValue, setSpringyValue] = React.useState(maxValueIndex.value);

  useMotionValueEvent(maxValueIndexSpring, "change", (latest) => {
    setSpringyValue(Number(latest));
  });

  React.useEffect(() => {
    maxValueIndexSpring.set(maxValueIndex.value);
  }, [maxValueIndex.value, maxValueIndexSpring]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className={cn("font-mono text-2xl tracking-tighter")}>
            {maxValueIndex.value}
          </span>
        </CardTitle>
        <CardDescription>
          orders in {chartData[maxValueIndex.index].month}
        </CardDescription>
      </CardHeader>
      <CardContent className="">
        <AnimatePresence mode="wait">
          <ChartContainer config={chartConfig} className="">
            <BarChart
              accessibilityLayer
              data={chartData}
              onMouseLeave={() => setActiveIndex(currentMonthIndex)}
              margin={{
                left: CHART_MARGIN,
                top: 10,
                bottom: 0,
              }}
            >
              <XAxis
                dataKey="month"
                tickLine={false}
                tickMargin={10}
                axisLine={false}
                tickFormatter={(value) => value.slice(0, 3)}
              />
              <Bar dataKey="desktop" fill="var(--secondary)" radius={4}>
                {chartData.map((_, index) => (
                  <Cell
                    className="duration-200 cursor-pointer"
                    opacity={index === maxValueIndex.index ? 1 : 0.2}
                    key={index}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => handleBarClick(index)}
                  />
                ))}
              </Bar>
              <ReferenceLine
                opacity={0.4}
                y={springyValue}
                stroke="var(--foreground)"
                strokeWidth={1}
                strokeDasharray="3 3"
                label={<CustomReferenceLabel value={maxValueIndex.value} />}
              />
            </BarChart>
          </ChartContainer>
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}

interface CustomReferenceLabelProps {
  viewBox?: {
    x?: number;
    y?: number;
  };
  value: number;
}

const CustomReferenceLabel: React.FC<CustomReferenceLabelProps> = (props) => {
  const { viewBox, value } = props;
  const x = viewBox?.x ?? 0;
  const y = viewBox?.y ?? 0;

  // we need to change width based on value length
  const width = React.useMemo(() => {
    const characterWidth = 8; // Average width of a character in pixels
    const padding = 10;
    return value.toString().length * characterWidth + padding;
  }, [value]);

  return (
    <>
      <rect
        x={x - CHART_MARGIN}
        y={y - 9}
        width={width}
        height={18}
        fill="var(--foreground)"
        rx={4}
      />
      <text
        fontWeight={600}
        x={x - CHART_MARGIN + 6}
        y={y + 4}
        fill="var(--background)"
      >
        {value}
      </text>
    </>
  );
};
