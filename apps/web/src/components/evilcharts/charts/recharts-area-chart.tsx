"use client";

import {
  Children,
  createContext,
  isValidElement,
  use,
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ComponentProps, FC, ReactElement, ReactNode } from "react";
import {
  axisValueToPercentFormatter,
  ChartContainer,
  getColorsCount,
  getLoadingData,
  LoadingIndicator,
} from "@/components/evilcharts/ui/recharts-chart";
import type { ChartConfig, ChartDataRow } from "@/components/evilcharts/ui/recharts-chart";
import {
  Area as RechartsArea,
  AreaChart as RechartsAreaChart,
  CartesianGrid,
  XAxis as RechartsXAxis,
  YAxis as RechartsYAxis,
} from "recharts";
import { ChartTooltip, ChartTooltipContent } from "@/components/evilcharts/ui/recharts-tooltip";
import type { TooltipRoundness, TooltipVariant } from "@/components/evilcharts/ui/recharts-tooltip";
import { Brush, EvilBrush, useEvilBrush } from "@/components/evilcharts/ui/recharts-brush";
import type { BrushProps } from "@/components/evilcharts/ui/recharts-brush";
import { ChartLegend, ChartLegendContent } from "@/components/evilcharts/ui/recharts-legend";
import type { ChartLegendVariant } from "@/components/evilcharts/ui/recharts-legend";
import { ChartDot } from "@/components/evilcharts/ui/recharts-dot";
import type { DotVariant } from "@/components/evilcharts/ui/recharts-dot";
import { motion } from "motion/react";
import { useMotionPreference } from "@/hooks/use-appearance";
import * as z from "zod";

const STROKE_WIDTH = 0.8; // default series stroke — <Area strokeWidth> overrides it
const LOADING_AREA_DATA_KEY = "loading";
const LOADING_ANIMATION_DURATION = 2000; // in milliseconds
const STACK_ID = "evil-stacked";
const REVEAL_DURATION = 1; // intro wipe length, in seconds
const REVEAL_EASE: [number, number, number, number] = [0, 0.7, 0.5, 1];

type CurveType = ComponentProps<typeof RechartsArea>["type"];
type AreaDotProp = ComponentProps<typeof RechartsArea>["dot"];
type AreaActiveDotProp = ComponentProps<typeof RechartsArea>["activeDot"];
type AreaVariant = "gradient" | "gradient-reverse" | "solid" | "dotted" | "lines" | "hatched";
type StrokeVariant = "solid" | "dashed" | "animated-dashed";
type StackType = "default" | "expanded" | "stacked";

type AreaAnimationType = "none" | "left-to-right" | "right-to-left" | "center-out" | "edges-in";
type RevealAnimationType = Exclude<AreaAnimationType, "none">;

type AreaChartContextValue = {
  config: ChartConfig;
  curveType: CurveType;
  animationType: AreaAnimationType;
  isStacked: boolean;
  isExpanded: boolean;
  isLoading: boolean;
  selectedDataKey: string | null;
  selectDataKey: (dataKey: string | null) => void;
};

const AreaChartContext = createContext<AreaChartContextValue | null>(null);

function useAreaChart() {
  const context = use(AreaChartContext);

  if (!context) {
    throw new Error(
      "Area chart parts (<Area />, <XAxis />, …) must be used within <EvilAreaChart />",
    );
  }

  return context;
}

type ValidateConfigKeys<TData, TConfig> = {
  [K in keyof TConfig]: K extends keyof TData ? ChartConfig[string] : never;
};

type EvilAreaChartBaseProps<
  TData extends ChartDataRow,
  TConfig extends Record<string, ChartConfig[string]>,
