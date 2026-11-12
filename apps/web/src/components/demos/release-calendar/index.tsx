import type { ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Bar, Collapse, Row, Stage, Window } from "@/components/stageshow/kit";
import type { Act, Layout } from "@/components/stageshow/kit";
import { DisclosureIcon, NextIcon, PreviousIcon } from "@/lib/icons";
import type { DemoProps } from "../demo-props";
import "./release-calendar.css";

// The Calendar page in November 2026: the pointer selects one release day in
// the month grid and the list beside it narrows to that day, the other dates'
// groups closing around it while it slides up. A second day joins it and its
// group opens back in date order. The same two days clicked off again are the
// reset, and the whole month's list returns.
//
// Real strings: the page title, the month and year, the weekday labels, the
// two selected days' labels, their release titles and prices. The other
// days' rows are filler under their real thumbnails.

type State = { readonly days: readonly number[] };

const initial: State = { days: [] };
const poster: State = { days: [11, 20] };

interface Release {
  readonly day: number;
  readonly image: string;
  /** Only the selected days carry words; the rest are filler bars. */
  readonly title?: string;
  readonly category?: "Prepainted" | "Plushes";
  readonly price?: string;
  readonly bars?: readonly [number, number];
  /** Left out of the phone column, where the list has room for one row a day. */
  readonly wideOnly?: boolean;
}

const RELEASES: readonly Release[] = [
  { day: 5, image: "/example-item5.webp", bars: [128, 64] },
  {
    day: 11,
    image: "/example-item2.webp",
    title: "Aoi Shirase 1/7 Scale",
    category: "Prepainted",
    price: "$189.99",
  },
  {
    day: 11,
    image: "/example-item3.webp",
    title: "Kiri Plush",
    category: "Plushes",
    price: "$32.00",
    wideOnly: true,
  },
  { day: 13, image: "/example-item4.webp", bars: [116, 60] },
  { day: 17, image: "/example-item7.webp", bars: [104, 72] },
  { day: 17, image: "/example-item1.webp", bars: [140, 56], wideOnly: true },
  {
    day: 20,
    image: "/example-item6.webp",
    title: "Lumi Kagari 1/6 Scale",
    category: "Prepainted",
    price: "$264.00",
  },
  { day: 24, image: "/example-item3.webp", bars: [120, 58] },
  { day: 26, image: "/example-item1.webp", bars: [96, 68] },
  { day: 26, image: "/example-item5.webp", bars: [132, 52], wideOnly: true },
  { day: 26, image: "/example-item7.webp", bars: [110, 64], wideOnly: true },
  { day: 28, image: "/example-item4.webp", bars: [100, 66] },
];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
// The selected days' group labels, as the app formats them; the rest are filler.
const DAY_LABELS = new Map([
  [11, "Wed, Nov 11"],
  [20, "Fri, Nov 20"],
]);

// November 2026 starts on a Sunday: five whole weeks, the last ending in December.
const CELLS: readonly { readonly day: number; readonly inMonth: boolean }[] = Array.from(
  { length: 35 },
  (_, i) => (i < 30 ? { day: i + 1, inMonth: true } : { day: i - 29, inMonth: false }),
);

const MAX_THUMBS = 3;

const releasesFor = (layout: Layout): readonly Release[] =>
  layout === "compact" ? RELEASES.filter((release) => release.wideOnly !== true) : RELEASES;

const groupsOf = (releases: readonly Release[]): readonly (readonly [number, Release[]])[] => {
  const map = new Map<number, Release[]>();
  for (const release of releases) {
    const list = map.get(release.day);
    if (list) list.push(release);
    else map.set(release.day, [release]);
  }
  return [...map.entries()].toSorted(([a], [b]) => a - b);
};

// Where the pointer waits: an empty day between the two it will press.
const REST = { wide: { x: 404, y: 366 }, compact: { x: 232, y: 142 } } as const;
// Where it reads the result from: the empty Saturday after its second day.
const READ = { wide: { x: 560, y: 364 }, compact: { x: 322, y: 142 } } as const;

