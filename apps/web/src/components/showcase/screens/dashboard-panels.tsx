import type { ReactNode } from "react";
import { format, setDate, startOfMonth } from "date-fns";
import { Image01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { NextIcon, PreviousIcon } from "@/lib/icons";

type CategoryShare = {
  readonly name: string;
  readonly color: string;
  readonly count: number;
  readonly value: number;
};

const CATEGORIES = [
  { name: "Prepainted", color: "var(--category-prepainted)", count: 145, value: 15_490.76 },
  { name: "Plushes", color: "var(--category-plushes)", count: 23, value: 627.04 },
  { name: "Books", color: "var(--category-books)", count: 20, value: 564.03 },
  { name: "Trading", color: "var(--category-trading)", count: 19, value: 183.02 },
  { name: "Action/Dolls", color: "var(--category-action-dolls)", count: 9, value: 637.76 },
  { name: "Model Kits", color: "var(--category-model-kits)", count: 8, value: 363.32 },
  { name: "Misc", color: "var(--category-misc)", count: 6, value: 103.2 },
  { name: "Hanged up", color: "var(--category-hanged-up)", count: 3, value: 94.65 },
  { name: "Linens", color: "var(--category-linens)", count: 3, value: 139.8 },
  { name: "Music", color: "var(--category-music)", count: 1, value: 23.94 },
] as const satisfies readonly CategoryShare[];

/** The legend rows above the list's clipped edge. */
const VISIBLE_LEGEND_ROWS = 8;

/** Orders releasing in each month of this year, January first. */
const MONTHLY_ORDERS: readonly number[] = [4, 6, 3, 5, 4, 8, 5, 6, 6, 6, 5, 8];

type Release = {
  readonly day: number;
  readonly title: string;
  readonly category: string;
  readonly color: string;
  readonly image: string | null;
  readonly price: string | null;
};

const RELEASES = [
  {
    day: 1,
    title: "Saya no Uta - Saya - 1/7 (Wing)",
    category: "Prepainted",
    color: "var(--category-prepainted)",
    image: "/example-item7.webp",
    price: "¥23,800",
  },
  {
    day: 11,
    title: "Magical Mirai official album",
    category: "Music",
    color: "var(--category-music)",
    image: null,
    price: null,
  },
  {
    day: 14,
    title: "Vocaloid - Hatsune Miku - 1/7 - Shaohua (Myethos)",
    category: "Prepainted",
    color: "var(--category-prepainted)",
    image: "/example-item4.webp",
    price: "¥29,800",
  },
  {
    day: 18,
    title: "Kasane Teto single",
    category: "Music",
    color: "var(--category-music)",
    image: null,
    price: null,
  },
] as const satisfies readonly Release[];

const RELEASE_COUNT = 6;

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

const SCROLL_FADE_CLASS_NAME =
  "[mask-image:linear-gradient(to_bottom,#000_0,#000_calc(100%-min(12%,40px)),transparent_100%)]";

function Panel({ title, children }: { readonly title: ReactNode; readonly children: ReactNode }) {
  return (
    <div className="relative -mx-3 flex min-h-[320px] flex-col">
      <header className="flex flex-col px-3 py-2">{title}</header>
      <div className="relative flex grow flex-col overflow-hidden rounded-2xl p-3">{children}</div>
    </div>
  );
}

function PanelTitle({ children }: { readonly children: ReactNode }) {
  return <h2 className="text-base font-medium">{children}</h2>;
}

export function CollectionBreakdown() {
  const total = CATEGORIES.reduce((sum, category) => sum + category.count, 0);
  const count: number = CATEGORIES.length;
  return (
    <Panel
      title={
        <PanelTitle>
          {total} {total === 1 ? "item" : "items"} across {count}{" "}
          {count === 1 ? "category" : "categories"}
        </PanelTitle>
      }
    >
      <div className="flex flex-1 flex-col gap-3">
        <div className="flex h-2.5 w-full overflow-hidden rounded-sm">
          {CATEGORIES.map((category) => (
            <div
              key={category.name}
              className="first:rounded-l-sm last:rounded-r-sm"
              style={{
                width: `${Math.max((category.count / total) * 100, 3)}%`,
                backgroundColor: category.color,
              }}
            />
          ))}
        </div>
        <div
          className={`-mx-3 flex max-h-50 flex-col overflow-hidden pb-4 ${SCROLL_FADE_CLASS_NAME}`}
        >
          {CATEGORIES.slice(0, VISIBLE_LEGEND_ROWS).map((category) => (
            <div key={category.name} className="flex items-center gap-2.5 px-3 py-1">
              <div
                className="h-4 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: category.color }}
              />
              <span className="truncate text-sm text-foreground">{category.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {category.count}
              </span>
              <span className="ml-auto shrink-0 text-sm font-medium tabular-nums">
                {usd.format(category.value)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

const CHART = { width: 412, height: 256, left: 35, top: 10, bottom: 226, barWidth: 25 } as const;
const CHART_MAX = 8;
const BAR_RADIUS = 6.25;

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function barPath(x: number, y: number, width: number, height: number): string {
  const r = BAR_RADIUS;
  const [left, top, right, bottom] = [x, y, x + width, y + height].map(round);
  return [
    `M ${left},${round(y + r)}`,
    `A ${r},${r},0,0,1,${round(x + r)},${top}`,
    `L ${round(x + width - r)},${top}`,
    `A ${r},${r},0,0,1,${right},${round(y + r)}`,
    `L ${right},${round(y + height - r)}`,
    `A ${r},${r},0,0,1,${round(x + width - r)},${bottom}`,
    `L ${round(x + r)},${bottom}`,
    `A ${r},${r},0,0,1,${left},${round(y + height - r)} Z`,
  ].join(" ");
}

export function OrdersBarChart({ now }: { readonly now: Date }) {
  const activeMonth = now.getMonth();
  const activeCount = MONTHLY_ORDERS[activeMonth] ?? 0;
  const band = (CHART.width - CHART.left) / MONTHLY_ORDERS.length;
  const plotHeight = CHART.bottom - CHART.top;
  const lineY = CHART.bottom - (activeCount / CHART_MAX) * plotHeight;
  const labelWidth = String(activeCount).length * 8 + 10;

  return (
    <Panel
      title={
        <PanelTitle>
          {activeCount} {activeCount === 1 ? "order" : "orders"} releasing in {format(now, "MMMM")}
        </PanelTitle>
      }
    >
      <div className="relative min-h-56 flex-1">
        {/* The app's chart is its own compositing layer, which rounds the faded bars' colour. */}
        <svg
          width={CHART.width}
          height={CHART.height}
          viewBox={`0 0 ${CHART.width} ${CHART.height}`}
          className="absolute inset-0 block text-xs will-change-transform"
        >
          {MONTHLY_ORDERS.map((count, index) => {
            const height = (count / CHART_MAX) * plotHeight;
            const x = CHART.left + index * band + (band - CHART.barWidth) / 2;
            return (
              <path
                key={index}
                fill="var(--primary)"
                opacity={index === activeMonth ? 1 : 0.32}
                d={barPath(x, CHART.bottom - height, CHART.barWidth, height)}
              />
            );
          })}
          <line
            opacity={0.4}
            stroke="var(--foreground)"
            strokeDasharray="3 3"
            x1={CHART.left}
            y1={lineY}
            x2={CHART.width}
            y2={lineY}
          />
          <rect
            x={0}
            y={lineY - 9}
            width={labelWidth}
            height={18}
            rx={4}
            fill="var(--foreground)"
          />
          <text
            x={labelWidth / 2}
            y={lineY}
            fontWeight={500}
            textAnchor="middle"
            dominantBaseline="central"
            fill="var(--background)"
            className="tabular-nums"
          >
            {activeCount}
          </text>
          <line
            stroke="var(--border)"
            x1={CHART.left}
            y1={CHART.bottom}
            x2={CHART.width}
            y2={CHART.bottom}
          />
          {MONTHLY_ORDERS.map((_, index) => {
            const x = CHART.left + (index + 0.5) * band;
            return (
              <text
                key={index}
                x={x}
                y={CHART.bottom + 16}
                fontSize={11}
                textAnchor="middle"
                fill="var(--muted-foreground)"
              >
                <tspan x={x} dy="0.71em">
                  {format(new Date(2000, index, 1), "MMM")}
                </tspan>
              </text>
            );
          })}
        </svg>
      </div>
    </Panel>
  );
}

function ReleaseRow({ release }: { readonly release: Release }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 overflow-hidden p-1.5">
      <div className="relative size-9 shrink-0 overflow-hidden rounded-md bg-muted after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:border after:border-(--image-edge)">
        {release.image === null ? (
          <div className="flex size-full items-center justify-center bg-muted">
            <HugeiconsIcon icon={Image01Icon} className="size-4 text-muted-foreground" />
          </div>
        ) : (
          <div className="size-full overflow-hidden">
            <img
              alt={release.title}
              src={release.image}
              className="h-full w-full object-cover object-top"
            />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm leading-tight font-medium">{release.title}</p>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          <span
            className="block min-w-0 truncate text-xs leading-4"
            style={{ color: release.color }}
          >
            {release.category}
          </span>
          {release.price === null ? null : (
            <span className="shrink-0 tabular-nums">{release.price}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function MonthButton({ icon }: { readonly icon: typeof NextIcon }) {
  return (
    <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-transparent text-foreground">
      <HugeiconsIcon icon={icon} className="size-3.5" />
    </span>
  );
}

export function ReleaseCalendar({ now }: { readonly now: Date }) {
  const month = startOfMonth(now);
  return (
    <Panel
      title={
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-1.5">
            <PanelTitle>{format(month, "MMMM yyyy")}</PanelTitle>
            <span className="relative inline-flex h-5 w-fit min-w-5 shrink-0 items-center justify-center gap-1 rounded-sm border border-border bg-transparent px-1.25 py-0.5 text-xs font-medium whitespace-nowrap tabular-nums dark:bg-input/32">
              {RELEASE_COUNT}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <MonthButton icon={PreviousIcon} />
            <MonthButton icon={NextIcon} />
          </div>
        </div>
      }
    >
      <div className={`-mx-3 max-h-56 overflow-hidden pb-6 ${SCROLL_FADE_CLASS_NAME}`}>
        {RELEASES.map((release) => (
          <div key={release.title}>
            <div className="flex items-center gap-2 px-3 pb-1">
              <span className="shrink-0 text-xs font-medium text-muted-foreground">
                {format(setDate(month, release.day), "EEE, MMM d")}
              </span>
            </div>
            <div className="px-3">
              <ReleaseRow release={release} />
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
