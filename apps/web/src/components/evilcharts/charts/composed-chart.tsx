"use client";

import {
  ChartContainer,
  getColorsCount,
  getLoadingData,
  LoadingIndicator,
  toChartColorVarKey,
} from "@/components/evilcharts/ui/chart";
import type { ChartConfig } from "@/components/evilcharts/ui/chart";
import { EvilBrush, useEvilBrush } from "@/components/evilcharts/ui/evil-brush";
import type { EvilBrushRange } from "@/components/evilcharts/ui/evil-brush";
import { ChartLegend, ChartLegendContent } from "@/components/evilcharts/ui/legend";
import type { ChartLegendVariant } from "@/components/evilcharts/ui/legend";
import { ChartTooltip, ChartTooltipContent } from "@/components/evilcharts/ui/tooltip";
import type { TooltipRoundness, TooltipVariant } from "@/components/evilcharts/ui/tooltip";
import { createContext, use, useCallback, useId, useMemo, useRef, useState } from "react";
import type { ComponentProps, ReactNode } from "react";
import type { Line as RechartsLine } from "recharts";
import {
  Bar as RechartsBar,
  CartesianGrid,
  ComposedChart as RechartsComposedChart,
  XAxis as RechartsXAxis,
  YAxis as RechartsYAxis,
} from "recharts";
import { motion, useReducedMotion } from "motion/react";

// Constants
const STROKE_WIDTH = 2;
const DEFAULT_BAR_RADIUS = 4;
const LOADING_DATA_KEY = "loading";
const LOADING_ANIMATION_DURATION = 2000; // in milliseconds
const REVEAL_EASE: [number, number, number, number] = [0, 0.7, 0.5, 1]; // intro easing
const BAR_GROW_DURATION = 0.5; // per-bar grow-in length, in seconds
const BAR_STAGGER = 0.05; // delay between consecutive bars, in seconds

type CurveType = ComponentProps<typeof RechartsLine>["type"];
type BarVariant = "default" | "hatched" | "duotone" | "duotone-reverse" | "gradient" | "stripped";

/**
 * Direction of the custom motion.dev intro. Recharts' own animation is
 * permanently disabled — lines wipe in along this direction, while bars grow up
 * from their baseline staggered in this same order.
 *
 * NOTE: the intro is a per-frame animation, heavier than a static chart.
 * `"none"` opts out — as does a device with the OS "reduce motion" preference.
 */
type ComposedAnimationType = "none" | "left-to-right" | "right-to-left" | "center-out" | "edges-in";

// ─────────────────────────────────────────────────────────────────────────────
// Shared context
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Shared state for every part of the chart. Lifted into <EvilComposedChart /> so
 * that <Bar />, <Line />, <XAxis />, <Legend />, and friends can read it without
 * prop drilling. Sub-components are composed freely — the provider is the single
 * source of truth.
 */
type ComposedChartContextValue = {
  config: ChartConfig; // colors + labels for every bar and line series
  curveType: CurveType; // default curve interpolation each <Line /> inherits
  animationType: ComposedAnimationType; // default intro each <Bar />/<Line /> inherits
  introStartedAt: number; // timestamp the chart mounted — anchors the one-shot intro
  dataLength: number; // number of rows currently rendered
  isLoading: boolean; // whether the chart shows its loading skeleton
  hoveredIndex: number | null; // data index currently hovered, or null when none
  selectedDataKey: string | null; // currently selected series, or null when none
  selectDataKey: (dataKey: string | null) => void; // sets the selected series
};

const ComposedChartContext = createContext<ComposedChartContextValue | null>(null);

// Reads the chart context, throwing a helpful error when used outside <EvilComposedChart />
function useComposedChart() {
  const context = use(ComposedChartContext);

  if (!context) {
    throw new Error(
      "Composed chart parts (<Bar />, <Line />, <XAxis />, …) must be used within <EvilComposedChart />",
    );
  }

  return context;
}

// ─────────────────────────────────────────────────────────────────────────────
// Root container
// ─────────────────────────────────────────────────────────────────────────────

// Validates that every config key also exists on the data row type
type ValidateConfigKeys<TData, TConfig> = {
  [K in keyof TConfig]: K extends keyof TData ? ChartConfig[string] : never;
};

type EvilComposedChartBaseProps<
  TData extends Record<string, unknown>,
  TConfig extends Record<string, ChartConfig[string]>,