// Aim in the cell's empty lower right, clear of its number and thumbnails.
const cellAim = (day: number) => ({ at: `day-${day}`, x: 0.8, y: 0.78 });

async function toggle(a: Act<State>, day: number): Promise<void> {
  await a.moveCursor(cellAim(day));
  await a.wait(160);
  await a.click(cellAim(day));
  a.put((s) => ({
    days: s.days.includes(day)
      ? s.days.filter((d) => d !== day)
      : [...s.days, day].toSorted((x, y) => x - y),
  }));
}

async function script(a: Act<State>): Promise<void> {
  await a.wait(900);
  a.mark("first");
  await toggle(a, 11);
  await a.wait(1700);
  a.mark("second");
  await toggle(a, 20);
  await a.moveCursor(READ[a.layout], { duration: 700 });
  a.mark("hold");
  await a.wait(2300);
  a.mark("reset");
  await toggle(a, 20);
  await a.wait(600);
  await toggle(a, 11);
  await a.wait(500);
  await a.moveCursor(REST[a.layout], { duration: 800 });
  await a.wait(400);
}

function Thumb({ src, className }: { readonly src: string; readonly className: string }) {
  return (
    <span className={className}>
      <img src={src} alt="" draggable={false} />
    </span>
  );
}

function DayCell({
  day,
  inMonth,
  releases,
  selected,
  compact,
}: {
  readonly day: number;
  readonly inMonth: boolean;
  readonly releases: readonly Release[];
  readonly selected: boolean;
  readonly compact: boolean;
}): ReactNode {
  const count = releases.length;
  return (
    <div
      className="mk-release-calendar-cell"
      data-out={inMonth ? undefined : ""}
      data-selected={selected || undefined}
      data-target={inMonth && DAY_LABELS.has(day) ? `day-${day}` : undefined}
    >
      <span className="mk-release-calendar-cell-head">
        <span className="mk-release-calendar-day">{day}</span>
        {count > 0 ? <span className="mk-release-calendar-count">{count}</span> : null}
      </span>
      {compact || count === 0 ? null : (
        <span className="mk-release-calendar-stack">
          {releases.slice(0, MAX_THUMBS).map((release) => (
            <Thumb
              key={release.image}
              src={release.image}
              className="mk-release-calendar-stack-thumb"
            />
          ))}
        </span>
      )}
    </div>
  );
}