> = {
  config: TConfig & ValidateConfigKeys<TData, TConfig>;
  data: readonly TData[];
  children: ReactNode;
  className?: string;
  chartProps?: ComponentProps<typeof RechartsAreaChart>;
  curveType?: CurveType;
  animationType?: AreaAnimationType;
  stackType?: StackType;
  defaultSelectedDataKey?: string | null;
  onSelectionChange?: (selectedDataKey: string | null) => void;
  isLoading?: boolean;
  loadingPoints?: number;
  xDataKey?: keyof TData & string; // x-axis key — only needed for the <Brush /> footer
};

type EvilAreaChartProps<
  TData extends ChartDataRow,
  TConfig extends Record<string, ChartConfig[string]>,
> = EvilAreaChartBaseProps<TData, TConfig>;

export function EvilAreaChart<
  TData extends ChartDataRow,
  TConfig extends Record<string, ChartConfig[string]>,
>({
  config,
  data,
  children,
  className,
  chartProps,
  curveType = "linear",
  animationType = "left-to-right",
  stackType = "default",
  defaultSelectedDataKey = null,
  onSelectionChange,
  isLoading = false,
  loadingPoints,
  xDataKey,
}: EvilAreaChartProps<TData, TConfig>) {
  const chartId = useId();
  const [selectedDataKey, setSelectedDataKey] = useState<string | null>(defaultSelectedDataKey);
  const { loadingData, onShimmerExit } = useLoadingData(isLoading, loadingPoints);
  const { visibleData, brushProps } = useEvilBrush({ data });

  // Brush is a <Brush /> child now (not props): pull it out of the children so
  // it never reaches the Recharts tree, and drive the footer from its props.
  const brush = useMemo(() => {
    // eslint-disable-next-line react/no-react-children -- Brush arrives as a child element, so the chart splits it out of children (until 2027-04-16, approved by root, pending operator review)
    const parts = Children.toArray(children);
    const brushEl = parts.find((child) => isValidElement(child) && child.type === Brush);
    const bp = (isValidElement(brushEl) ? brushEl.props : {}) as BrushProps;
    const chartChildren = parts.filter((child) => !(isValidElement(child) && child.type === Brush));
    return {
      slot: {
        present: isValidElement(brushEl),
        height: bp.height,
        formatLabel: bp.formatLabel,
        onChange: bp.onChange,
      },
      chartChildren,
      dataKeys: chartChildren.flatMap((child) =>
        isValidElement<AreaProps>(child) && child.type === Area ? [child.props.dataKey] : [],
      ),
    };
  }, [children]);
  const showBrush = brush.slot.present;

  const isExpanded = stackType === "expanded";
  const isStacked = stackType === "stacked" || isExpanded;
  const displayData = showBrush && !isLoading ? visibleData : data;

  const selectDataKey = useCallback(
    (newSelectedDataKey: string | null) => {
      setSelectedDataKey(newSelectedDataKey);
      onSelectionChange?.(newSelectedDataKey);
    },
    [onSelectionChange],
  );

  const contextValue = useMemo<AreaChartContextValue>(
    () => ({
      config,
      curveType,
      animationType,
      isStacked,
      isExpanded,
      isLoading,
      selectedDataKey,
      selectDataKey,
    }),
    [
      config,
      curveType,
      animationType,
      isStacked,
      isExpanded,
      isLoading,
      selectedDataKey,
      selectDataKey,
    ],
  );

  return (
    <AreaChartContext value={contextValue}>
      <ChartContainer
        className={className}
        config={config}
        footer={
          showBrush &&
          !isLoading && (
            <EvilBrush
              data={data}
              chartConfig={config}
              dataKeys={brush.dataKeys}
              xDataKey={xDataKey}
              variant="area"
              curveType={curveType}
              height={brush.slot.height}
              formatLabel={brush.slot.formatLabel}
              stacked={isStacked}
              className="mt-1"
              {...brushProps}
              onChange={(range) => {
                brushProps.onChange(range);
                brush.slot.onChange?.(range);
              }}
            />
          )
        }
      >
        <LoadingIndicator isLoading={isLoading} />
        <RechartsAreaChart
          id={chartId}
          accessibilityLayer
          stackOffset={isExpanded ? "expand" : undefined}
          data={isLoading ? loadingData : displayData}
          {...chartProps}
        >
          {brush.chartChildren}
          {isLoading && (
            <LoadingArea chartId={chartId} curveType={curveType} onShimmerExit={onShimmerExit} />
          )}
        </RechartsAreaChart>
      </ChartContainer>
    </AreaChartContext>
  );
}