> = {
  config: TConfig & ValidateConfigKeys<TData, TConfig>; // series colors + labels for bars and lines
  data: TData[]; // rows rendered by the chart
  children: ReactNode; // composed parts — <Bar />, <Line />, <XAxis />, <Legend />, …
  className?: string; // extra classes for the chart container
  chartProps?: ComponentProps<typeof RechartsComposedChart>; // escape hatch for the raw Recharts chart
  curveType?: CurveType; // default curve interpolation for every <Line />
  animationType?: ComposedAnimationType; // default intro for every <Bar /> and <Line />
  barGap?: number; // gap between bars sharing a category
  barCategoryGap?: number; // gap between bar categories
  defaultSelectedDataKey?: string | null; // series selected on first render
  onSelectionChange?: (selectedDataKey: string | null) => void; // fires when the selected series changes
  isLoading?: boolean; // shows the animated loading skeleton
  loadingBars?: number; // number of bars in the loading skeleton
  showBrush?: boolean; // renders a zoom brush below the chart
  xDataKey?: keyof TData & string; // x-axis key — only needed for the brush footer
  brushHeight?: number; // height of the brush preview in pixels
  brushFormatLabel?: (value: unknown, index: number) => string; // formats brush axis labels
  onBrushChange?: (range: EvilBrushRange) => void; // fires when the brush range changes
};

type EvilComposedChartProps<
  TData extends Record<string, unknown>,
  TConfig extends Record<string, ChartConfig[string]>,
> = EvilComposedChartBaseProps<TData, TConfig>;

/**
 * Root of the composible composed chart. Owns the data, the shared context, the
 * loading skeleton, and the optional zoom brush. Everything visual — axes, grid,
 * tooltip, legend, and the bars and lines themselves — is composed as children,
 * so a consumer renders exactly the parts they need.
 */
export function EvilComposedChart<
  TData extends Record<string, unknown>,
  TConfig extends Record<string, ChartConfig[string]>,
