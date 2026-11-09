import type { ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Calendar01Icon,
  Cancel01Icon,
  Edit03Icon,
  MoreHorizontalIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { Bar, Count, Menu, Popover, Roll, Stage, Window } from "@/components/stageshow/kit";
import type { Act, Layout, Point, Rect } from "@/components/stageshow/kit";
import { DisclosureIcon, ExpandIcon, NextIcon, PreviousIcon } from "@/lib/icons";
import type { DemoProps } from "../demo-props";
import "./order-lifecycle.css";

// One preorder's whole life on its own page. The collector opens Edit, sets
// Status to Paid and picks the Payment Date from the calendar, and presses
// Update: the Progress stepper fills to Paid with its date, the item follows
// (Edit cascades every field to the items by default), and a beat later the
// dashboard's totals roll in the satellite. Then the same sheet, sped up,
// takes it to Shipped and to Owned, months apart. Plays once, as it scrolls
// into view, and holds on Owned.
//
// The totals follow apps/server/src/routers/dashboard/module.ts and
// overview-tab.tsx. The order is one $189.00 item with $14.50 shipping:
// - Paid: Unpaid Costs (Ordered orders, items plus fees) falls by $203.50,
//   and Total Spent (non-Ordered item prices, plus non-Ordered orders' fees)
//   rises by the same $203.50. One fewer order is unpaid.
// - Shipped: no total changes.
// - Owned: Total Items (Owned collection items) rises by 1, and Active Orders
//   (orders not Owned) falls by 1.

type S = {
  /** The order's saved status, as a step: 1 Ordered, 2 Paid, 3 Shipped, 4 Owned */
  readonly step: number;
  /** The step the dashboard has caught up with */
  readonly counted: number;
  readonly sheet: boolean;
  /** The Status field in the sheet */
  readonly formStep: number;
  /** How many of the four dates the sheet holds */
  readonly formDates: number;
  readonly menu: boolean;
  readonly calendar: boolean;
  /** The day picked in the calendar, once it is pressed */
  readonly picked: boolean;
};

type Status = "Ordered" | "Paid" | "Shipped" | "Owned";

type Step = {
  readonly status: Status;
  /** As the stepper writes it (the user's MM/DD/YYYY) */
  readonly date: string;
  /** As the date field writes it */
  readonly long: string;
  readonly field: string;
};

const STEPS: readonly Step[] = [
  { status: "Ordered", date: "03/02/2026", long: "Mar 2, 2026", field: "Order Date" },
  { status: "Paid", date: "07/14/2026", long: "Jul 14, 2026", field: "Payment Date" },
  { status: "Shipped", date: "08/30/2026", long: "Aug 30, 2026", field: "Shipping Date" },
  { status: "Owned", date: "09/06/2026", long: "Sep 6, 2026", field: "Collection Date" },
];
const STATUSES: readonly Status[] = ["Ordered", "Paid", "Shipped", "Owned"];

const statusOf = (step: number): Status => STATUSES.at(step - 1) ?? "Ordered";

const ORDER = { title: "Hoshino Aria 1/7 Scale", shop: "Kumo Hobby", image: "/example-item6.webp" };
const ITEM_CENTS = 18_900;
const SHIPPING_CENTS = 1450;
const ORDER_CENTS = ITEM_CENTS + SHIPPING_CENTS;

// The dashboard before this order moves. Unpaid Costs counts this order's
// $203.50 among three unpaid orders.
const BEFORE = { items: 96, spent: 621_480, active: 9, unpaid: 3, unpaidCosts: 51_240 };

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const cents = (n: number) => usd.format(n / 100);

const initial: S = {
  step: 1,
  counted: 1,
  sheet: false,
  formStep: 1,
  formDates: 1,
  menu: false,
  calendar: false,
  picked: false,
};
const poster: S = { ...initial, step: 4, counted: 4, formStep: 4, formDates: 4 };

// Where the cursor waits: empty page between the stepper and the costs
const REST = { wide: { x: 560, y: 352 }, compact: { x: 236, y: 246 } } satisfies Record<
  Layout,
  Point
>;

/** The sheet's fields, row by row: the date fields of the steps after Ordered */
const DATE_FIELD = ["", "f-paid", "f-shipped", "f-owned"];

async function press(a: Act<S>, target: string, at: Point, ms: number) {
  await a.moveCursor({ at: target, ...at }, { duration: ms });
  await a.wait(90);
  await a.click();
}

/** The first update, at a person's pace: status from its list, date from the calendar. */
async function markPaid(a: Act<S>) {
  a.mark("edit");
  await a.click({ at: "edit", x: 0.78, y: 0.6 });
  await a.set({ sheet: true });
  await a.wait(380);

  a.mark("status");
  await a.click({ at: "f-status", x: 0.84, y: 0.6 });
  await a.set({ menu: true });
  await a.wait(340);
  await a.moveCursor({ at: "opt-Paid", x: 0.8, y: 0.6 }, { duration: 340 });
  await a.wait(100);
  await a.click();
  await a.set({ menu: false, formStep: 2 });
  await a.wait(220);

  a.mark("date");
  await a.click({ at: "f-paid", x: 0.86, y: 0.6 });
  if (a.layout === "wide") {
    await a.set({ calendar: true });
    await a.wait(400);
    await a.moveCursor({ at: "day-14", x: 0.86, y: 0.88 }, { duration: 420 });
    await a.wait(100);
    await a.click();
    await a.set({ picked: true, formDates: 2 });
    await a.wait(160);
    await a.set({ calendar: false });
  } else {
    // A phone column has no room for the calendar: the picked day lands in the field
    await a.set({ formDates: 2 });
  }
  await a.wait(240);

  a.mark("update");
  await a.click({ at: "update", x: 0.78, y: 0.6 });
  await a.set({ sheet: false, step: 2 });
}

/** The same sheet, sped up: months pass between one update and the next. */
async function lapse(a: Act<S>, step: number) {
  await press(a, "edit", { x: 0.78, y: 0.6 }, 440);
  await a.set({ sheet: true });
  await a.wait(260);
  await press(a, "f-status", { x: 0.84, y: 0.6 }, 260);
  a.put({ formStep: step });
  await a.wait(90);
  await press(a, DATE_FIELD.at(step - 1) ?? "f-owned", { x: 0.86, y: 0.6 }, 260);
  a.put({ formDates: step });
  await a.wait(90);
  await press(a, "update", { x: 0.78, y: 0.6 }, 300);
  await a.set({ sheet: false, step });
}

async function script(a: Act<S>) {
  await a.wait(400);
  await markPaid(a);
  // The stepper fills while the hand leaves the page; the totals a beat later
  const leave = a.moveCursor("rest", { duration: 700 });
  await a.wait(900);
  await leave;
  a.mark("paid");
  await a.set({ counted: 2 });
  await a.wait(1000);

  a.mark("shipped");
  await lapse(a, 3);
  await a.wait(350);

  a.mark("owned");
  await lapse(a, 4);
  const back = a.moveCursor("rest", { duration: 600 });
  await a.wait(800);
  await back;
  a.mark("counted");
  await a.set({ counted: 4 });
  await a.wait(2400);
}

/* ---------- the order page ---------- */

function StatusDot({ status }: { readonly status: Status }) {
  return <span className="mk-order-lifecycle-dot" data-status={status} />;
}

function StatusText({
  status,
  className,
}: {
  readonly status: Status;
  readonly className?: string;
}) {
  return (
    <span className={`mk-order-lifecycle-status${className ? ` ${className}` : ""}`}>
      <StatusDot status={status} />
      <Roll className="mk-order-lifecycle-status-label">{status}</Roll>
    </span>
  );
}

function Hero({ s, compact }: { readonly s: S; readonly compact: boolean }) {
  return (
    <div className="mk-order-lifecycle-hero">
      <img className="mk-order-lifecycle-hero-thumb" src={ORDER.image} alt="" draggable={false} />
      <div className="mk-order-lifecycle-hero-text">
        <div className="mk-order-lifecycle-hero-title">
          <span className="mk-order-lifecycle-title">{ORDER.title}</span>
          {compact ? null : <StatusText status={statusOf(s.step)} />}
        </div>
        <div className="mk-order-lifecycle-hero-meta">
          {compact ? <StatusText status={statusOf(s.step)} /> : <span>{ORDER.shop}</span>}
          <Bar w={compact ? 44 : 38} h={6} tone={2} />
          {compact ? null : <Bar w={64} h={6} tone={2} />}
        </div>
      </div>
      <div className="mk-order-lifecycle-actions">
        <span
          className="mk-order-lifecycle-button"
          data-target="edit"
          data-open={s.sheet || undefined}
        >
          <HugeiconsIcon icon={Edit03Icon} size={16} strokeWidth={1.5} />
          Edit
        </span>
        {compact ? null : (
          <span className="mk-order-lifecycle-button mk-order-lifecycle-button--icon">
            <HugeiconsIcon icon={MoreHorizontalIcon} size={16} strokeWidth={1.5} />
          </span>
        )}
      </div>
    </div>
  );
}

/** The Progress stepper, as OrderSummary's Timeline draws it */
function Progress({ step }: { readonly step: number }) {
  return (
    <section className="mk-order-lifecycle-progress">
      <div className="mk-order-lifecycle-heading">Progress</div>
      <div className="mk-order-lifecycle-steps">
        {STEPS.map((st, i) => {
          const n = i + 1;
          return (
            <div
              key={st.status}
              className="mk-order-lifecycle-step"
              data-done={n <= step || undefined}
              data-active={n === step || undefined}
            >
              <span className="mk-order-lifecycle-indicator" />
              {n < STEPS.length ? (
                <span className="mk-order-lifecycle-sep" data-done={n + 1 <= step || undefined} />
              ) : null}
              <span className="mk-order-lifecycle-step-title">{st.status}</span>
              <span className="mk-order-lifecycle-step-date">
                <Roll>{n <= step ? st.date : "Pending"}</Roll>
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Costs() {
  return (
    <section className="mk-order-lifecycle-costs">
      <div className="mk-order-lifecycle-heading">Cost breakdown</div>
      <div className="mk-order-lifecycle-lines">
        <div className="mk-order-lifecycle-line">
          <span>Items</span>
          <span>{cents(ITEM_CENTS)}</span>
        </div>
        <div className="mk-order-lifecycle-line">
          <span>Shipping</span>
          <span>{cents(SHIPPING_CENTS)}</span>
        </div>
      </div>
      <div className="mk-order-lifecycle-total">
        <span>Total</span>
        <span className="mk-order-lifecycle-total-value">{cents(ORDER_CENTS)}</span>
      </div>
    </section>
  );
}

/** The order's one item: its status follows the order's, cascaded by the edit */
function Items({ s }: { readonly s: S }) {
  return (
    <section className="mk-order-lifecycle-items">
      <div className="mk-order-lifecycle-heading">Items (1)</div>
      <div className="mk-order-lifecycle-item">
        <img className="mk-order-lifecycle-item-thumb" src={ORDER.image} alt="" draggable={false} />
        <span className="mk-order-lifecycle-item-text">
          <Bar w={96} h={7} tone={3} />
          <span className="mk-order-lifecycle-item-meta">
            <Bar w={44} h={6} tone={2} />
            <span className="mk-order-lifecycle-category">Prepainted</span>
          </span>
        </span>
        <span className="mk-order-lifecycle-item-status">
          <StatusText status={statusOf(s.step)} className="mk-order-lifecycle-status--item" />
        </span>
      </div>
    </section>
  );
}

function Sidebar() {
  return (
    <aside className="mk-order-lifecycle-sidebar">
      <Bar w={84} h={12} r={3} tone={4} />
      {[[52, 64, 70, 58], [46, 74, 54, 66, 60], [52]].map((group, g) => (
        <div key={g} className="mk-order-lifecycle-nav">
          <Bar w={40} h={5} tone={2} />
          {group.map((w, i) => (
            <Bar key={i} w={w} h={7} tone={g === 1 && i === 1 ? 4 : 2} />
          ))}
        </div>
      ))}
    </aside>
  );
}

/* ---------- the Edit Order sheet ---------- */

function Field({
  label,
  target,
  children,
  filler,
}: {
  readonly label?: string;
  readonly target?: string;
  readonly children?: ReactNode;
  readonly filler?: readonly [number, number];
}) {
  return (
    <div className="mk-order-lifecycle-field">
      {label ? (
        <span className="mk-order-lifecycle-label">{label}</span>
      ) : (
        <span className="mk-order-lifecycle-label">
          <Bar w={filler?.[0] ?? 48} h={6} tone={3} />
        </span>
      )}
      <span className="mk-order-lifecycle-input" data-target={target}>
        {children ?? <Bar w={filler?.[1] ?? 60} h={6} tone={2} />}
      </span>
    </div>
  );
}

function DateValue({ s, step }: { readonly s: S; readonly step: number }) {
  const st = STEPS.at(step - 1);
  const set = s.formDates >= step;
  return (
    <span className="mk-order-lifecycle-date" data-empty={!set || undefined}>
      <HugeiconsIcon icon={Calendar01Icon} size={16} strokeWidth={1.5} />
      <Roll variant="fade">{set && st ? st.long : "Select date"}</Roll>
    </span>
  );
}

function Section({ title }: { readonly title: string }) {
  return (
    <div className="mk-order-lifecycle-section">
      <HugeiconsIcon icon={ExpandIcon} size={14} strokeWidth={2} />
      <span>{title}</span>
    </div>
  );
}

function Sheet({ s, compact }: { readonly s: S; readonly compact: boolean }) {
  const formStatus = statusOf(s.formStep);
  return (
    <div className="mk-order-lifecycle-sheet" data-open={s.sheet || undefined}>
      <div className="mk-order-lifecycle-sheet-head">
        <span className="mk-order-lifecycle-sheet-title">Edit Order</span>
        {compact ? null : <span className="mk-order-lifecycle-sheet-desc">{ORDER.title}</span>}
        <span className="mk-order-lifecycle-close">
          <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={2} />
        </span>
      </div>
      <div className="mk-order-lifecycle-form">
        {compact ? null : <Section title="Basics" />}
        <div className="mk-order-lifecycle-pair">
          <Field label="Status" target="f-status">
            <span className="mk-order-lifecycle-select" data-open={s.menu || undefined}>
              <StatusText status={formStatus} />
              <HugeiconsIcon icon={DisclosureIcon} size={16} strokeWidth={2} />
            </span>
          </Field>
          <Field filler={[30, 64]} />
        </div>
        {compact ? null : <Section title="Timeline" />}
        {compact ? null : (
          <div className="mk-order-lifecycle-pair">
            <Field label="Order Date">
              <DateValue s={s} step={1} />
            </Field>
            <Field filler={[44, 58]} />
          </div>
        )}
        <div className="mk-order-lifecycle-pair">
          <Field label="Payment Date" target="f-paid">
            <DateValue s={s} step={2} />
          </Field>
          <Field label="Shipping Date" target="f-shipped">
            <DateValue s={s} step={3} />
          </Field>
        </div>
        <div className="mk-order-lifecycle-pair">
          <Field label="Collection Date" target="f-owned">
            <DateValue s={s} step={4} />
          </Field>
          <Field filler={[70, 40]} />
        </div>
        {compact ? null : (
          <div className="mk-order-lifecycle-fade">
            <Section title="Fees & Charges" />
          </div>
        )}
      </div>
      <div className="mk-order-lifecycle-sheet-foot">
        <span className="mk-order-lifecycle-button">Cancel</span>
        <span className="mk-order-lifecycle-primary" data-target="update">
          Update
        </span>
      </div>
    </div>
  );
}

/** The status list, its selected row over the trigger, as the app's select aligns it */
function StatusMenu({ s, trigger }: { readonly s: S; readonly trigger: Rect }) {
  const row = 30;
  const selected = s.formStep - 1;
  return (
    <Popover
      show={s.menu}
      origin="center"
      className="mk-order-lifecycle-list"
      style={{
        left: trigger.x - 4,
        top: trigger.y + trigger.height / 2 - 4 - row * selected - row / 2,
        width: trigger.width + 8,
      }}
    >
      <Menu
        className="mk-order-lifecycle-menu"
        targets={STATUSES.map((status) => `opt-${status}`)}
        items={STATUSES.map((status) => (
          <span key={status} className="mk-order-lifecycle-option">
            <StatusDot status={status} />
            <span>{status}</span>
            {status === statusOf(s.formStep) ? (
              <span className="mk-order-lifecycle-tick">
                <HugeiconsIcon icon={Tick02Icon} size={16} strokeWidth={2} />
              </span>
            ) : null}
          </span>
        ))}
      />
    </Popover>
  );
}

// July 2026 starts on a Wednesday: the calendar opens on the current month,
// the day the order was paid
const JULY: readonly (readonly [number, boolean])[][] = (() => {
  const days: [number, boolean][] = [
    [28, false],
    [29, false],
    [30, false],
  ];
  for (let d = 1; d <= 31; d++) days.push([d, true]);
  days.push([1, false]);
  const weeks: [number, boolean][][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
})();

function Calendar({ s, field }: { readonly s: S; readonly field: Rect }) {
  const height = 228;
  return (
    <div
      className="mk-order-lifecycle-calendar"
      data-show={s.calendar || undefined}
      style={{ left: field.x, top: field.y - 4 - height }}
    >
      <div className="mk-order-lifecycle-cal-head">
        <span className="mk-order-lifecycle-cal-nav">
          <HugeiconsIcon icon={PreviousIcon} size={16} strokeWidth={2} />
        </span>
        <span className="mk-order-lifecycle-cal-caption">
          <span>
            Jul
            <HugeiconsIcon icon={DisclosureIcon} size={14} strokeWidth={2} />
          </span>
          <span>
            2026
            <HugeiconsIcon icon={DisclosureIcon} size={14} strokeWidth={2} />
          </span>
        </span>
        <span className="mk-order-lifecycle-cal-nav">
          <HugeiconsIcon icon={NextIcon} size={16} strokeWidth={2} />
        </span>
      </div>
      <div className="mk-order-lifecycle-cal-grid">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <span key={d} className="mk-order-lifecycle-cal-wd">
            {d}
          </span>
        ))}
        {JULY.flat().map(([d, inMonth], i) => {
          const today = inMonth && d === 14;
          return (
            <span
              key={i}
              className="mk-order-lifecycle-cal-day"
              data-out={!inMonth || undefined}
              data-today={today || undefined}
              data-picked={(today && s.picked) || undefined}
              data-target={today ? "day-14" : undefined}
            >
              {d}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- the dashboard satellite ---------- */

function Kpi({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="mk-order-lifecycle-kpi">
      <span className="mk-order-lifecycle-kpi-label">{label}</span>
      <span className="mk-order-lifecycle-kpi-row">{children}</span>
    </div>
  );
}

function Totals({ counted }: { readonly counted: number }) {
  const paid = counted >= 2;
  const owned = counted >= 4;
  return (
    <div className="mk-order-lifecycle-totals">
      <Kpi label="Total Items">
        <Count
          className="mk-order-lifecycle-kpi-value"
          value={BEFORE.items + (owned ? 1 : 0)}
          duration={900}
        />
      </Kpi>
      <Kpi label="Total Spent">
        <Count
          className="mk-order-lifecycle-kpi-value"
          value={BEFORE.spent + (paid ? ORDER_CENTS : 0)}
          format={cents}
          duration={900}
        />
      </Kpi>
      <Kpi label="Active Orders">
        <Count
          className="mk-order-lifecycle-kpi-value"
          value={BEFORE.active - (owned ? 1 : 0)}
          duration={900}
        />
        <span className="mk-order-lifecycle-kpi-sub">
          <Count value={BEFORE.unpaid - (paid ? 1 : 0)} duration={700} /> unpaid
        </span>
      </Kpi>
      <Kpi label="Unpaid Costs">
        <Count
          className="mk-order-lifecycle-kpi-value"
          value={BEFORE.unpaidCosts - (paid ? ORDER_CENTS : 0)}
          format={cents}
          duration={900}
        />
      </Kpi>
    </div>
  );
}

export function OrderLifecycleDemo({ theme }: DemoProps) {
  return (
    <Stage<S>
      width={960}
      height={500}
      compact={{ below: 560, width: 358, height: 440 }}
      initial={initial}
      poster={poster}
      script={script}
      play="once"
      theme={theme}
      cursor={{ at: { wide: "rest", compact: "rest" } }}
      className="look-myakiba mk-order-lifecycle"
    >
      {(s, rect, layout) => {
        const compact = layout === "compact";
        const page = (
          <div className="mk-order-lifecycle-page">
            <Hero s={s} compact={compact} />
            <Progress step={s.step} />
            <div className="mk-order-lifecycle-lower">
              <Items s={s} />
              {compact ? null : <Costs />}
            </div>
          </div>
        );
        return (
          <>
            {compact ? (
              <div className="ss-window mk-order-lifecycle-panel">
                <div className="mk-order-lifecycle-body">
                  {page}
                  <div className="mk-order-lifecycle-scrim" data-open={s.sheet || undefined} />
                  <Sheet s={s} compact />
                </div>
              </div>
            ) : (
              <Window className="mk-order-lifecycle-window">
                <div className="mk-order-lifecycle-body">
                  <Sidebar />
                  {page}
                  <div className="mk-order-lifecycle-scrim" data-open={s.sheet || undefined} />
                  <Sheet s={s} compact={false} />
                </div>
              </Window>
            )}

            <StatusMenu s={s} trigger={rect("f-status")} />
            {compact ? null : <Calendar s={s} field={rect("f-paid")} />}

            <div className="mk-order-lifecycle-satellite">
              <Totals counted={s.counted} />
            </div>

            <span
              data-target="rest"
              className="mk-order-lifecycle-rest"
              style={{ left: REST[layout].x, top: REST[layout].y }}
            />
          </>
        );
      }}
    </Stage>
  );
}