type AreaProps = {
  dataKey: string; // series key — must exist on the data and config
  variant?: AreaVariant;
  strokeVariant?: StrokeVariant;
  strokeWidth?: number;
  curveType?: CurveType;
  animationType?: AreaAnimationType;
  connectNulls?: boolean;
  isClickable?: boolean;
  children?: ReactNode;
  areaProps?: ComponentProps<typeof RechartsArea>;
};

function Area({
  dataKey,
  variant = "gradient",
  strokeVariant = "dashed",
  strokeWidth = STROKE_WIDTH,
  curveType,
  animationType,
  connectNulls = false,
  isClickable = false,
  children,
  areaProps,
}: AreaProps) {
  const {
    config,
    curveType: defaultCurve,
    animationType: defaultAnimation,
    isStacked,
    isLoading,
    selectedDataKey,
    selectDataKey,
  } = useAreaChart();
  const id = useId();
  const shouldReduceMotion = useMotionPreference().reduce;

  if (isLoading) return null;

  const resolvedCurve = curveType ?? defaultCurve;

  const revealType: AreaAnimationType = shouldReduceMotion
    ? "none"
    : (animationType ?? defaultAnimation);
  const maskId = revealType === "none" ? undefined : `${id}-reveal-mask`;

  const isSelected = selectedDataKey === dataKey;
  const hasSelection = selectedDataKey !== null;
  const opacity = getOpacity(selectedDataKey, dataKey);
  const showUnselected = hasSelection && !isSelected;

  const { dot, activeDot } = resolveDots(children, id, dataKey, opacity.dot, maskId);

  const isAnimatedDashed = strokeVariant === "animated-dashed";
  const isDashed = strokeVariant === "dashed" || isAnimatedDashed;

  return (
    <>
      <RechartsArea
        type={resolvedCurve}
        dataKey={dataKey}
        connectNulls={connectNulls}
        fillOpacity={opacity.fill}
        strokeOpacity={opacity.stroke}
        fill={getFillPattern(variant, showUnselected, id)}
        stroke={`url(#${id}-colors-${dataKey})`}
        stackId={isStacked ? STACK_ID : undefined}
        dot={dot}
        activeDot={activeDot}
        strokeWidth={strokeWidth}
        strokeDasharray={isDashed ? "3 3" : undefined}
        isAnimationActive={false}
        style={{
          mask: maskId ? `url(#${maskId})` : undefined,
          cursor: isClickable ? "pointer" : undefined,
        }}
        onClick={() => {
          if (!isClickable) return;
          selectDataKey(isSelected ? null : dataKey);
        }}
        {...areaProps}
      >
        {isAnimatedDashed && !hasSelection && <AnimatedDashedStroke />}
      </RechartsArea>
      <defs>
        {revealType !== "none" && <RevealMask id={id} type={revealType} />}
        <ColorGradient id={id} dataKey={dataKey} config={config} />
        {variant === "gradient" && <GradientPattern id={id} dataKey={dataKey} />}
        {variant === "gradient-reverse" && <ReverseGradientPattern id={id} dataKey={dataKey} />}
        {variant === "solid" && <SolidPattern id={id} dataKey={dataKey} />}
        {variant === "dotted" && <DottedPattern id={id} dataKey={dataKey} />}
        {variant === "lines" && <LinesPattern id={id} dataKey={dataKey} />}
        {variant === "hatched" && <HatchedPattern id={id} dataKey={dataKey} />}
        {showUnselected && <UnselectedPattern id={id} dataKey={dataKey} />}
      </defs>
    </>
  );
}

