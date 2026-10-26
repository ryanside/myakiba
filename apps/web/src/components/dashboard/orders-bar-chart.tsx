import { createContext, memo, use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentProps } from "react";
import { Bar, Rectangle, XAxis, ReferenceLine } from "recharts";
import { useMotionValueEvent, useSpring } from "motion/react";
import { useMotionPreference } from "@/hooks/use-appearance";
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

interface OrderChartState {
  readonly months: readonly MonthlyChartRow[];
  readonly active: ActiveMonth;
  readonly focusedIndex: number | undefined;
  readonly onMonthFocus: (monthIndex: number) => void;
  readonly onMonthOpen: (monthIndex: number) => void;
  readonly onChartBlur: (monthIndex: number, isPointerInChart: boolean) => void;
}

// Recharts remounts every bar whenever <Bar> re-renders, so the highlight
// reaches the bars through context instead of through <Bar> props.
const OrderChartContext = createContext<OrderChartState>({
  months: [],
  active: { index: 0, value: 0 },
  focusedIndex: undefined,
  onMonthFocus: () => {},
  onMonthOpen: () => {},
  onChartBlur: () => {},
});

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

  const [activeIndex, setActiveIndex] = useState<number>();
  const [focusedIndex, setFocusedIndex] = useState<number>();

  const getReleaseMonthDateRange = useCallback((monthIndex: number) => {
    const currentYear = new Date().getFullYear();
    const bounds = getDateOnlyMonthBounds(currentYear, monthIndex + 1);

    return {
      releaseDateStart: bounds.start,
      releaseDateEnd: bounds.end,
    };
  }, []);

  const resetActiveIndex = useCallback(() => setActiveIndex(undefined), []);

  const focusMonth = useCallback((monthIndex: number) => {
    setFocusedIndex(monthIndex);
    setActiveIndex(undefined);
  }, []);

  const blurChart = useCallback((monthIndex: number, isPointerInChart: boolean) => {
    setFocusedIndex(undefined);
    if (isPointerInChart) setActiveIndex((index) => index ?? monthIndex);
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

  // The pointer's month wins, then the focused month, then the current month.
  const maxValueIndex = useMemo(() => {
    const index = activeIndex ?? focusedIndex ?? currentMonthIndex;
    return { index, value: chartData[index]?.desktop ?? 0 };
  }, [activeIndex, focusedIndex, currentMonthIndex, chartData]);

  const orderChart = useMemo(
    () => ({
      months: chartData,
      active: maxValueIndex,
      focusedIndex,
      onMonthFocus: focusMonth,
      onMonthOpen: handleBarClick,
      onChartBlur: blurChart,
    }),
    [chartData, maxValueIndex, focusedIndex, focusMonth, handleBarClick, blurChart],
  );

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
        <OrderChartContext value={orderChart}>
          <OrderBars
            chartData={chartData}
            isLoading={isLoading}
            onBarEnter={setActiveIndex}
            onBarClick={handleBarClick}
            onChartLeave={resetActiveIndex}
          />
        </OrderChartContext>
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
  // Recharts animates its bars on its own clock, which follows only the device setting.
  const reduceMotion = useMotionPreference().reduce;
  return (
    <EvilBarChart
      config={chartConfig}
      data={chartData}
      isLoading={isLoading}
      loadingBars={MONTH_NAMES.length}
      className="animate-data-in w-full h-full"
      chartProps={{
        // Each bar is its own tab stop, so the surface is not one.
        accessibilityLayer: false,
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
          isAnimationActive={!reduceMotion}
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

type OrderBarRenderer = Extract<
  NonNullable<ComponentProps<typeof Bar>["shape"]>,
  (props: never) => React.ReactNode
>;
type OrderBarProps = Parameters<OrderBarRenderer>[0];

const renderOrderBar: OrderBarRenderer = (props) => <OrderBar {...props} />;
const orderBarRenderer = Object.fromEntries([["shape", renderOrderBar]]) as Pick<
  ComponentProps<typeof Bar>,
  "shape"
>;

function OrderBar(props: OrderBarProps): React.ReactNode {
  const chart = use(OrderChartContext);
  const monthIndex = props.originalDataIndex;
  const month = chart.months[monthIndex];
  const isActive = monthIndex === chart.active.index;
  const isFocused = monthIndex === chart.focusedIndex;
  const column = props.background;
  const barRef = useRef<SVGGElement>(null);

  // Recharts remounts a bar when its value changes, which drops focus to the body.
  useEffect(() => {
    if (isFocused && document.activeElement === document.body) {
      barRef.current?.focus({ preventScroll: true });
    }
  }, [isFocused]);

  const handleKeyDown = (event: React.KeyboardEvent<SVGGElement>) => {
    if (event.key === "Enter") {
      chart.onMonthOpen(monthIndex);
      return;
    }
    const nextIndex = monthIndexForKey(event.key, monthIndex);
    if (nextIndex === undefined) return;
    event.preventDefault();
    event.currentTarget
      .closest("svg")
      ?.querySelector<SVGGElement>(`[data-month-index="${nextIndex}"]`)
      ?.focus();
  };

  const handleBlur = (event: React.FocusEvent<SVGGElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Element && next.closest("[data-month-index]")) return;
    chart.onChartBlur(monthIndex, Boolean(event.currentTarget.closest("svg")?.matches(":hover")));
  };

  return (
    <g
      role="link"
      ref={barRef}
      tabIndex={monthIndex === (chart.focusedIndex ?? chart.active.index) ? 0 : -1}
      aria-label={
        month && `${month.month}: ${month.desktop} ${month.desktop === 1 ? "order" : "orders"}`
      }
      data-month-index={monthIndex}
      className="group/bar outline-none"
      onFocus={() => {
        if (!isFocused) chart.onMonthFocus(monthIndex);
      }}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    >
      <Rectangle
        {...props}
        className="cursor-pointer transition-opacity duration-200"
        opacity={isActive ? 1 : 0.2}
      />
      {/* Ring the whole column so a month with no orders still shows focus. */}
      {column?.y == null ? null : (
        <rect
          x={props.x - 3}
          y={column.y - 3}
          width={props.width + 6}
          height={column.height + 6}
          rx={8}
          strokeWidth={2}
          className="pointer-events-none fill-none stroke-none group-focus-visible/bar:stroke-foreground"
        />
      )}
    </g>
  );
}

function monthIndexForKey(key: string, monthIndex: number): number | undefined {
  switch (key) {
    case "ArrowLeft":
      return Math.max(monthIndex - 1, 0);
    case "ArrowRight":
      return Math.min(monthIndex + 1, MONTH_NAMES.length - 1);
    case "Home":
      return 0;
    case "End":
      return MONTH_NAMES.length - 1;
    default:
      return undefined;
  }
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
  const { value } = use(OrderChartContext).active;
  const reduceMotion = useMotionPreference().reduce;
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
      y={reduceMotion ? value : springyValue}
      stroke="var(--foreground)"
      strokeWidth={1}
      strokeDasharray="3 3"
      label={<CustomReferenceLabel value={value} />}
    />
  );
}