>({
  config,
  data,
  children,
  className,
  chartProps,
  curveType = "linear",
  animationType = "left-to-right",
  barGap,
  barCategoryGap,
  defaultSelectedDataKey = null,
  onSelectionChange,
  isLoading = false,
  loadingBars,
  showBrush = false,
  xDataKey,
  brushHeight,
  brushFormatLabel,
  onBrushChange,
}: EvilComposedChartProps<TData, TConfig>) {
  const chartId = useId().replaceAll(":", ""); // colon-free id keeps CSS/SVG selectors valid
  // Anchors the intro to a fixed moment so it plays exactly once — re-renders
  // and Recharts remounts read elapsed time from here instead of replaying.
  const [introStartedAt] = useState(() => Date.now());
  const [selectedDataKey, setSelectedDataKey] = useState<string | null>(defaultSelectedDataKey);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const { loadingData, onShimmerExit } = useLoadingData(isLoading, loadingBars);
  const { visibleData, brushProps } = useEvilBrush({ data });

  const displayData = showBrush && !isLoading ? visibleData : data;

  // Updates selection state and notifies the parent
  const selectDataKey = useCallback(
    (newSelectedDataKey: string | null) => {
      setSelectedDataKey(newSelectedDataKey);
      onSelectionChange?.(newSelectedDataKey);
    },
    [onSelectionChange],
  );

  const contextValue = useMemo<ComposedChartContextValue>(
    () => ({
      config,
      curveType,
      animationType,
      introStartedAt,
      dataLength: displayData.length,
      isLoading,
      hoveredIndex,
      selectedDataKey,
      selectDataKey,
    }),
    [
      config,
      curveType,
      animationType,
      introStartedAt,
      displayData.length,
      isLoading,
      hoveredIndex,
      selectedDataKey,
      selectDataKey,
    ],
  );

  return (
    <ComposedChartContext value={contextValue}>
      <ChartContainer
        className={className}
        config={config}
        footer={
          showBrush &&
          !isLoading && (
            <EvilBrush
              data={data}
              chartConfig={config}
              xDataKey={xDataKey}
              variant="area"
              curveType={curveType}
              height={brushHeight}
              formatLabel={brushFormatLabel}
              skipStyle
              className="mt-1"
              {...brushProps}
              onChange={(range) => {
                brushProps.onChange(range);
                onBrushChange?.(range);
              }}
            />
          )
        }
      >
        <LoadingIndicator isLoading={isLoading} />
        <RechartsComposedChart
          id={chartId}
          accessibilityLayer
          data={isLoading ? loadingData : displayData}
          barGap={barGap}
          barCategoryGap={barCategoryGap}
          onMouseLeave={() => setHoveredIndex(null)}
          {...chartProps}
        >
          {children}
          {isLoading && (
            <LoadingBar
              chartId={chartId}
              barRadius={DEFAULT_BAR_RADIUS}
              onShimmerExit={onShimmerExit}
            />
          )}
        </RechartsComposedChart>
      </ChartContainer>
    </ComposedChartContext>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Composible parts
// ─────────────────────────────────────────────────────────────────────────────

type BarProps = {
  dataKey: string; // series key — must exist on the data and config
  variant?: BarVariant; // fill style for this bar only
  radius?: number; // corner radius of the bar in pixels
  glow?: boolean; // applies a soft neon glow to this bar
  animationType?: ComposedAnimationType; // grow-in order — falls back to the chart default
  isClickable?: boolean; // lets this bar be selected by clicking it
  enableHoverHighlight?: boolean; // dims this bar when another column is hovered
  barProps?: ComponentProps<typeof RechartsBar>; // escape hatch for raw Recharts Bar props
};

/**
 * A single bar series. Each <Bar /> is fully self-contained: it generates its
 * own gradient/pattern definitions under a unique id, so any number of bars —
 * each with its own variant, glow, and clickability — can live in one chart
 * without style collisions.
 */
export function Bar({
  dataKey,
  variant = "default",
  radius = DEFAULT_BAR_RADIUS,
  glow = false,
  animationType,
  isClickable = false,
  enableHoverHighlight = false,
  barProps,
}: BarProps) {
  const {
    config,
    animationType: defaultAnimation,
    introStartedAt,
    dataLength,
    isLoading,
    hoveredIndex,
    selectedDataKey,
    selectDataKey,
  } = useComposedChart();
  const id = useId().replaceAll(":", ""); // unique id scopes this bar's style defs
  // Devices set to "reduce motion" skip the grow-in animation entirely
  const shouldReduceMotion = useReducedMotion();

  // The root renders the skeleton bar while loading, so real bars step aside
  if (isLoading) return null;

  const isSelected = selectedDataKey === null || selectedDataKey === dataKey;
  const filter = glow ? `url(#${id}-glow)` : undefined;

  // The grow-in is a per-frame animation — heavier than a static chart — so
  // `"none"` and the OS reduce-motion preference both opt out of it.
  const revealType: ComposedAnimationType = shouldReduceMotion
    ? "none"
    : (animationType ?? defaultAnimation);

  return (
    <>
      <RechartsBar
        dataKey={dataKey}
        fill={`url(#${id}-bar-colors)`}
        radius={radius}
        // Recharts' built-in bar animation is permanently disabled — every bar
        // instead grows in from its baseline via the staggered motion.dev shape.
        isAnimationActive={false}
        style={isClickable || enableHoverHighlight ? { cursor: "pointer" } : undefined}
        shape={(props: unknown) => {
          const barShapeProps = props as BarShapeProps;
          const index = typeof barShapeProps.index === "number" ? barShapeProps.index : -1;

          return (
            <CustomBar
              {...barShapeProps}
              id={id}
              variant={variant}
              barRadius={radius}
              filter={filter}
              fillOpacity={getBarOpacity({
                isClickable,
                isSelected,
                selectedDataKey,
                enableHoverHighlight,
                hoveredIndex,
                index,
              })}
              isClickable={isClickable}
              enableHoverHighlight={enableHoverHighlight}
              animationType={revealType}
              dataLength={dataLength}
              introStartedAt={introStartedAt}
              onClick={() => {
                if (!isClickable) return;
                selectDataKey(selectedDataKey === dataKey ? null : dataKey);
              }}
            />
          );
        }}
        {...barProps}
      />
      <defs>
        <VerticalColorGradient id={id} dataKey={dataKey} config={config} />
        {variant === "hatched" && <HatchedPattern id={id} dataKey={dataKey} />}
        {variant === "duotone" && <DuotonePattern id={id} dataKey={dataKey} config={config} />}
        {variant === "duotone-reverse" && (
          <DuotoneReversePattern id={id} dataKey={dataKey} config={config} />
        )}
        {variant === "gradient" && <GradientPattern id={id} dataKey={dataKey} />}
        {variant === "stripped" && <StrippedPattern id={id} dataKey={dataKey} />}
        {glow && <BarGlowFilter id={id} />}
      </defs>
    </>
  );
}

type XAxisProps = ComponentProps<typeof RechartsXAxis>;

/**
 * The horizontal category axis. Ships with the chart's flat default styling and
 * forwards every Recharts XAxis prop, so `dataKey`, `tickFormatter`, etc. are
 * passed straight through. Hidden automatically while the chart is loading.
 */
export function XAxis({
  tickLine = false,
  axisLine = false,
  tickMargin = 8,
  minTickGap = 8,
  ...props
}: XAxisProps) {
  const { isLoading } = useComposedChart();

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

/**
 * The vertical value axis. Forwards every Recharts YAxis prop straight through.
 * Hidden automatically while the chart is loading.
 */
export function YAxis({
  tickLine = false,
  axisLine = false,
  tickMargin = 8,
  minTickGap = 8,
  width = "auto",
  ...props
}: YAxisProps) {
  const { isLoading } = useComposedChart();

  if (isLoading) return null;

  return (
    <RechartsYAxis
      tickLine={tickLine}
      axisLine={axisLine}
      tickMargin={tickMargin}
      minTickGap={minTickGap}
      width={width}
      {...props}
    />
  );
}

type GridProps = ComponentProps<typeof CartesianGrid>;

/**
 * The background grid lines. Defaults to horizontal-only dashed lines and
 * forwards every Recharts CartesianGrid prop for full control.
 */
export function Grid({ vertical = false, strokeDasharray = "3 3", ...props }: GridProps) {
  return <CartesianGrid vertical={vertical} strokeDasharray={strokeDasharray} {...props} />;
}

type TooltipProps = {
  variant?: TooltipVariant; // visual style of the tooltip surface
  roundness?: TooltipRoundness; // border-radius of the tooltip
  defaultIndex?: number; // data index shown by default with no hover
  cursor?: boolean; // whether the vertical cursor line follows the pointer
  valueFormatter?: (value: number) => string; // formats numeric tooltip values
};

/**
 * The hover tooltip. Reads the chart's selection from context so its content
 * dims unselected series. Hidden automatically while the chart is loading.
 */
export function Tooltip({
  variant,
  roundness,
  defaultIndex,
  cursor = true,
  valueFormatter,
}: TooltipProps) {
  const { isLoading, selectedDataKey } = useComposedChart();

  if (isLoading) return null;

  return (
    <ChartTooltip
      defaultIndex={defaultIndex}
      cursor={cursor ? { strokeDasharray: "3 3", strokeWidth: STROKE_WIDTH } : false}
      content={
        <ChartTooltipContent
          selected={selectedDataKey}
          roundness={roundness}
          variant={variant}
          formatter={
            valueFormatter
              ? (value, name, item) => (
                  <>
                    <div
                      className="size-2.5 shrink-0 rounded-[2px]"
                      style={{
                        background: `var(--color-${toChartColorVarKey(String(item.dataKey))}-0)`,
                      }}
                    />
                    <div className="flex flex-1 justify-between gap-4 leading-none">
                      <span className="text-muted-foreground">{String(name)}</span>
                      <span className="text-foreground font-mono font-medium tabular-nums">
                        {typeof value === "number" ? valueFormatter(value) : String(value)}
                      </span>
                    </div>
                  </>
                )
              : undefined
          }
        />
      }
    />
  );
}

type LegendProps = {
  variant?: ChartLegendVariant; // visual style of the legend indicators
  align?: "left" | "center" | "right"; // horizontal placement
  verticalAlign?: "top" | "middle" | "bottom"; // vertical placement
  isClickable?: boolean; // lets each entry toggle selection of its series
};

/**
 * The series legend. When `isClickable` is set, each entry toggles selection of
 * its series, driving the shared selection state read by every <Bar /> and <Line />.
 */
export function Legend({
  variant,
  align = "right",
  verticalAlign = "top",
  isClickable = false,
}: LegendProps) {
  const { selectedDataKey, selectDataKey } = useComposedChart();

  return (
    <ChartLegend
      width="100%"
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

// ─────────────────────────────────────────────────────────────────────────────
// Selection + dot helpers
// ─────────────────────────────────────────────────────────────────────────────

// Returns the fill opacity for a bar, accounting for both selection and hover state
const getBarOpacity = ({
  isClickable,
  isSelected,
  selectedDataKey,
  enableHoverHighlight,
  hoveredIndex,
  index,
}: {
  isClickable: boolean;
  isSelected: boolean;
  selectedDataKey: string | null;
  enableHoverHighlight: boolean;
  hoveredIndex: number | null;
  index: number;
}) => {
  let clickOpacity = 1;
  if (isClickable && selectedDataKey !== null) {
    clickOpacity = isSelected ? 1 : 0.3;
  }

  if (enableHoverHighlight && hoveredIndex !== null) {
    return hoveredIndex === index ? clickOpacity : clickOpacity * 0.3;
  }

  return clickOpacity;
};

// ─────────────────────────────────────────────────────────────────────────────
// Custom bar shape
// ─────────────────────────────────────────────────────────────────────────────

// Props Recharts passes to a bar's custom shape renderer
type BarShapeProps = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  fillOpacity?: number;
  dataKey?: string;
  index?: number;
  background?: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  };
  [key: string]: unknown;
};

type CustomBarProps = {
  id: string; // unique id of the owning <Bar />
  variant: BarVariant; // fill style of the bar
  barRadius: number; // corner radius of the bar
  filter?: string; // optional glow filter reference
  isClickable?: boolean; // whether the bar is selectable by click
  enableHoverHighlight?: boolean; // whether hovering a column dims the others
  animationType?: ComposedAnimationType; // grow-in order for this bar
  dataLength?: number; // total bars in the series — drives the stagger
  introStartedAt?: number; // chart-mount timestamp anchoring the one-shot grow-in
  onClick?: () => void; // fired when a clickable bar is clicked
} & BarShapeProps;

// Renders a single bar rectangle with its variant fill, glow, and hit area
const CustomBar = ({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  fillOpacity = 1,
  background,
  index = -1,
  id,
  variant,
  barRadius,
  filter,
  isClickable,
  enableHoverHighlight,
  animationType = "none",
  dataLength = 0,
  introStartedAt = 0,
  onClick,
}: CustomBarProps) => {
  const cursorStyle = isClickable || enableHoverHighlight ? { cursor: "pointer" } : undefined;
  const hitAreaX = background?.x ?? x;
  const hitAreaY = background?.y ?? y;
  const hitAreaWidth = background?.width ?? width;
  const hitAreaHeight = background?.height ?? height;

  // motion.dev grow-in props for this bar — an empty object once it has finished
  const grow = getBarGrowAnimation(animationType, index, dataLength, introStartedAt) ?? {};

  const getFill = () => {
    switch (variant) {
      case "hatched":
        return `url(#${id}-hatched)`;
      case "duotone":
        return `url(#${id}-duotone)`;
      case "duotone-reverse":
        return `url(#${id}-duotone-reverse)`;
      case "gradient":
        return `url(#${id}-gradient)`;
      case "stripped":
        return `url(#${id}-stripped)`;
      default:
        return `url(#${id}-bar-colors)`;
    }
  };

  // Full-height invisible rect — keeps the column hoverable even mid grow-in
  const hitArea = enableHoverHighlight ? (
    <rect
      x={hitAreaX}
      y={hitAreaY}
      width={hitAreaWidth}
      height={hitAreaHeight}
      fill="transparent"
    />
  ) : null;

  if (variant === "stripped") {
    return (
      <g style={cursorStyle} onClick={onClick}>
        <motion.g
          {...grow}
          filter={filter}
          opacity={fillOpacity}
          className="transition-opacity duration-200"
        >
          <rect x={x} y={y} width={width} height={height} fill={getFill()} />
          <rect x={x} y={y} width={width} height={2} fill={`url(#${id}-bar-colors)`} />
        </motion.g>
        {hitArea}
      </g>
    );
  }

  return (
    <g style={cursorStyle} onClick={onClick}>
      <motion.g {...grow}>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          rx={barRadius}
          ry={barRadius}
          fill={getFill()}
          opacity={fillOpacity}
          filter={filter}
          className="transition-opacity duration-200"
        />
      </motion.g>
      {hitArea}
    </g>
  );
};

/**
 * Builds the motion.dev grow-in animation for a single bar, or returns `null`
 * when it should render statically (`"none"`, an unknown index, or — crucially —
 * once the bar has already finished growing).
 *
 * The intro is anchored to `introStartedAt` (stamped once when the chart mounts)
 * rather than to component mount. Recharts remounts every bar whenever the chart
 * re-renders, so a mount-based animation would replay endlessly; reading elapsed
 * time instead makes it a true one-shot — a bar past its window renders static,
 * a bar caught mid-grow resumes from where it should already be.
 */
const getBarGrowAnimation = (
  animationType: ComposedAnimationType,
  index: number,
  dataLength: number,
  introStartedAt: number,
) => {
  if (animationType === "none" || index < 0 || dataLength <= 0) return null;

  const lastIndex = dataLength - 1;
  const center = lastIndex / 2;

  // How many bars this one waits behind before it starts growing
  let step: number;
  switch (animationType) {
    case "right-to-left":
      step = lastIndex - index;
      break;
    case "center-out":
      step = Math.abs(index - center);
      break;
    case "edges-in":
      step = center - Math.abs(index - center);
      break;
    default: // left-to-right
      step = index;
  }

  const startMs = step * BAR_STAGGER * 1000;
  const durationMs = BAR_GROW_DURATION * 1000;
  const endMs = startMs + durationMs;
  const elapsed = Date.now() - introStartedAt;

  // Already finished — render static so re-renders/remounts can't replay it
  if (elapsed >= endMs) return null;

  // Resume from wherever this bar should already be (0 before it starts)
  const from = elapsed <= startMs ? 0 : (elapsed - startMs) / durationMs;

  return {
    initial: { scaleY: from },
    animate: { scaleY: 1 },
    transition: {
      duration: (endMs - Math.max(elapsed, startMs)) / 1000,
      ease: REVEAL_EASE,
      delay: Math.max(0, startMs - elapsed) / 1000,
    },
    style: { originY: 1 }, // grow upward from the baseline
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Style definitions — one set per <Bar /> / <Line />, scoped to its unique id
// ─────────────────────────────────────────────────────────────────────────────

type StyleProps = {
  id: string; // unique id of the owning series
  dataKey: string; // series key the colors belong to
};

/** Vertical top-to-bottom color gradient — the fill source for every bar variant. */
const VerticalColorGradient = ({ id, dataKey, config }: StyleProps & { config: ChartConfig }) => {
  const colorsCount = getColorsCount(config[dataKey] ?? {});
  const colorKey = toChartColorVarKey(dataKey);

  return (
    <linearGradient id={`${id}-bar-colors`} x1="0" y1="0" x2="0" y2="1">
      {colorsCount === 1 ? (
        <>
          <stop offset="0%" stopColor={`var(--color-${colorKey}-0)`} />
          <stop offset="100%" stopColor={`var(--color-${colorKey}-0)`} />
        </>
      ) : (
        Array.from({ length: colorsCount }, (_, index) => {
          const offset = `${(index / (colorsCount - 1)) * 100}%`;
          return (
            <stop
              key={offset}
              offset={offset}
              stopColor={`var(--color-${colorKey}-${index}, var(--color-${colorKey}-0))`}
            />
          );
        })
      )}
    </linearGradient>
  );
};

/** Hatched diagonal-stripe fill for a bar, masked from the series color gradient. */
const HatchedPattern = ({ id }: StyleProps) => {
  return (
    <>
      <pattern
        id={`${id}-hatched-mask-pattern`}
        x="0"
        y="0"
        width="5"
        height="5"
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(-45)"
      >
        <rect width="5" height="5" fill="white" fillOpacity={0.3} />
        <rect width="1.5" height="5" fill="white" fillOpacity={1} />
      </pattern>
      <mask id={`${id}-hatched-mask`}>
        <rect width="100%" height="100%" fill={`url(#${id}-hatched-mask-pattern)`} />
      </mask>
      <pattern id={`${id}-hatched`} patternUnits="userSpaceOnUse" width="100%" height="100%">
        <rect
          width="100%"
          height="100%"
          fill={`url(#${id}-bar-colors)`}
          mask={`url(#${id}-hatched-mask)`}
        />
      </pattern>
    </>
  );
};

/** Two-tone fill that splits each bar into a light and a full-strength half. */
const DuotonePattern = ({ id, dataKey, config }: StyleProps & { config: ChartConfig }) => {
  const colorsCount = getColorsCount(config[dataKey] ?? {});
  const colorKey = toChartColorVarKey(dataKey);

  return (
    <>
      <linearGradient
        id={`${id}-duotone-mask-gradient`}
        gradientUnits="objectBoundingBox"
        x1="0"
        y1="0"
        x2="1"
        y2="0"
      >
        <stop offset="50%" stopColor="white" stopOpacity={0.4} />
        <stop offset="50%" stopColor="white" stopOpacity={1} />
      </linearGradient>
      <linearGradient
        id={`${id}-duotone-colors`}
        gradientUnits="objectBoundingBox"
        x1="0"
        y1="0"
        x2="0"
        y2="1"
      >
        {colorsCount === 1 ? (
          <>
            <stop offset="0%" stopColor={`var(--color-${colorKey}-0)`} />
            <stop offset="100%" stopColor={`var(--color-${colorKey}-0)`} />
          </>
        ) : (
          Array.from({ length: colorsCount }, (_, index) => {
            const offset = `${(index / (colorsCount - 1)) * 100}%`;
            return (
              <stop
                key={offset}
                offset={offset}
                stopColor={`var(--color-${colorKey}-${index}, var(--color-${colorKey}-0))`}
              />
            );
          })
        )}
      </linearGradient>
      <mask id={`${id}-duotone-mask`} maskContentUnits="objectBoundingBox">
        <rect x="0" y="0" width="1" height="1" fill={`url(#${id}-duotone-mask-gradient)`} />
      </mask>
      <pattern
        id={`${id}-duotone`}
        patternUnits="objectBoundingBox"
        patternContentUnits="objectBoundingBox"
        width="1"
        height="1"
      >
        <rect
          x="0"
          y="0"
          width="1"
          height="1"
          fill={`url(#${id}-duotone-colors)`}
          mask={`url(#${id}-duotone-mask)`}
        />
      </pattern>
    </>
  );
};

/** Two-tone fill mirrored from `duotone` — the full-strength half comes first. */
const DuotoneReversePattern = ({ id, dataKey, config }: StyleProps & { config: ChartConfig }) => {
  const colorsCount = getColorsCount(config[dataKey] ?? {});
  const colorKey = toChartColorVarKey(dataKey);

  return (
    <>
      <linearGradient
        id={`${id}-duotone-reverse-mask-gradient`}
        gradientUnits="objectBoundingBox"
        x1="0"
        y1="0"
        x2="1"
        y2="0"
      >
        <stop offset="50%" stopColor="white" stopOpacity={1} />
        <stop offset="50%" stopColor="white" stopOpacity={0.4} />
      </linearGradient>
      <linearGradient
        id={`${id}-duotone-reverse-colors`}
        gradientUnits="objectBoundingBox"
        x1="0"
        y1="0"
        x2="0"
        y2="1"
      >
        {colorsCount === 1 ? (
          <>
            <stop offset="0%" stopColor={`var(--color-${colorKey}-0)`} />
            <stop offset="100%" stopColor={`var(--color-${colorKey}-0)`} />
          </>
        ) : (
          Array.from({ length: colorsCount }, (_, index) => {
            const offset = `${(index / (colorsCount - 1)) * 100}%`;
            return (
              <stop
                key={offset}
                offset={offset}
                stopColor={`var(--color-${colorKey}-${index}, var(--color-${colorKey}-0))`}
              />
            );
          })
        )}
      </linearGradient>
      <mask id={`${id}-duotone-reverse-mask`} maskContentUnits="objectBoundingBox">
        <rect x="0" y="0" width="1" height="1" fill={`url(#${id}-duotone-reverse-mask-gradient)`} />
      </mask>
      <pattern
        id={`${id}-duotone-reverse`}
        patternUnits="objectBoundingBox"
        patternContentUnits="objectBoundingBox"
        width="1"
        height="1"
      >
        <rect
          x="0"
          y="0"
          width="1"
          height="1"
          fill={`url(#${id}-duotone-reverse-colors)`}
          mask={`url(#${id}-duotone-reverse-mask)`}
        />
      </pattern>
    </>
  );
};

/** Gradient fill for a bar that fades from visible at the top toward transparent. */
const GradientPattern = ({ id }: StyleProps) => {
  return (
    <>
      <linearGradient id={`${id}-gradient-mask-gradient`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="20%" stopColor="white" stopOpacity={1} />
        <stop offset="90%" stopColor="white" stopOpacity={0} />
      </linearGradient>
      <mask id={`${id}-gradient-mask`}>
        <rect width="100%" height="100%" fill={`url(#${id}-gradient-mask-gradient)`} />
      </mask>
      <pattern id={`${id}-gradient`} patternUnits="userSpaceOnUse" width="100%" height="100%">
        <rect
          width="100%"
          height="100%"
          fill={`url(#${id}-bar-colors)`}
          mask={`url(#${id}-gradient-mask)`}
        />
      </pattern>
    </>
  );
};

/** Low-opacity gradient fill paired with the solid top strip drawn by `CustomBar`. */
const StrippedPattern = ({ id }: StyleProps) => {
  return (
    <>
      <linearGradient id={`${id}-stripped-mask-gradient`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="white" stopOpacity={0.4} />
        <stop offset="100%" stopColor="white" stopOpacity={0.1} />
      </linearGradient>
      <mask id={`${id}-stripped-mask`}>
        <rect width="100%" height="100%" fill={`url(#${id}-stripped-mask-gradient)`} />
      </mask>
      <pattern id={`${id}-stripped`} patternUnits="userSpaceOnUse" width="100%" height="100%">
        <rect
          width="100%"
          height="100%"
          fill={`url(#${id}-bar-colors)`}
          mask={`url(#${id}-stripped-mask)`}
        />
      </pattern>
    </>
  );
};

/** Soft outer-glow filter applied to a glowing bar. */
const BarGlowFilter = ({ id }: { id: string }) => {
  return (
    <filter id={`${id}-glow`} x="-100%" y="-100%" width="300%" height="300%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blur" />
      <feColorMatrix
        in="blur"
        type="matrix"
        values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.5 0"
        result="glow"
      />
      <feMerge>
        <feMergeNode in="glow" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Loading skeleton
// ─────────────────────────────────────────────────────────────────────────────

// Builds bell-curve eased gradient stops for the loading shimmer
const generateEasedGradientStops = (steps = 17, minOpacity = 0.05, maxOpacity = 0.9) => {
  return Array.from({ length: steps }, (_, i) => {
    const t = i / (steps - 1); // 0 to 1
    // Sine-based bell curve easing: peaks at center (t=0.5), smooth falloff at edges
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
export function useLoadingData(isLoading: boolean, loadingBars = 12) {
  const [loadingDataKey, setLoadingDataKey] = useState(false);

  // Callback fired by motion.dev when the shimmer exits the visible area
  const onShimmerExit = useCallback(() => {
    if (isLoading) {
      setLoadingDataKey((prev) => !prev);
    }
  }, [isLoading]);

  const loadingData = useMemo(
    () => getLoadingData(loadingBars, 20, 80),
    // loadingDataKey toggle triggers re-computation when the shimmer exits
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loadingBars, loadingDataKey],
  );

  return { loadingData, onShimmerExit };
}

/**
 * The skeleton bar shown while the chart is loading. Rendered by the root in
 * place of the real bars and lines, paired with its own masked shimmer pattern.
 */
const LoadingBar = ({
  chartId,
  barRadius,
  onShimmerExit,
}: {
  chartId: string;
  barRadius: number;
  onShimmerExit: () => void;
}) => {
  return (
    <>
      <RechartsBar
        dataKey={LOADING_DATA_KEY}
        fill="currentColor"
        fillOpacity={0.15}
        radius={barRadius}
        isAnimationActive={false}
        legendType="none"
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
  const gradientStops = generateEasedGradientStops();

  // 1 (left buffer) + 1 (visible) + 1 (right buffer)
  const patternWidth = 3;
  const startX = -1;
  const endX = 2;

  // Tracks the last x value to detect the exit threshold crossing
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
            const xValue = typeof latest.x === "number" ? latest.x : startX;
            const lastX = lastXRef.current;

            // Fire once per loop, when the shimmer fully exits the visible area
            if (xValue >= 1 && lastX < 1) {
              onShimmerExit();
            }

            lastXRef.current = xValue;
          }}
        />
      </pattern>
      <mask id={`${chartId}-loading-mask`} maskUnits="userSpaceOnUse">
        <rect width="100%" height="100%" fill={`url(#${chartId}-loading-pattern)`} />
      </mask>
    </>
  );
};
