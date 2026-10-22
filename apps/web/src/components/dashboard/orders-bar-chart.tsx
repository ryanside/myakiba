import { createContext, memo, use, useCallback, useEffect, useMemo, useState } from "react";
import type { ComponentProps } from "react";
import { Bar, Rectangle, XAxis, ReferenceLine } from "recharts";
import type { RectangleProps } from "recharts";
import { useMotionValueEvent, useSpring } from "motion/react";
import { useNavigate } from "@tanstack/react-router";
import { getDateOnlyMonthBounds } from "@myakiba/utils/date-only";
import { EvilBarChart } from "@/components/evilcharts/charts/recharts-bar-chart";
import type { ChartConfig } from "@/components/evilcharts/ui/recharts-chart";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@/components/reui/frame";
import { Skeleton } from "@/components/ui/skeleton";

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
  },
} satisfies ChartConfig;

interface MonthlyOrderData {
  readonly month: number;
  readonly orderCount: number;
}

type MonthlyChartRow = {
  readonly month: string;
  readonly desktop: number;
};

interface ActiveMonth {
  readonly index: number;
  readonly value: number;
}

// Recharts remounts every bar whenever <Bar> re-renders, so the highlight
// reaches the bars through context instead of through <Bar> props.
const ActiveMonthContext = createContext<ActiveMonth>({ index: 0, value: 0 });

interface OrdersBarChartProps {
  readonly data: readonly MonthlyOrderData[];
  readonly isLoading?: boolean;
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
    const bounds = getDateOnlyMonthBounds(currentYear, monthIndex + 1);

    return {
      releaseDateStart: bounds.start,
      releaseDateEnd: bounds.end,
    };
  }, []);

  const resetActiveIndex = useCallback(
    () => setActiveIndex(currentMonthIndex),
    [currentMonthIndex],
  );

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
      return { index: activeIndex, value: chartData[activeIndex]?.desktop ?? 0 };
    }
    return chartData.reduce(
      (max, d, index) => {
        return d.desktop > max.value ? { index, value: d.desktop } : max;
      },
      { index: 0, value: 0 },
    );
  }, [activeIndex, chartData]);

  return (
    <Frame
      spacing="sm"
      className={`border-none ring-1 ring-foreground/10 shadow-xs! ${isLoading ? "min-h-[320px]" : "lg:max-h-[320px]"}`}
      aria-busy={isLoading}
    >
      <FrameHeader>
        {isLoading ? (
          <Skeleton className="h-4 my-1 w-32" />
        ) : (
          <FrameTitle className="animate-data-in text-base font-medium">
            {maxValueIndex.value}{" "}
            <span className="ml-1 text-sm text-muted-foreground">
              {maxValueIndex.value === 1 ? "order" : "orders"} in{" "}
              {chartData[maxValueIndex.index]?.month}
            </span>
          </FrameTitle>
        )}
      </FrameHeader>
      <FramePanel className="shadow-none! border-none m-1 mt-0">
        <ActiveMonthContext value={maxValueIndex}>
          <OrderBars
            chartData={chartData}
            isLoading={isLoading}
            onBarEnter={setActiveIndex}
            onBarClick={handleBarClick}
            onChartLeave={resetActiveIndex}
          />
        </ActiveMonthContext>
      </FramePanel>
    </Frame>
  );
}

interface OrderBarsProps {
  readonly chartData: readonly MonthlyChartRow[];
  readonly isLoading?: boolean;
  readonly onBarEnter: (monthIndex: number) => void;
  readonly onBarClick: (monthIndex: number) => void;
  readonly onChartLeave: () => void;
}

const OrderBars = memo(OrderBarsChart);

function OrderBarsChart({
  chartData,
  isLoading,
  onBarEnter,
  onBarClick,
  onChartLeave,
}: OrderBarsProps): React.ReactNode {
  return (
    <EvilBarChart
      config={chartConfig}
      data={chartData}
      isLoading={isLoading}
      loadingBars={MONTH_NAMES.length}
      className="animate-data-in w-full h-full"
      chartProps={{
        onMouseLeave: onChartLeave,
        margin: {
          left: CHART_MARGIN,
          top: 10,
          bottom: 0,
        },
      }}
    >
      {isLoading ? null : (
        <XAxis
          dataKey="month"
          tickLine={false}
          tickMargin={10}
          axisLine={false}
          tickFormatter={(value: string) => value.slice(0, 3)}
          allowDataOverflow={true}
        />
      )}
      {isLoading ? null : (
        <Bar
          dataKey="desktop"
          fill="var(--primary)"
          radius={6.25}
          animationDuration={300}
          animationEasing="ease-in-out"
          {...orderBarRenderer}
          onMouseEnter={(_, index) => onBarEnter(index)}
          onClick={(_, index) => onBarClick(index)}
        />
      )}
      {isLoading ? null : <OrderReferenceLine />}
    </EvilBarChart>
  );
}

type OrderBarProps = RectangleProps & { readonly originalDataIndex: number };

const orderBarRenderer = Object.fromEntries([
  ["shape", (props: OrderBarProps) => <OrderBar {...props} />],
]) as Pick<ComponentProps<typeof Bar>, "shape">;

function OrderBar(props: OrderBarProps): React.ReactNode {
  const activeMonth = use(ActiveMonthContext);
  return (
    <Rectangle
      {...props}
      className="cursor-pointer transition-opacity duration-200"
      opacity={props.originalDataIndex === activeMonth.index ? 1 : 0.2}
    />
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

function OrderReferenceLine(): React.ReactNode {
  const { value } = use(ActiveMonthContext);
  const valueSpring = useSpring(value, { stiffness: 150, damping: 18 });
  const [springyValue, setSpringyValue] = useState(() => valueSpring.get());

  useMotionValueEvent(valueSpring, "change", (latest) => {
    setSpringyValue(Number(latest));
  });

  useEffect(() => {
    valueSpring.set(value);
  }, [value, valueSpring]);

  return (
    <ReferenceLine
      pointerEvents="none"
      ifOverflow="visible"
      opacity={0.4}
      y={springyValue}
      stroke="var(--foreground)"
      strokeWidth={1}
      strokeDasharray="3 3"
      label={<CustomReferenceLabel value={value} />}
    />
  );
}
