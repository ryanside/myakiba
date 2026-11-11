import { useCallback, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Edit03Icon, MoreHorizontalIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { Stage, Text } from "@/components/stageshow/kit";
import type { Act, Theme } from "@/components/stageshow/kit";
import type { DemoProps } from "../demo-props";
import "./feature-bento.css";

//   Tile        Span   Kind        The one thing                          Moves
//   Collection  2 × 1  Collection  the gallery, one figure selected        (still)
//   Releases    1 × 1  Component   this month's release list              (still)
//   Categories  1 × 1  Diagram     the stacked bar and its top categories  (still)
//   Spend       1 × 1  Stat        Total Spent, Unpaid Costs under it      (still)
//   Shipping    1 × 1  Diagram     the average cost of each method         bars grow in on hover
//
// One app surface hangs from a corner (the release list); the gallery runs
// off three edges of its tile; the rest sit on the tile's ground. The copy
// is page text in the bottom-left corner of every tile. Each picture is its
// own Stage at the size of the slot it sits in, so its type stays 1:1.

type Size = { readonly width: number; readonly height: number };

/** The slot a picture fills, measured as the grid reflows. */
function useSlot(): readonly [(node: HTMLDivElement | null) => () => void, Size | null] {
  const [size, setSize] = useState<Size | null>(null);
  const ref = useCallback((node: HTMLDivElement | null) => {
    if (!node) return () => {};
    const observer = new ResizeObserver((entries) => {
      const box = entries.at(0)?.contentRect;
      if (!box) return;
      const width = Math.round(box.width);
      const height = Math.round(box.height);
      setSize((prev) =>
        prev && prev.width === width && prev.height === height ? prev : { width, height },
      );
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, size] as const;
}

function Tile({
  area,
  title,
  line,
  children,
}: {
  readonly area: string;
  readonly title: string;
  readonly line: string;
  readonly children: ReactNode;
}) {
  return (
    <section className={`mk-feature-bento-tile mk-feature-bento-tile--${area}`} data-crop>
      {children}
      <p className="mk-feature-bento-copy">
        <span className="mk-feature-bento-copy__title">{title}</span>
        <span className="mk-feature-bento-copy__line">{line}</span>
      </p>
    </section>
  );
}

/** A tile's picture: a Stage the size of its slot. */
function Picture<S extends object>({
  theme,
  name,
  initial,
  poster,
  script,
  play,
  children,
}: {
  readonly theme: Theme;
  readonly name: string;
  readonly initial?: S;
  readonly poster?: S;
  readonly script?: (a: Act<S>) => Promise<void>;
  readonly play?: "hover";
  readonly children: (s: S, size: Size) => ReactNode;
}) {
  const [ref, size] = useSlot();
  return (
    <div ref={ref} className={`mk-feature-bento-picture mk-feature-bento-picture--${name}`}>
      {size && (
        <Stage<S>
          width={size.width}
          height={size.height}
          initial={initial}
          poster={poster}
          script={script}
          play={play}
          theme={theme}
          className="look-myakiba mk-feature-bento-stage"
        >
          {(s) => children(s, size)}
        </Stage>
      )}
    </div>
  );
}

const img = (n: number) => `/example-item${n}.webp`;

/* ---------------- Collection (hero) ---------------- */

// The Collection page in its gallery layout: square photos 8px apart, cropped
// from the top, rounded like the app's. Three rows from the bottom up, the
// top one cut by the tile; half a column off each side. Item 1 is a book
// cover with a real artist's name, so it never appears.
// Each step right moves one photo along, each row up moves three, so no
// photo touches a copy of itself, diagonals included.
const PHOTOS = [5, 6, 4, 2, 7, 3] as const;
const photoAt = (row: number, col: number) => PHOTOS[(col + 3 * row) % PHOTOS.length] ?? 4;

function Gallery({ width, height }: Size) {
  // Whole columns between two half columns, so both side cuts match
  const whole = Math.max(2, Math.round(width / 190));
  const tile = (width - 8 * (whole + 1)) / (whole + 1);
  const pitch = tile + 8;
  const columns = whole + 2;
  // The selected figure: the middle column, in the higher of the whole rows
  const wholeRows = Math.floor((height + 8) / pitch);
  const focus = { row: wholeRows >= 2 ? 1 : 0, col: Math.ceil(whole / 2) };
  return (
    <div className="mk-feature-bento-gallery" style={{ "--tile": `${tile}px` } as CSSProperties}>
      {[0, 1, 2].map((r) =>
        Array.from({ length: columns }, (_, c) => {
          const n = photoAt(r, c);
          const selected = r === focus.row && c === focus.col;
          return (
            <div
              key={`${r}-${c}`}
              className="mk-feature-bento-photo"
              data-selected={selected || undefined}
              style={{ left: -tile / 2 + c * pitch, top: height - tile - r * pitch }}
            >
              <img src={img(n)} alt="" draggable={false} />
              {selected && (
                <span className="mk-feature-bento-controls">
                  <span className="mk-feature-bento-check">
                    <HugeiconsIcon icon={Tick02Icon} size={10} strokeWidth={2.5} />
                  </span>
                  <span className="mk-feature-bento-control">
                    <HugeiconsIcon icon={Edit03Icon} size={12} />
                  </span>
                  <span className="mk-feature-bento-control">
                    <HugeiconsIcon icon={MoreHorizontalIcon} size={12} />
                  </span>
                </span>
              )}
            </div>
          );
        }),
      )}
    </div>
  );
}

/* ---------------- Releases ---------------- */

// The dashboard's release calendar for November 2026: date groups, then rows
// of thumbnail, title, category in its color and price.
const RELEASES = [
  {
    day: "Sat, Nov 14",
    items: [
      { title: "Rin Kasumi 1/7 Scale", category: "Prepainted", price: "$179.99", image: 7 },
      { title: "Mochi Plush", category: "Plushes", price: "$28.00", image: 3 },
    ],
  },
  {
    day: "Fri, Nov 27",
    items: [
      { title: "Yui Tsukimori 1/6 Scale", category: "Prepainted", price: "$242.50", image: 5 },
    ],
  },
] as const;

const CATEGORY_COLOR = {
  Prepainted: "var(--category-prepainted)",
  Plushes: "var(--category-plushes)",
  Trading: "var(--category-trading)",
  "Action/Dolls": "var(--category-action-dolls)",
  "Garage Kits": "var(--category-garage-kits)",
  Misc: "var(--category-misc)",
} as const;

function Releases() {
  return (
    <div className="mk-feature-bento-panel">
      <div className="mk-feature-bento-releases__head">
        <span className="mk-feature-bento-releases__month">November 2026</span>
        <span className="mk-feature-bento-releases__count">5</span>
      </div>
      <div className="mk-feature-bento-releases__list">
        {RELEASES.map((group) => (
          <div key={group.day}>
            <div className="mk-feature-bento-releases__day">{group.day}</div>
            {group.items.map((item) => (
              <div key={item.title} className="mk-feature-bento-release">
                <img
                  className="mk-feature-bento-release__thumb"
                  src={img(item.image)}
                  alt=""
                  draggable={false}
                />
                <span className="mk-feature-bento-release__text">
                  <span className="mk-feature-bento-release__title">{item.title}</span>
                  <span className="mk-feature-bento-release__meta">
                    <span style={{ color: CATEGORY_COLOR[item.category] }}>{item.category}</span>
                    <span>{item.price}</span>
                  </span>
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Categories ---------------- */

// The dashboard's collection breakdown: 131 items across six categories, a
// stacked bar in the category colors, then the legend rows by count.
const CATEGORIES = [
  { name: "Prepainted", count: 64, value: "$6,120.00" },
  { name: "Plushes", count: 22, value: "$486.00" },
  { name: "Trading", count: 18, value: "$214.50" },
  { name: "Action/Dolls", count: 12, value: "$904.00" },
  { name: "Garage Kits", count: 8, value: "$512.00" },
  { name: "Misc", count: 7, value: "$96.00" },
] as const;
const TOTAL = CATEGORIES.reduce((sum, c) => sum + c.count, 0);

function Categories() {
  return (
    <div className="mk-feature-bento-breakdown">
      <div className="mk-feature-bento-breakdown__title">
        {TOTAL} items across {CATEGORIES.length} categories
      </div>
      <div className="mk-feature-bento-breakdown__bar">
        {CATEGORIES.map((c) => (
          <span
            key={c.name}
            style={{ width: `${(c.count / TOTAL) * 100}%`, background: CATEGORY_COLOR[c.name] }}
          />
        ))}
      </div>
      <div className="mk-feature-bento-breakdown__legend">
        {CATEGORIES.map((c) => (
          <div key={c.name} className="mk-feature-bento-legend">
            <span
              className="mk-feature-bento-legend__marker"
              style={{ background: CATEGORY_COLOR[c.name] }}
            />
            <span className="mk-feature-bento-legend__name">{c.name}</span>
            <span className="mk-feature-bento-legend__count">{c.count}</span>
            <span className="mk-feature-bento-legend__value">{c.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Spend (stat) ---------------- */

// The dashboard's KPIs, in the app's lowercase Orbitron eyebrow. Unpaid Costs
// are shown on their own and are not part of Total Spent.
function Spend() {
  return (
    <div className="mk-feature-bento-spend">
      <div className="mk-feature-bento-kpi">
        <span className="mk-feature-bento-kpi__label">Total Spent</span>
        <span className="mk-feature-bento-kpi__value" data-big>
          $8,412.60
        </span>
      </div>
      <div className="mk-feature-bento-kpi">
        <span className="mk-feature-bento-kpi__label">Unpaid Costs</span>
        <span className="mk-feature-bento-kpi__value">$296.40</span>
      </div>
    </div>
  );
}

/* ---------------- Shipping ---------------- */

// Average shipping cost per method, each bar in its method's chart color
// (EXPENSE_CHART_COLORS by its place in SHIPPING_METHODS), with the app's
// gradient fill: solid at the top of the plot, fading toward the axis.
const METHODS = [
  { name: "EMS", cents: 3860, color: "var(--chart-2)" },
  { name: "SAL", cents: 2410, color: "var(--chart-3)" },
  { name: "FEDEX", cents: 4620, color: "var(--chart-6)" },
  { name: "SURFACE", cents: 1680, color: "var(--chart-5)" },
] as const;
const MAX_CENTS = 5000;
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

type Bars = { readonly grown: boolean };
const GROWN: Bars = { grown: true };

// On hover the bars drop and draw in again, as the chart does when it loads
async function grow(a: Act<Bars>) {
  await a.set({ grown: false });
  await a.wait(340);
  await a.set({ grown: true });
  await a.wait(1600);
}

function Shipping({ grown, height }: { readonly grown: boolean; readonly height: number }) {
  const plot = height - 48;
  return (
    <div
      className="mk-feature-bento-chart"
      data-grown={grown || undefined}
      style={{ "--plot": `${plot}px` } as CSSProperties}
    >
      <span className="mk-feature-bento-chart__axis" />
      {METHODS.map((m, i) => (
        <div key={m.name} className="mk-feature-bento-chart__col">
          <span
            className="mk-feature-bento-chart__value"
            style={{ bottom: 28 + (plot * m.cents) / MAX_CENTS, "--i": i } as CSSProperties}
          >
            {usd.format(m.cents / 100)}
          </span>
          <span
            className="mk-feature-bento-chart__bar"
            style={
              {
                height: (plot * m.cents) / MAX_CENTS,
                "--color": m.color,
                "--i": i,
              } as CSSProperties
            }
          />
          <Text className="mk-feature-bento-chart__label">{m.name}</Text>
        </div>
      ))}
    </div>
  );
}

export function FeatureBentoDemo({ theme }: DemoProps) {
  return (
    <div className="mk-feature-bento" data-theme={theme}>
      <div className="mk-feature-bento-grid">
        <Tile area="hero" title="Your collection" line="Everything you own, in one gallery.">
          <Picture<object> theme={theme} name="hero">
            {(_s, size) => <Gallery width={size.width} height={size.height} />}
          </Picture>
        </Tile>
        <Tile area="releases" title="Releasing this month" line="Each release on the day it lands.">
          <Picture<object> theme={theme} name="releases">
            {() => <Releases />}
          </Picture>
        </Tile>
        <Tile area="categories" title="By category" line="Counts and value, category by category.">
          <Picture<object> theme={theme} name="categories">
            {() => <Categories />}
          </Picture>
        </Tile>
        <Tile area="spend" title="Spent and still owed" line="Unpaid Costs never count as spend.">
          <Spend />
        </Tile>
        <Tile area="shipping" title="Shipping by method" line="What each method costs on average.">
          <Picture<Bars>
            theme={theme}
            name="shipping"
            initial={GROWN}
            poster={GROWN}
            script={grow}
            play="hover"
          >
            {(s, size) => <Shipping grown={s.grown} height={size.height} />}
          </Picture>
        </Tile>
      </div>
    </div>
  );
}
