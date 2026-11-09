import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon } from "@hugeicons/core-free-icons";
import { Bar, Count, Popover, Stage, Window } from "@/components/stageshow/kit";
import type { Act, Layout, Rect } from "@/components/stageshow/kit";
import { ExpandIcon } from "@/lib/icons";
import type { DemoProps } from "../demo-props";
import "./customs-fees.css";

// A customs bill arrives for an order that has shipped. In the orders table
// the pointer opens the order's Total, the Fees & Charges popover the app
// draws there (PopoverMultiInputCell). Duties is double-clicked and 18.40
// typed over it, then Tariffs and 32.00, then Save. The popover closes and the
// Total rolls at once, as the cell's pending total does. A beat later the
// Expenses page's "Spend by cost type" card, shown as a satellite, rolls its
// Duties and Tariffs lines and its bar's segments widen. Plays once.
//
// The math holds. The order's Total is its two items plus its fees. The
// order is Shipped, a Paid Order, so its fees count as Spend; the card is the
// whole Orders scope, and its five lines add up to the Order Spend it splits.
// Misc has no line because the app leaves out a cost type with nothing spent.
// The popover has no total of its own: the app updates the Total cell only
// once the fees are saved.

type Field = "duties" | "tariffs";

type S = {
  readonly open: boolean;
  readonly focus: Field | null;
  readonly sel: Field | null;
  readonly duties: string;
  readonly tariffs: string;
  readonly saved: boolean;
  readonly wash: boolean;
  /** The Expenses card has the saved fees */
  readonly synced: boolean;
  /** The card is on screen. In the wide design it always is */
  readonly card: boolean;
};

const ADDED = { duties: 1840, tariffs: 3200 } as const;

// The order, in cents: two items, Shipping and Taxes already saved
const ORDER = {
  title: "Autumn preorders",
  items: 2,
  images: ["/example-item6.webp", "/example-item4.webp"],
  itemSpend: 37_080,
  shipping: 3850,
  taxes: 2966,
};
const ORDER_TOTAL = ORDER.itemSpend + ORDER.shipping + ORDER.taxes;

// What each fee field holds when the popover opens, and what the save adds
const PRESET = new Map<string, number>([
  ["shipping", ORDER.shipping],
  ["taxes", ORDER.taxes],
]);
const ADDED_BY_KEY = new Map<string, number>(Object.entries(ADDED));

// Spend by cost type for every Paid Order, this one included, in cents
const BEFORE = [
  { key: "orderItems", label: "Order Items", cents: 54_820, color: "var(--chart-1)" },
  { key: "shipping", label: "Shipping", cents: 9640, color: "var(--chart-2)" },
  { key: "taxes", label: "Taxes", cents: 6842, color: "var(--chart-3)" },
  { key: "duties", label: "Duties", cents: 3260, color: "var(--chart-4)" },
  { key: "tariffs", label: "Tariffs", cents: 2750, color: "var(--chart-5)" },
] as const;

type Status = "Ordered" | "Paid" | "Shipped" | "Owned";

const ROWS: readonly {
  readonly title: string;
  readonly items: number;
  readonly total: number;
  readonly status: Status;
  readonly images: readonly string[];
}[] = [
  {
    title: "Winter scale figures",
    items: 2,
    total: 31_800,
    status: "Ordered",
    images: ["/example-item5.webp", "/example-item7.webp"],
  },
  {
    title: "Art book bundle",
    items: 2,
    total: 7240,
    status: "Owned",
    images: ["/example-item1.webp", "/example-item3.webp"],
  },
  {
    title: "Summer plush haul",
    items: 3,
    total: 9620,
    status: "Paid",
    images: ["/example-item3.webp", "/example-item2.webp", "/example-item5.webp"],
  },
];

const BELOW: readonly (typeof ROWS)[number][] = [
  {
    title: "Desk figure set",
    items: 1,
    total: 6400,
    status: "Ordered",
    images: ["/example-item2.webp"],
  },
];

const FEES: readonly { readonly name: string; readonly label: string }[] = [
  { name: "shipping", label: "Shipping" },
  { name: "taxes", label: "Taxes" },
  { name: "duties", label: "Duties" },
  { name: "tariffs", label: "Tariffs" },
  { name: "misc", label: "Miscellaneous" },
];

