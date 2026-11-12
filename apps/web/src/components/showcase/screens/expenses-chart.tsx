import { getYear } from "date-fns";

const ID = "showcase-expenses-chart";

/** Spend to date at the end of each year, oldest first, as the chart plots it. */
const POINTS = [
  { x: 50, y: 215.703 },
  { x: 225, y: 177.408 },
  { x: 400, y: 129.931 },
  { x: 575, y: 75.078 },
  { x: 750, y: 25.915 },
] as const;

const AREA_LINE = `M${POINTS.map((point) => `${point.x},${point.y}`).join("L")}`;
const AREA_BASE = `${POINTS.toReversed()
  .map((point) => `L${point.x},241`)
  .join("")}Z`;

const GRID_LINES = [241, 182, 123, 64, 5] as const;

const Y_TICKS = [
  { y: 241, label: "$0" },
  { y: 182, label: "$5K" },
  { y: 123, label: "$10K" },
  { y: 64, label: "$15K" },
  { y: 9, label: "$20K" },
] as const;

/** Year ticks, oldest first. The last label is pulled in to end at the chart's right edge. */
const X_TICKS = [
  { x: 50, anchor: "middle" },
  { x: 225, anchor: "middle" },
  { x: 400, anchor: "middle" },
  { x: 575, anchor: "middle" },
  { x: 755, anchor: "end" },
] as const;

const COLOR = "var(--chart-1)";

function MainChart({ now }: { readonly now: Date }) {
  const lastYear = getYear(now);
  return (
    <svg width="755" height="276" viewBox="0 0 755 276" className="block">
      <g>
        {GRID_LINES.map((y) => (
          <line
            key={y}
            x1="50"
            y1={y}
            x2="750"
            y2={y}
            fill="none"
            strokeDasharray="3 3"
            className="stroke-border/50"
          />
        ))}
      </g>
      <defs>
        <linearGradient
          id={`${ID}-colors`}
          x1="0"
          y1="0"
          x2="100%"
          y2="0"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor={COLOR} />
          <stop offset="100%" stopColor={COLOR} />
        </linearGradient>
        <linearGradient id={`${ID}-fade`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="white" stopOpacity="0.1" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <mask id={`${ID}-mask`}>
          <rect width="100%" height="100%" fill={`url(#${ID}-fade)`} />
        </mask>
        <pattern id={`${ID}-fill`} patternUnits="userSpaceOnUse" width="100%" height="100%">
          <rect width="100%" height="100%" fill={`url(#${ID}-colors)`} mask={`url(#${ID}-mask)`} />
        </pattern>
      </defs>
      <path d={`${AREA_LINE}${AREA_BASE}`} fill={`url(#${ID}-fill)`} fillOpacity="0.8" />
      <path d={AREA_LINE} fill="none" stroke={`url(#${ID}-colors)`} strokeWidth="1.5" />
      {POINTS.map((point) => (
        <Dot key={point.x} x={point.x} y={point.y} />
      ))}
      <g fill="#666">
        {X_TICKS.map((tick, index) => (
          <text key={tick.x} x={tick.x} y="255" textAnchor={tick.anchor}>
            <tspan x={tick.x} dy="0.71em">
              {lastYear - X_TICKS.length + 1 + index}
            </tspan>
          </text>
        ))}
        {Y_TICKS.map((tick) => (
          <text key={tick.label} x="36" y={tick.y} textAnchor="end">
            <tspan x="36" dy="0.355em">
              {tick.label}
            </tspan>
          </text>
        ))}
      </g>
    </svg>
  );
}

function Dot({ x, y }: { readonly x: number; readonly y: number }) {
  const clip = `${ID}-dot-${x}`;
  return (
    <g className="text-background">
      <defs>
        <clipPath id={clip}>
          <circle cx={x} cy={y} r="3.5" />
        </clipPath>
      </defs>
      <circle cx={x} cy={y} r="6" fill="currentColor" />
      <rect
        x="0"
        y={y - 3.5}
        width="100%"
        height="7"
        fill={`url(#${ID}-colors)`}
        clipPath={`url(#${clip})`}
      />
    </g>
  );
}

/** The cumulative collection spending chart. */
export function CumulativeChart({ now }: { readonly now: Date }) {
  return (
    <div className="min-h-0 w-full flex-1">
      <div className="relative flex h-full min-h-0 w-full flex-1 flex-col justify-center text-xs">
        <div className="min-h-0 w-full flex-1">
          <MainChart now={now} />
        </div>
      </div>
    </div>
  );
}