type DotProps = {
  variant?: DotVariant;
};

/**
 * Declares a resting point marker for the <Area /> it is composed inside.
 * It renders nothing on its own — the parent <Area /> reads its variant and
 * wires it into the Recharts dot slot.
 */
const Dot: FC<DotProps> = () => null;

/**
 * Declares the hovered/active point marker for the <Area /> it is composed
 * inside. Like <Dot />, it is a configuration slot and renders nothing itself.
 */
const ActiveDot: FC<DotProps> = () => null;

type XAxisProps = ComponentProps<typeof RechartsXAxis>;

function XAxis({
  tickLine = false,
  axisLine = false,
  tickMargin = 8,
  minTickGap = 8,
  ...props
}: XAxisProps) {
  const { isLoading } = useAreaChart();

  if (isLoading) return null;

  return (
    <RechartsXAxis
      tickLine={tickLine}
      axisLine={axisLine}
      tickMargin={tickMargin}
      minTickGap={minTickGap}
      {...props}
    />
  );
}

type YAxisProps = ComponentProps<typeof RechartsYAxis>;

function YAxis({
  tickLine = false,
  axisLine = false,
  tickMargin = 8,
  minTickGap = 8,
  width = "auto",
  tickFormatter,
  ...props
}: YAxisProps) {
  const { isLoading, isExpanded } = useAreaChart();

  if (isLoading) return null;

  return (
    <RechartsYAxis
      tickLine={tickLine}
      axisLine={axisLine}
      tickMargin={tickMargin}
      minTickGap={minTickGap}
      width={width}
      tickFormatter={isExpanded ? axisValueToPercentFormatter : tickFormatter}
      {...props}
    />
  );
}

type GridProps = ComponentProps<typeof CartesianGrid>;

function Grid({ vertical = false, strokeDasharray = "3 3", ...props }: GridProps) {
  return <CartesianGrid vertical={vertical} strokeDasharray={strokeDasharray} {...props} />;
}

type TooltipProps = {
  variant?: TooltipVariant;
  roundness?: TooltipRoundness;
  defaultIndex?: number;
  cursor?: boolean;
};

function Tooltip({ variant, roundness, defaultIndex, cursor = true }: TooltipProps) {
  const { isLoading, selectedDataKey } = useAreaChart();

  if (isLoading) return null;

  return (
    <ChartTooltip
      defaultIndex={defaultIndex}
      cursor={cursor ? { strokeDasharray: "3 3", strokeWidth: STROKE_WIDTH } : false}
      content={
        <ChartTooltipContent selected={selectedDataKey} roundness={roundness} variant={variant} />
      }
    />
  );
}

type LegendProps = {
  variant?: ChartLegendVariant;
  align?: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
  isClickable?: boolean;
};

function Legend({
  variant,
  align = "right",
  verticalAlign = "top",
  isClickable = false,
}: LegendProps) {
  const { selectedDataKey, selectDataKey } = useAreaChart();

  return (
    <ChartLegend
      verticalAlign={verticalAlign}
      align={align}
      content={
        <ChartLegendContent
          selected={selectedDataKey}
          onSelectChange={selectDataKey}
          isClickable={isClickable}
          variant={variant}
        />
      }
    />
  );
}

const getOpacity = (selectedDataKey: string | null, dataKey: string) => {
  if (selectedDataKey === null) {
    return { fill: 0.8, stroke: 1, dot: 1 };
  }

  return selectedDataKey === dataKey
    ? { fill: 0.8, stroke: 1, dot: 1 }
    : { fill: 0.1, stroke: 0.3, dot: 0.3 };
};

const getFillPattern = (variant: AreaVariant, showUnselected: boolean, id: string): string => {
  if (showUnselected) return `url(#${id}-unselected)`;

  return `url(#${id}-${variant})`;
};