const initial: S = {
  open: false,
  focus: null,
  sel: null,
  duties: "0.00",
  tariffs: "0.00",
  saved: false,
  wash: false,
  synced: false,
  card: false,
};

// The result: the Total marked, the card's lines up
const poster: S = {
  ...initial,
  duties: "18.40",
  tariffs: "32.00",
  saved: true,
  wash: true,
  synced: true,
  card: true,
};

const cls = (name: string) => `mk-customs-fees-${name}`;

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Percentages in tenths, as the card writes them (toFixed(1))
const tenths = (n: number) => `${(n / 10).toFixed(1)}%`;

const POPOVER_WIDTH = 288;
const GUTTER = 24;

/** Above the Total, its left edge on the trigger's, shifted in to stay on screen as the app's popover does. */
function placement(trigger: Rect, layout: Layout) {
  const stageWidth = layout === "compact" ? 358 : 960;
  const stageHeight = layout === "compact" ? 400 : 440;
  // The wide window ends a gutter from the stage's right edge; the popover
  // keeps 12px inside it. The phone column centers it.
  const left =
    layout === "compact"
      ? (stageWidth - POPOVER_WIDTH) / 2
      : Math.min(trigger.x, stageWidth - GUTTER - 12 - POPOVER_WIDTH);
  return { left, bottom: stageHeight - trigger.y + 4, width: POPOVER_WIDTH };
}

/** Double-click the amount to select it, then type the new one over it. */
async function enter(a: Act<S>, field: Field, typed: string) {
  // Past the end of the amount, so the hand never covers it: a double-click
  // there selects the last word, the whole figure
  await a.moveCursor({ at: `fee-${field}`, x: 0.66, y: 0.58 }, { duration: 560 });
  await a.wait(160);
  await a.click(undefined, { double: true });
  a.put({ focus: field, sel: field });
  await a.wait(420);
  a.put({ sel: null });
  await a.type(field, typed, { interval: 115 });
  await a.wait(380);
}

async function script(a: Act<S>) {
  await a.wait(900);
  a.mark("open");
  await a.moveCursor({ at: "total", x: 0.32, y: 0.55 });
  await a.wait(180);
  await a.click();
  a.put({ open: true });
  await a.wait(700);

  a.mark("duties");
  await enter(a, "duties", "18.40");
  a.mark("tariffs");
  await enter(a, "tariffs", "32.00");

  a.mark("save");
  await a.moveCursor({ at: "save", x: 0.9, y: 0.72 }, { duration: 460 });
  await a.wait(160);
  await a.click();
  // The popover closes first; the Total takes the saved fees at once
  a.put({ open: false, focus: null, saved: true, wash: true });
  const away = a.moveCursor("rest", { duration: 760 });
  await a.wait(1000);
  a.put({ wash: false });

  // The Expenses data refreshes after the write
  if (a.layout === "compact") {
    a.put({ card: true });
    await a.wait(1000);
  } else {
    await a.wait(200);
  }
  a.mark("sync");
  a.put({ synced: true });
  await away;
  await a.wait(2800);
}

function Thumbs({ images }: { readonly images: readonly string[] }) {
  return (
    <span className={cls("thumbs")} data-count={images.length}>
      {images.slice(0, 4).map((src) => (
        <img key={src} src={src} alt="" draggable={false} />
      ))}
    </span>
  );
}

function StatusValue({ status }: { readonly status: Status }) {
  return (
    <span className={cls("status")}>
      <span className={cls("dot")} data-status={status} />
      {status}
    </span>
  );
}

function Expand() {
  return (
    <span className={cls("expand")}>
      <HugeiconsIcon icon={ExpandIcon} size={16} strokeWidth={1.5} />
    </span>
  );
}

