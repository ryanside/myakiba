import { HugeiconsIcon } from "@hugeicons/react";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { Roll, Stage, Window } from "@/components/stageshow/kit";
import type { Act, Layout, Point } from "@/components/stageshow/kit";
import { DisclosureIcon } from "@/lib/icons";
import type { DemoProps } from "../demo-props";
import "./expenses-scrub.css";

// Scrubbing the Expenses page's cumulative Collection Spend chart. Beats: the
// chart at rest with the headline on the latest total; the pointer comes up
// into the plot and a dashed hairline and a ringed dot pick up the month
// under it; the headline's amount and month roll as the pointer runs right
// across the year, crossing the spring jump; it settles on August, the
// year's big jump, and holds; then it drops out of the plot and the headline
// rolls back to the latest total. Loops.
//
// Copied from the chart-scrub gold: the headline is the readout (no tooltip
// box), one eased stroke along the line, the hairline at the pointer and the
// dot on the drawn line under it, the readout always a real month (the
// nearest). The chart itself is drawn the way the app's EvilAreaChart draws
// it: a linear 1.5px line in --chart-1, a fill fading from 8% to nothing,
// dashed horizontal grid lines, compact currency ticks and a brush under it.
//
// Real strings: the scope tabs, the readout's label and
// amount, the chart select. Axis ticks are the chart's own data.

type S = { readonly month: number | null; readonly x: number | null };

const MONTHS = ["Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov"];
const YEARS = [2025, 2026, 2026, 2026, 2026, 2026, 2026, 2026, 2026, 2026, 2026, 2026];
// Collection Spend per month in cents: the saved price of each Owned
// Collection Item, by its Realized Expense Date. March and August are the jumps.
const SPEND = [
  64_218, 38_945, 51_730, 168_412, 45_120, 60_875, 39_468, 52_310, 341_590, 46_815, 68_140, 55_920,
];
const CUMULATIVE = SPEND.reduce<number[]>((sums, cents) => {
  sums.push((sums.at(-1) ?? 0) + cents);
  return sums;
}, []);
const LAST = CUMULATIVE.length - 1;
const TOTAL = CUMULATIVE[LAST] ?? 0;
// The axis tops out at $12K, in ticks of $3K, as Recharts' nice ticks put it
const MAX = 1_200_000;
const TICKS = [0, 300_000, 600_000, 900_000, 1_200_000];
// The month the pointer settles on: August, the year's big jump
const NOTE = 8;
const ENTRY = 1;

const money = (cents: number): string => formatCurrencyFromMinorUnits(cents, "USD", "en-US");
const compact = (cents: number): string =>
  formatCurrencyFromMinorUnits(cents, "USD", "en-US", { compact: true });
const through = (month: number): string =>
  `Collection Spend through ${MONTHS[month] ?? ""} ${YEARS[month] ?? ""}`;

// The plot's size per design: the window's content column less the y-axis
const PLOT = {
  wide: { width: 776, height: 152 },
  compact: { width: 240, height: 140 },
} as const satisfies Record<Layout, { width: number; height: number }>;

// Where the cursor waits between loops: below the stage, out of sight
const REST = {
  wide: { x: 200, y: 480 },
  compact: { x: 100, y: 440 },
} as const satisfies Record<Layout, Point>;

function geometry(layout: Layout) {
  const { width, height } = PLOT[layout];
  const step = width / LAST;
  const xOf = (i: number): number => i * step;
  const yOf = (cents: number): number => height * (1 - cents / MAX);
  const points = CUMULATIVE.map((cents, i) => ({ x: xOf(i), y: yOf(cents) }));
  // The y of the drawn (linear) line at x
  const yAt = (x: number): number => {
    const clamped = Math.max(0, Math.min(width, x));
    const i = Math.min(LAST - 1, Math.floor(clamped / step));
    const a = points[i];
    const b = points[i + 1];
    if (!a || !b) return height;
    return a.y + ((b.y - a.y) * (clamped - a.x)) / step;
  };
  const nearest = (x: number): number => Math.max(0, Math.min(LAST, Math.round(x / step)));
  return { width, height, step, xOf, yOf, points, yAt, nearest };
}

async function script(a: Act<S>): Promise<void> {
  const g = geometry(a.layout);
  const box = a.rect("plot");
  // The pointer rides a little under the line, so the arrow never covers the dot
  const under = (x: number): number => Math.min(g.yAt(x) + 16, box.height - 8);
  const at = (i: number): Point => {
    const x = g.xOf(i);
    return { x: box.x + x, y: box.y + under(x) };
  };
  let month: number | null = null;
  // The readout is the month nearest the pointer while it's over the plot,
  // and lets go as it crosses the plot's edge
  const track = (pt: Point): void => {
    const x = pt.x - box.x;
    const y = pt.y - box.y;
    const inside = x >= 0 && x <= box.width && y >= 0 && y <= box.height;
    if (inside) {
      month = g.nearest(x);
      a.put({ month, x });
    } else if (month !== null) {
      month = null;
      a.put({ month: null });
    }
  };
  const straight = (e: number, from: Point, to: Point): Point => ({
    x: from.x + (to.x - from.x) * e,
    y: from.y + (to.y - from.y) * e,
  });

  // Under the entry month, still out of sight below the stage
  const rest = REST[a.layout];
  a.place({ x: at(ENTRY).x, y: rest.y });
  await a.wait(1000);
  // Up into the plot at January
  a.mark("enter");
  await a.move(at(ENTRY), { duration: 900, path: straight, onMove: track });
  await a.wait(700);
  // One stroke along the line, across March, to August: a hand running the
  // curve, the same distance under it all the way
  a.mark("scrub");
  const along = (e: number, from: Point, to: Point): Point => {
    const x = from.x + (to.x - from.x) * e;
    return { x, y: box.y + under(x - box.x) };
  };
  await a.move(at(NOTE), { duration: 3000, path: along, onMove: track });
  a.mark("settle");
  await a.wait(2600);
  // Down out of the plot: the headline rolls back to the latest total
  a.mark("leave");
  const out = at(NOTE);
  await a.move({ x: out.x, y: rest.y }, { duration: 700, path: straight, onMove: track });
  await a.wait(1100);
  // The hairline has faded where it was; forget its place, unseen
  await a.snap({ x: null });
  a.place(rest);
}