// Pulls <Dot /> and <ActiveDot /> out of an area's children into Recharts dot slots.
// When a `maskId` is given the resting dot is wired to the intro reveal mask so it
// wipes in with the line; the active dot is always left unmasked since it only
// appears on hover, after the intro has finished.
const resolveDots = (
  children: ReactNode,
  id: string,
  dataKey: string,
  dotOpacity: number,
  maskId: string | undefined,
) => {
  let dot: AreaDotProp = false;
  let activeDot: AreaActiveDotProp = false;

  // eslint-disable-next-line react/no-react-children -- Dot and ActiveDot arrive as child elements, so the chart reads its dot config from children (until 2027-04-16, approved by root, pending operator review)
  const dotChildren = Children.toArray(children);
  for (const child of dotChildren) {
    if (!isValidElement(child)) continue;

    if (child.type === Dot) {
      const { variant } = (child as ReactElement<DotProps>).props;
      dot = (
        <ChartDot
          type={variant}
          dataKey={dataKey}
          chartId={id}
          fillOpacity={dotOpacity}
          maskId={maskId}
        />
      );
    }

    if (child.type === ActiveDot) {
      const { variant } = (child as ReactElement<DotProps>).props;
      activeDot = (
        <ChartDot type={variant} dataKey={dataKey} chartId={id} fillOpacity={dotOpacity} />
      );
    }
  }

  return { dot, activeDot };
};

type StyleProps = {
  id: string;
  dataKey: string;
};

const AnimatedDashedStroke = () => {
  return (
    <>
      <animate
        attributeName="stroke-dasharray"
        values="3 3; 0 3; 3 3"
        dur="1s"
        repeatCount="indefinite"
        keyTimes="0;0.5;1"
      />
      <animate
        attributeName="stroke-dashoffset"
        values="0; -6"
        dur="1s"
        repeatCount="indefinite"
        keyTimes="0;1"
      />
    </>
  );
};

const SINGLE_REVEAL_ORIGIN = {
  "left-to-right": 0,
  "right-to-left": 1,
  "center-out": 0.5,
} satisfies Record<Exclude<RevealAnimationType, "edges-in">, number>;

/**
 * `maskUnits`/`maskContentUnits` are both userSpaceOnUse so every masked element
 * shares one coordinate space and the wipe edge lands at the same x on each.
 */
const RevealMask = ({ id, type }: { id: string; type: RevealAnimationType }) => {
  const reveal = {
    initial: { scaleX: 0 },
    animate: { scaleX: 1 },
    transition: { duration: REVEAL_DURATION, ease: REVEAL_EASE },
  };

  return (
    <mask
      id={`${id}-reveal-mask`}
      maskUnits="userSpaceOnUse"
      maskContentUnits="userSpaceOnUse"
      x="0"
      y="0"
      width="100%"
      height="100%"
    >
      {type === "edges-in" ? (
        <>
          <motion.rect
            {...reveal}
            x="0"
            y="0"
            width="50%"
            height="100%"
            fill="white"
            style={{ originX: 0 }}
          />
          <motion.rect
            {...reveal}
            x="50%"
            y="0"
            width="50%"
            height="100%"
            fill="white"
            style={{ originX: 1 }}
          />
        </>
      ) : (
        <motion.rect
          {...reveal}
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="white"
          style={{ originX: SINGLE_REVEAL_ORIGIN[type] }}
        />
      )}
    </mask>
  );
};

const ColorGradient = ({ id, dataKey, config }: StyleProps & { config: ChartConfig }) => {
  const colorsCount = getColorsCount(config[dataKey] ?? {});

  return (
    <linearGradient
      id={`${id}-colors-${dataKey}`}
      x1="0"
      y1="0"
      x2="100%"
      y2="0"
      // Object-bounding-box gradients are invalid for zero-height paths, including flat series.
      gradientUnits="userSpaceOnUse"
    >
      {colorsCount === 1 ? (
        <>
          <stop offset="0%" stopColor={`var(--color-${dataKey}-0)`} />
          <stop offset="100%" stopColor={`var(--color-${dataKey}-0)`} />
        </>
      ) : (
        Array.from({ length: colorsCount }, (_, index) => {
          const offset = `${(index / (colorsCount - 1)) * 100}%`;
          return (
            <stop
              key={offset}
              offset={offset}
              stopColor={`var(--color-${dataKey}-${index}, var(--color-${dataKey}-0))`}
            />
          );
        })
      )}
    </linearGradient>
  );
};