function OrderRow({
  row,
  quiet,
  width,
}: {
  readonly row: (typeof ROWS)[number];
  readonly quiet: boolean;
  readonly width: number;
}) {
  return (
    <div className={`${cls("row")} ${cls("other")}`}>
      <Expand />
      <span className={cls("cell")}>
        <span className={cls("order")}>
          <Thumbs images={row.images} />
          {quiet ? (
            <Bar w={width} h={7} tone={2} />
          ) : (
            <span className={cls("order-title")}>{row.title}</span>
          )}
        </span>
      </span>
      <span className={`${cls("cell")} ${cls("num")} ${cls("col-items")}`}>
        {quiet ? <Bar w={8} h={7} tone={2} /> : row.items}
      </span>
      <span className={`${cls("cell")} ${cls("num")}`}>
        {quiet ? <Bar w={width * 0.55} h={7} tone={2} /> : money(row.total)}
      </span>
      <span className={`${cls("cell")} ${cls("col-status")}`}>
        {quiet ? (
          <span className={cls("status")}>
            <span className={cls("dot")} data-status={row.status} />
            <Bar w={width * 0.5} h={7} tone={2} />
          </span>
        ) : (
          <StatusValue status={row.status} />
        )}
      </span>
    </div>
  );
}

function FeeInput({
  s,
  name,
  label,
}: {
  readonly s: S;
  readonly name: string;
  readonly label: string;
}) {
  const field: Field | null = name === "duties" || name === "tariffs" ? name : null;
  const preset = PRESET.get(name) ?? 0;
  const focused = field !== null && s.focus === field;
  const selected = field !== null && s.sel === field;
  const value = field === null ? (preset / 100).toFixed(2) : s[field];
  return (
    <div className={cls("fee")}>
      <span className={cls("fee-label")}>{label}</span>
      <span
        className={cls("input")}
        data-target={field ? `fee-${field}` : undefined}
        data-cursor="ibeam"
        data-focus={focused || undefined}
      >
        <span className={cls("input-text")} data-typing={field ? "" : undefined}>
          {value === "" ? null : (
            <>
              $
              <span className={cls("sel")} data-on={selected || undefined}>
                {value}
              </span>
            </>
          )}
        </span>
        {focused ? (
          <span className={cls("caret")} data-hide={selected || undefined} key={value} />
        ) : null}
      </span>
    </div>
  );
}

function FeesPopover({
  s,
  trigger,
  layout,
}: {
  readonly s: S;
  readonly trigger: Rect;
  readonly layout: Layout;
}) {
  const place = placement(trigger, layout);
  return (
    <Popover
      show={s.open}
      origin="bottom left"
      className={cls("popover")}
      style={{ left: place.left, bottom: place.bottom, width: place.width }}
    >
      <div className={cls("pop-head")}>
        <span className={cls("pop-title")}>Fees & Charges</span>
        <span className={cls("pop-desc")}>Expand order to edit item prices</span>
      </div>
      <div className={cls("fees")}>
        {FEES.map((fee) => (
          <FeeInput key={fee.name} s={s} name={fee.name} label={fee.label} />
        ))}
      </div>
      <div className={cls("pop-foot")}>
        <span className={cls("btn")}>Cancel</span>
        <span className={`${cls("btn")} ${cls("btn-primary")}`} data-target="save">
          Save
        </span>
      </div>
    </Popover>
  );
}

/** The Expenses page's Spend by cost type, as Breakdown draws it. */
function SpendCard({ s }: { readonly s: S }) {
  const lines = BEFORE.map((line) => {
    const added = s.synced ? (ADDED_BY_KEY.get(line.key) ?? 0) : 0;
    return { ...line, cents: line.cents + added };
  });
  const spend = lines.reduce((sum, line) => sum + line.cents, 0);
  return (
    <div className={cls("card")} data-show={s.card || undefined}>
      <div className={cls("card-title")}>Spend by cost type</div>
      <div className={cls("stack")}>
        {lines.map((line) => (
          <span
            key={line.key}
            className={cls("segment")}
            style={{
              width: `${Math.max(3, (line.cents / spend) * 100)}%`,
              background: line.color,
            }}
          />
        ))}
      </div>
      <div className={cls("legend")}>
        {lines.map((line) => (
          <div key={line.key} className={cls("line")}>
            <span className={cls("marker")} style={{ background: line.color }} />
            <span className={cls("line-label")}>{line.label}</span>
            <Count
              className={cls("line-pct")}
              value={Math.round((line.cents * 1000) / spend)}
              format={tenths}
              duration={800}
            />
            <Count className={cls("line-value")} value={line.cents} format={money} duration={900} />
          </div>
        ))}
      </div>
    </div>
  );
}

