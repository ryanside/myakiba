import { useCallback, useEffect, useMemo, useState } from "react";
import { Bar, BarChart, Cell, XAxis, ReferenceLine } from "recharts";
import { AnimatePresence } from "motion/react";
import { useMotionValueEvent, useSpring } from "motion/react";
import { useNavigate } from "@tanstack/react-router";
import { toDateOnlyString } from "@myakiba/utils/date-only";
import { ChartContainer } from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@/components/reui/frame";
import { Skeleton } from "@/components/ui/skeleton";
import Loader from "../loader";

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
    color: "var(--primary-foreground)",
  },
} satisfies ChartConfig;

interface MonthlyOrderData {
  readonly month: number;
  readonly orderCount: number;
}

interface OrdersBarChartProps {
  readonly data: ReadonlyArray<MonthlyOrderData>;
  readonly isLoading?: boolean;
}

function formatDateOnlyForSearch(date: Date): string {
  return toDateOnlyString(date) ?? "";
}

export function OrdersBarChart({ data, isLoading }: OrdersBarChartProps): React.ReactNode {
  const navigate = useNavigate();

  const chartData = useMemo(() => {
    const monthMap = new Map(data.map((item) => [Number(item.month), Number(item.orderCount)]));
    return MONTH_NAMES.map((monthName, index) => ({
      month: monthName,
      desktop: monthMap.get(index + 1) || 0,
    }));
  }, [data]);

  const currentMonthIndex = useMemo(() => new Date().getMonth(), []);

  const [activeIndex, setActiveIndex] = useState<number | undefined>(currentMonthIndex);

  const getReleaseMonthDateRange = useCallback((monthIndex: number) => {
    const currentYear = new Date().getFullYear();
    const startDate = new Date(currentYear, monthIndex, 1);
    const endDate = new Date(currentYear, monthIndex + 1, 0);

    return {
      releaseDateStart: formatDateOnlyForSearch(startDate),
      releaseDateEnd: formatDateOnlyForSearch(endDate),
    };
  }, []);

  const handleBarClick = useCallback(
    (monthIndex: number) => {
      const releaseDateRange = getReleaseMonthDateRange(monthIndex);
      navigate({
        to: "/orders",
        search: releaseDateRange,
      });
    },
    [navigate, getReleaseMonthDateRange],
  );

  const maxValueIndex = useMemo(() => {
    if (activeIndex !== undefined) {
      return { index: activeIndex, value: chartData[activeIndex].desktop };
    }
    return chartData.reduce(
      (max, d, index) => {
        return d.desktop > max.value ? { index, value: d.desktop } : max;
      },
      { index: 0, value: 0 },
    );
  }, [activeIndex, chartData]);

  const maxValueIndexSpring = useSpring(maxValueIndex.value, {
    stiffness: 150,
    damping: 18,
  });

  const [springyValue, setSpringyValue] = useState(maxValueIndex.value);

  useMotionValueEvent(maxValueIndexSpring, "change", (latest) => {
    setSpringyValue(Number(latest));
  });

  useEffect(() => {
    maxValueIndexSpring.set(maxValueIndex.value);
  }, [maxValueIndex.value, maxValueIndexSpring]);

  if (isLoading) {
    return (
      <Frame className="border-none ring-1 ring-foreground/10 shadow-xs! min-h-[320px]">
        <FrameHeader>
          <Skeleton className="h-4 my-1 w-32" />
        </FrameHeader>
        <FramePanel className="shadow-none!">
          <Loader className="justify-center text-muted" />
        </FramePanel>
      </Frame>
    );
  }

  return (
    <Frame className="border-none ring-1 ring-foreground/10 shadow-xs! lg:max-h-[320px]">
      <FrameHeader>
        <FrameTitle className="animate-data-in text-base font-medium">
          {maxValueIndex.value}{" "}
          <span className="ml-1 text-sm text-muted-foreground">
            {maxValueIndex.value === 1 ? "order" : "orders"} in{" "}
            {chartData[maxValueIndex.index].month}
          </span>
        </FrameTitle>
      </FrameHeader>
      <FramePanel className="shadow-none!">
        <AnimatePresence mode="wait">
          <ChartContainer
            config={chartConfig}
            className="animate-data-in w-full h-full [--data-in-delay:60ms]"
          >
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
                tickFormatter={(value: string) => value.slice(0, 3)}
                allowDataOverflow={true}
              />
              <Bar dataKey="desktop" fill="var(--primary)" radius={6.25}>
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
                ifOverflow="visible"
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
      </FramePanel>
    </Frame>
  );
}

interface CustomReferenceLabelProps {
  readonly viewBox?: {
    readonly x?: number;
    readonly y?: number;
  };
  readonly value: number;
}

function CustomReferenceLabel(props: CustomReferenceLabelProps): React.ReactNode {
  const { viewBox, value } = props;
  const x = viewBox?.x ?? 0;
  const y = viewBox?.y ?? 0;

  const width = useMemo(() => {
    const characterWidth = 8;
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
      <text fontWeight={600} x={x - CHART_MARGIN + 6} y={y + 4} fill="var(--background)">
        {value}
      </text>
    </>
  );
}