export function ExpensesScrubDemo({ theme }: DemoProps) {
  return (
    <Stage<S>
      width={960}
      height={440}
      compact={{ below: 560, width: 358, height: 400 }}
      theme={theme}
      play="loop"
      initial={{ month: null, x: null }}
      poster={{ month: NOTE, x: null }}
      script={script}
      cursor={{ at: { wide: REST.wide, compact: REST.compact } }}
      className="look-myakiba mk-expenses-scrub"
    >
      {(s, _rect, layout) => {
        const g = geometry(layout);
        const wide = layout === "wide";
        const hx = s.x ?? (s.month === null ? null : g.xOf(s.month));
        const on = s.month !== null && hx !== null;
        const amount = s.month === null ? TOTAL : (CUMULATIVE[s.month] ?? TOTAL);
        const line = g.points.map((p) => `${p.x},${p.y}`).join(" ");
        const area = `M0,${g.height} L${g.points.map((p) => `${p.x},${p.y}`).join(" L")} L${g.width},${g.height} Z`;
        const labels = wide ? MONTHS.map((_, i) => i) : [0, 2, 4, 6, 8, 10];
        return (
          <Window className="mk-expenses-scrub-win">
            <div className="mk-expenses-scrub-body">
              {wide ? (
                <div className="mk-expenses-scrub-tabs" aria-hidden>
                  <span className="mk-expenses-scrub-tab" data-active="">
                    Collection
                  </span>
                  <span className="mk-expenses-scrub-tab">Orders</span>
                  <span className="mk-expenses-scrub-tab">Shipping</span>
                </div>
              ) : null}
              <div className="mk-expenses-scrub-head">
                <div className="mk-expenses-scrub-readout">
                  <div className="mk-expenses-scrub-month">
                    <Roll>{through(s.month ?? LAST)}</Roll>
                  </div>
                  <div className="mk-expenses-scrub-amount">
                    <Roll stagger={25}>{money(amount)}</Roll>
                  </div>
                </div>
                {wide ? (
                  <span className="mk-expenses-scrub-select">
                    Cumulative
                    <HugeiconsIcon icon={DisclosureIcon} size={16} strokeWidth={2} />
                  </span>
                ) : null}
              </div>
              <div className="mk-expenses-scrub-chart">
                <div className="mk-expenses-scrub-yaxis" style={{ height: g.height }}>
                  {TICKS.map((t) => (
                    <span key={t} style={{ top: g.yOf(t) }}>
                      {compact(t)}
                    </span>
                  ))}
                </div>
                <div
                  className="mk-expenses-scrub-plot"
                  data-target="plot"
                  style={{ width: g.width, height: g.height }}
                >
                  <svg width={g.width} height={g.height} aria-hidden>
                    <defs>
                      <linearGradient
                        id={`mk-expenses-scrub-fill-${layout}`}
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop offset="0" stopColor="var(--chart-1)" stopOpacity={0.1} />
                        <stop offset="1" stopColor="var(--chart-1)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    {TICKS.map((t) => (
                      <line
                        key={t}
                        className="mk-expenses-scrub-grid"
                        x1={0}
                        x2={g.width}
                        y1={g.yOf(t)}
                        y2={g.yOf(t)}
                      />
                    ))}
                    <path d={area} fill={`url(#mk-expenses-scrub-fill-${layout})`} />
                    <polyline className="mk-expenses-scrub-line" points={line} />
                    <g className="mk-expenses-scrub-hover" data-on={on ? "" : undefined}>
                      {hx === null ? null : (
                        <>
                          <line
                            className="mk-expenses-scrub-hair"
                            x1={hx}
                            x2={hx}
                            y1={0}
                            y2={g.height}
                          />
                          <circle className="mk-expenses-scrub-dot" cx={hx} cy={g.yAt(hx)} r={4} />
                        </>
                      )}
                    </g>
                  </svg>
                </div>
                <div className="mk-expenses-scrub-xaxis" style={{ width: g.width }}>
                  {labels.map((i) => (
                    <span key={i} style={{ left: g.xOf(i) }}>
                      {MONTHS[i]}
                    </span>
                  ))}
                </div>
                {wide ? (
                  <div className="mk-expenses-scrub-brush" style={{ width: g.width }}>
                    <svg width={g.width - 2} height={54} aria-hidden>
                      <polygon
                        className="mk-expenses-scrub-brush-area"
                        points={`0,54 ${g.points.map((p) => `${(p.x * (g.width - 2)) / g.width},${8 + (p.y / g.height) * 42}`).join(" ")} ${g.width - 2},54`}
                      />
                    </svg>
                    <span className="mk-expenses-scrub-grip" data-side="start" />
                    <span className="mk-expenses-scrub-grip" data-side="end" />
                  </div>
                ) : null}
              </div>
            </div>
          </Window>
        );
      }}
    </Stage>
  );
}