const QUIET_WIDTHS = [96, 72, 84] as const;

export function CustomsFeesDemo({ theme }: DemoProps) {
  return (
    <Stage<S>
      width={960}
      height={440}
      compact={{ below: 560, width: 358, height: 400 }}
      initial={initial}
      poster={poster}
      script={script}
      play="once"
      theme={theme}
      cursor={{ at: { wide: "rest", compact: "rest" } }}
      className="look-myakiba mk-customs-fees"
    >
      {(s, rect, layout) => {
        const compact = layout === "compact";
        const total = ORDER_TOTAL + (s.saved ? ADDED.duties + ADDED.tariffs : 0);
        return (
          <>
            <Window className={cls("window")}>
              <div className={cls("body")}>
                {compact ? null : (
                  <aside className={cls("sidebar")}>
                    <Bar w={84} h={12} r={3} tone={4} />
                    {[[52, 64, 70, 58], [46, 74, 54, 66, 60], [52]].map((group, g) => (
                      <div key={group.join("-")} className={cls("nav")}>
                        <Bar w={40} h={5} tone={2} />
                        {group.map((w, i) => (
                          <Bar key={`${w}-${i}`} w={w} h={7} tone={g === 1 && i === 1 ? 4 : 2} />
                        ))}
                      </div>
                    ))}
                  </aside>
                )}
                <div className={cls("page")}>
                  {compact ? null : <div className={cls("title")}>Orders</div>}
                  <div className={cls("toolbar")}>
                    <span className={cls("search")}>
                      <HugeiconsIcon icon={Search01Icon} size={16} strokeWidth={1.5} />
                      <Bar w={88} h={6} tone={2} />
                    </span>
                    <span className={cls("filter")}>
                      <Bar w={44} h={6} tone={2} />
                    </span>
                    <span className={`${cls("filter")} ${cls("filter-2")}`}>
                      <Bar w={36} h={6} tone={2} />
                    </span>
                  </div>
                  <div className={`${cls("row")} ${cls("head")}`}>
                    <span />
                    <span className={cls("cell")}>Order</span>
                    <span className={`${cls("cell")} ${cls("num")} ${cls("col-items")}`}>
                      Items
                    </span>
                    <span className={`${cls("cell")} ${cls("num")}`}>Total</span>
                    <span className={`${cls("cell")} ${cls("col-status")}`}>Status</span>
                  </div>
                  {ROWS.map((row, i) => (
                    <OrderRow
                      key={row.title}
                      row={row}
                      quiet={compact}
                      width={QUIET_WIDTHS[i] ?? 80}
                    />
                  ))}
                  <div className={`${cls("row")} ${cls("subject")}`}>
                    <Expand />
                    <span className={cls("cell")}>
                      <span className={cls("order")}>
                        <Thumbs images={ORDER.images} />
                        <span className={cls("order-title")}>{ORDER.title}</span>
                      </span>
                    </span>
                    <span className={`${cls("cell")} ${cls("num")} ${cls("col-items")}`}>
                      {ORDER.items}
                    </span>
                    <span className={`${cls("cell")} ${cls("num")}`}>
                      <span
                        className={cls("trigger")}
                        data-target="total"
                        data-open={s.open || undefined}
                        data-wash={s.wash || undefined}
                      >
                        <Count value={total} format={money} duration={800} />
                      </span>
                    </span>
                    <span className={`${cls("cell")} ${cls("col-status")}`}>
                      <StatusValue status="Shipped" />
                    </span>
                  </div>
                  {compact
                    ? null
                    : BELOW.map((row) => <OrderRow key={row.title} row={row} quiet width={92} />)}
                </div>
              </div>
            </Window>

            <SpendCard s={{ ...s, card: compact ? s.card : true }} />

            <FeesPopover s={s} trigger={rect("total")} layout={layout} />

            <span className={cls("rest")} data-target="rest" aria-hidden />
          </>
        );
      }}
    </Stage>
  );
}