function MonthGrid({ state, layout }: { readonly state: State; readonly layout: Layout }) {
  const releases = releasesFor(layout);
  return (
    <div className="mk-release-calendar-grid">
      <div className="mk-release-calendar-weekdays">
        {WEEKDAYS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="mk-release-calendar-cells">
        {CELLS.map(({ day, inMonth }) => (
          <DayCell
            key={`${inMonth ? "nov" : "dec"}-${day}`}
            day={day}
            inMonth={inMonth}
            releases={inMonth ? releases.filter((release) => release.day === day) : []}
            selected={inMonth && state.days.includes(day)}
            compact={layout === "compact"}
          />
        ))}
      </div>
    </div>
  );
}

function ReleaseRow({
  release,
  compact,
}: {
  readonly release: Release;
  readonly compact: boolean;
}): ReactNode {
  const real = release.title !== undefined;
  return (
    <Row
      pad={compact ? 4 : 6}
      className="mk-release-calendar-row"
      lead={<Thumb src={release.image} className="mk-release-calendar-thumb" />}
      title={
        real ? (
          <span className="mk-release-calendar-title">{release.title}</span>
        ) : (
          <Bar w={release.bars?.[0] ?? 120} h={8} r={4} tone={2} />
        )
      }
      meta={compact ? <ReleasePrice release={release} /> : undefined}
      subtitle={compact ? undefined : <ReleaseDetail release={release} />}
    />
  );
}

// The wide row's second line: the category in its color, then the price.
function ReleaseDetail({ release }: { readonly release: Release }): ReactNode {
  if (release.category === undefined) {
    return (
      <span className="mk-release-calendar-detail">
        <Bar w={release.bars?.[1] ?? 60} h={6} r={3} tone={2} />
        <Bar w={40} h={6} r={3} tone={2} />
      </span>
    );
  }
  return (
    <span className="mk-release-calendar-detail">
      <span className="mk-release-calendar-category" data-category={release.category}>
        {release.category}
      </span>
      <span className="mk-release-calendar-price">{release.price}</span>
    </span>
  );
}

// The phone column's one-line row keeps the price on the title's line.
function ReleasePrice({ release }: { readonly release: Release }): ReactNode {
  return release.price === undefined ? (
    <Bar w={40} h={6} r={3} tone={2} />
  ) : (
    <span className="mk-release-calendar-price">{release.price}</span>
  );
}

function ReleaseList({ state, layout }: { readonly state: State; readonly layout: Layout }) {
  const filtering = state.days.length > 0;
  return (
    <div className="mk-release-calendar-list" data-filtering={filtering || undefined}>
      {groupsOf(releasesFor(layout)).map(([day, releases]) => {
        const selected = filtering && state.days.includes(day);
        return (
          <Collapse key={day} open={!filtering || selected}>
            <div className="mk-release-calendar-group">
              <span className="mk-release-calendar-label" data-selected={selected || undefined}>
                <span className="mk-release-calendar-label-dot" aria-hidden />
                {DAY_LABELS.get(day) ?? <Bar w={day % 2 === 0 ? 62 : 70} h={6} r={3} tone={2} />}
              </span>
              <div className="mk-release-calendar-rows">
                {releases.map((release) => (
                  <ReleaseRow
                    key={release.image}
                    release={release}
                    compact={layout === "compact"}
                  />
                ))}
              </div>
            </div>
          </Collapse>
        );
      })}
    </div>
  );
}

function MonthNav({ compact }: { readonly compact: boolean }): ReactNode {
  return (
    <span className="mk-release-calendar-nav" data-compact={compact || undefined}>
      <span className="mk-release-calendar-iconbtn">
        <HugeiconsIcon icon={PreviousIcon} size={16} strokeWidth={2} />
      </span>
      <span className="mk-release-calendar-select">
        November
        <HugeiconsIcon icon={DisclosureIcon} size={16} />
      </span>
      <span className="mk-release-calendar-select">
        2026
        <HugeiconsIcon icon={DisclosureIcon} size={16} />
      </span>
      <span className="mk-release-calendar-iconbtn">
        <HugeiconsIcon icon={NextIcon} size={16} strokeWidth={2} />
      </span>
    </span>
  );
}

function Header(): ReactNode {
  return (
    <div className="mk-release-calendar-header">
      <span className="mk-release-calendar-page-title">Calendar</span>
      <MonthNav compact={false} />
      <span className="mk-release-calendar-tabs" aria-hidden>
        <span data-active="">Items</span>
        <span>Orders</span>
      </span>
    </div>
  );
}

export function ReleaseCalendarDemo({ theme }: DemoProps): ReactNode {
  return (
    <Stage<State>
      width={960}
      height={440}
      compact={{ below: 560, width: 358, height: 400 }}
      initial={initial}
      poster={poster}
      script={script}
      play="loop"
      theme={theme}
      cursor={{ at: REST }}
      className="look-myakiba mk-release-calendar"
    >
      {(state, _rect, layout) => {
        const compact = layout === "compact";
        return (
          <div className="mk-release-calendar-mask">
            <Window
              className="mk-release-calendar-window"
              lead={compact ? <MonthNav compact /> : undefined}
              body={{ "data-crop": true }}
            >
              <div className="mk-release-calendar-content">
                {compact ? null : <Header />}
                <div className="mk-release-calendar-main">
                  <MonthGrid state={state} layout={layout} />
                  <ReleaseList state={state} layout={layout} />
                </div>
              </div>
            </Window>
          </div>
        );
      }}
    </Stage>
  );
}