const GradientPattern = ({ id, dataKey }: StyleProps) => {
  return (
    <>
      <linearGradient id={`${id}-vertical-fade`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="white" stopOpacity={0.1} />
        <stop offset="100%" stopColor="white" stopOpacity={0} />
      </linearGradient>
      <mask id={`${id}-gradient-mask`}>
        <rect width="100%" height="100%" fill={`url(#${id}-vertical-fade)`} />
      </mask>
      <pattern id={`${id}-gradient`} patternUnits="userSpaceOnUse" width="100%" height="100%">
        <rect
          width="100%"
          height="100%"
          fill={`url(#${id}-colors-${dataKey})`}
          mask={`url(#${id}-gradient-mask)`}
        />
      </pattern>
    </>
  );
};

const ReverseGradientPattern = ({ id, dataKey }: StyleProps) => {
  return (
    <>
      <linearGradient id={`${id}-vertical-fade-reverse`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="white" stopOpacity={0} />
        <stop offset="100%" stopColor="white" stopOpacity={0.1} />
      </linearGradient>
      <mask id={`${id}-gradient-reverse-mask`}>
        <rect width="100%" height="100%" fill={`url(#${id}-vertical-fade-reverse)`} />
      </mask>
      <pattern
        id={`${id}-gradient-reverse`}
        patternUnits="userSpaceOnUse"
        width="100%"
        height="100%"
      >
        <rect
          width="100%"
          height="100%"
          fill={`url(#${id}-colors-${dataKey})`}
          mask={`url(#${id}-gradient-reverse-mask)`}
        />
      </pattern>
    </>
  );
};

const SolidPattern = ({ id, dataKey }: StyleProps) => {
  return (
    <>
      <linearGradient id={`${id}-solid-fade`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="white" stopOpacity={0.1} />
        <stop offset="100%" stopColor="white" stopOpacity={0.1} />
      </linearGradient>
      <mask id={`${id}-solid-mask`}>
        <rect width="100%" height="100%" fill={`url(#${id}-solid-fade)`} />
      </mask>
      <pattern id={`${id}-solid`} patternUnits="userSpaceOnUse" width="100%" height="100%">
        <rect
          width="100%"
          height="100%"
          fill={`url(#${id}-colors-${dataKey})`}
          mask={`url(#${id}-solid-mask)`}
        />
      </pattern>
    </>
  );
};

const LinesPattern = ({ id, dataKey }: StyleProps) => {
  return (
    <>
      <pattern
        id={`${id}-lines-texture`}
        patternUnits="userSpaceOnUse"
        width="5"
        height="5"
        patternTransform="rotate(45)"
      >
        <line x1="0" y1="0" x2="0" y2="5" stroke="white" strokeWidth="1" />
      </pattern>
      <mask id={`${id}-lines-mask`}>
        <rect width="100%" height="100%" fill={`url(#${id}-lines-texture)`} fillOpacity="0.3" />
      </mask>
      <pattern id={`${id}-lines`} patternUnits="userSpaceOnUse" width="100%" height="100%">
        <rect
          width="100%"
          height="100%"
          fill={`url(#${id}-colors-${dataKey})`}
          mask={`url(#${id}-lines-mask)`}
        />
      </pattern>
    </>
  );
};

const DottedPattern = ({ id, dataKey }: StyleProps) => {
  return (
    <>
      <pattern
        id={`${id}-dotted-texture`}
        x="0"
        y="0"
        width="6"
        height="6"
        patternUnits="userSpaceOnUse"
      >
        <circle cx="4" cy="4" r="0.5" fill="white" />
      </pattern>
      <mask id={`${id}-dotted-mask`}>
        <rect width="100%" height="100%" fill={`url(#${id}-dotted-texture)`} fillOpacity="0.5" />
      </mask>
      <pattern id={`${id}-dotted`} patternUnits="userSpaceOnUse" width="100%" height="100%">
        <rect
          width="100%"
          height="100%"
          fill={`url(#${id}-colors-${dataKey})`}
          mask={`url(#${id}-dotted-mask)`}
        />
      </pattern>
    </>
  );
};

const HatchedPattern = ({ id, dataKey }: StyleProps) => {
  return (
    <>
      <linearGradient id={`${id}-hatched-stripe`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="50%" stopColor="white" stopOpacity={0.2} />
        <stop offset="50%" stopColor="white" stopOpacity={1} />
      </linearGradient>
      <pattern
        id={`${id}-hatched-texture`}
        x="0"
        y="0"
        width="20"
        height="10"
        patternUnits="userSpaceOnUse"
        overflow="visible"
        patternTransform="rotate(20)"
      >
        <rect width="20" height="10" fill={`url(#${id}-hatched-stripe)`} />
      </pattern>
      <mask id={`${id}-hatched-mask`}>
        <rect width="100%" height="100%" fill={`url(#${id}-hatched-texture)`} fillOpacity="0.2" />
      </mask>
      <pattern id={`${id}-hatched`} patternUnits="userSpaceOnUse" width="100%" height="100%">
        <rect
          width="100%"
          height="100%"
          fill={`url(#${id}-colors-${dataKey})`}
          mask={`url(#${id}-hatched-mask)`}
        />
      </pattern>
    </>
  );
};

const UnselectedPattern = ({ id, dataKey }: StyleProps) => {
  return (
    <>
      <pattern
        id={`${id}-unselected-texture`}
        patternUnits="userSpaceOnUse"
        width="5"
        height="5"
        patternTransform="rotate(45)"
      >
        <line x1="0" y1="0" x2="0" y2="5" stroke="white" strokeWidth="1" />
      </pattern>
      <mask id={`${id}-unselected-mask`}>
        <rect
          width="100%"
          height="100%"
          fill={`url(#${id}-unselected-texture)`}
          fillOpacity="0.3"
        />
      </mask>
      <pattern id={`${id}-unselected`} patternUnits="userSpaceOnUse" width="100%" height="100%">
        <rect
          width="100%"
          height="100%"
          fill={`url(#${id}-colors-${dataKey})`}
          mask={`url(#${id}-unselected-mask)`}
        />
      </pattern>
    </>
  );
};

const generateEasedGradientStops = (steps = 17, minOpacity = 0.05, maxOpacity = 0.9) => {
  return Array.from({ length: steps }, (_, i) => {
    const t = i / (steps - 1);
    const eased = Math.sin(t * Math.PI) ** 2;
    const opacity = minOpacity + eased * (maxOpacity - minOpacity);
    return { offset: `${(t * 100).toFixed(0)}%`, opacity: Number(opacity.toFixed(3)) };
  });
};

/**
 * Hook to manage loading data with pixel-perfect shimmer synchronization.
 *
 * Uses motion.dev's onUpdate callback to ensure chart data is only regenerated
 * when the shimmer has completely exited the visible area. This eliminates
 * timing drift issues from setTimeout/setInterval.
 */
export function useLoadingData(isLoading: boolean, loadingPoints = 14) {
  const [loadingDataKey, setLoadingDataKey] = useState(false);

  const onShimmerExit = useCallback(() => {
    if (isLoading) {
      setLoadingDataKey((prev) => !prev);
    }
  }, [isLoading]);

  const loadingData = useMemo(
    () => getLoadingData(loadingPoints),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadingDataKey is unread, and its toggle recomputes the loading data when the shimmer exits (until 2027-04-16, approved by root, pending operator review)
    [loadingPoints, loadingDataKey],
  );

  return { loadingData, onShimmerExit };
}

const LoadingArea = ({
  chartId,
  curveType,
  onShimmerExit,
}: {
  chartId: string;
  curveType: CurveType;
  onShimmerExit: () => void;
}) => {
  return (
    <>
      <RechartsArea
        type={curveType}
        dataKey={LOADING_AREA_DATA_KEY}
        fillOpacity={0.05}
        fill="currentColor"
        stroke="currentColor"
        strokeOpacity={0.5}
        isAnimationActive={false}
        legendType="none"
        tooltipType="none"
        activeDot={false}
        dot={false}
        style={{ mask: `url(#${chartId}-loading-mask)` }}
      />
      <defs>
        <LoadingPattern chartId={chartId} onShimmerExit={onShimmerExit} />
      </defs>
    </>
  );
};

/**
 * Animated shimmer pattern for the loading skeleton.
 *
 * The visible chart area is normalized to 0-1, the shimmer gradient has width 1,
 * and the pattern is 3x wide so the shimmer has buffer on both sides. The motion
 * rect travels x from -1 to 2; onShimmerExit fires as it crosses x=1, letting the
 * data swap happen while the shimmer is off-screen for a seamless loop.
 */
const LoadingPattern = ({
  chartId,
  onShimmerExit,
}: {
  chartId: string;
  onShimmerExit: () => void;
}) => {
  const shouldReduceMotion = useMotionPreference().reduce;
  const gradientStops = generateEasedGradientStops();

  // 1 (left buffer) + 1 (visible) + 1 (right buffer)
  const patternWidth = 3;
  const startX = -1;
  const endX = 2;

  const lastXRef = useRef(startX);

  return (
    <>
      <linearGradient id={`${chartId}-loading-gradient`} x1="0" y1="0" x2="1" y2="0">
        {gradientStops.map(({ offset, opacity }) => (
          <stop key={offset} offset={offset} stopColor="white" stopOpacity={opacity} />
        ))}
      </linearGradient>
      <pattern
        id={`${chartId}-loading-pattern`}
        patternUnits="objectBoundingBox"
        patternContentUnits="objectBoundingBox"
        patternTransform="rotate(25)"
        width={patternWidth}
        height="1"
        x="0"
        y="0"
      >
        {shouldReduceMotion ? (
          <rect x={startX} width={patternWidth} height="1" fill="white" />
        ) : (
          <motion.rect
            y="0"
            width="1"
            height="1"
            fill={`url(#${chartId}-loading-gradient)`}
            initial={{ x: startX }}
            animate={{ x: endX }}
            transition={{
              duration: LOADING_ANIMATION_DURATION / 1000,
              ease: "linear",
              repeat: Infinity,
              repeatType: "loop",
            }}
            onUpdate={(latest) => {
              const latestX = z.number().safeParse(latest.x);
              const xValue = latestX.success ? latestX.data : startX;
              const lastX = lastXRef.current;

              // Fire once per loop, when the shimmer fully exits the visible area
              if (xValue >= 1 && lastX < 1) {
                onShimmerExit();
              }

              lastXRef.current = xValue;
            }}
          />
        )}
      </pattern>
      <mask id={`${chartId}-loading-mask`} maskUnits="userSpaceOnUse">
        <rect width="100%" height="100%" fill={`url(#${chartId}-loading-pattern)`} />
      </mask>
    </>
  );
};

EvilAreaChart.Area = Area;
EvilAreaChart.Dot = Dot;
EvilAreaChart.ActiveDot = ActiveDot;
EvilAreaChart.XAxis = XAxis;
EvilAreaChart.YAxis = YAxis;
EvilAreaChart.Grid = Grid;
EvilAreaChart.Tooltip = Tooltip;
EvilAreaChart.Legend = Legend;
EvilAreaChart.Brush = Brush;
