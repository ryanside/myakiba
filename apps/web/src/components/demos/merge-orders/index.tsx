import { HugeiconsIcon } from "@hugeicons/react";
import {
  Cancel01Icon,
  Delete01Icon,
  FolderAddIcon,
  GitMergeIcon,
  Loading03Icon,
  MoreHorizontalIcon,
  MoveIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { Bar, Collapse, Roll, Stage, Window } from "@/components/stageshow/kit";
import type { Act } from "@/components/stageshow/kit";
import { ExpandIcon } from "@/lib/icons";
import type { DemoProps } from "../demo-props";
import "./merge-orders.css";

// Two orders merged into one, in the orders table. Beats: the pointer ticks
// two orders; the action bar rises with the count and Merge turns on at the
// second; Merge opens the Merge Orders dialog over the blurred table; a
// triple click selects the default title and a new one is typed over it; Merge spins, the
// dialog closes and the bar leaves; a beat later the new order opens at the
// top with both orders' items, and the two originals fold away under it. Plays once and holds on the merged row.
//
// True to the app (orders module `merge`): it creates a new order from the
// form, moves every item of the selected orders into it and deletes the
// originals. The new order's fees come from the form, which defaults them to
// 0.00, so the two source orders carry no fees and the merged total is the
// sum of their item prices. Its status is the form's default, Ordered. The
// table sorts newest first, so the new order lands at the top, where the two
// newest orders were. The Shop column is hidden, as the table allows: the
// form's shop is empty by default, and a dash there would only distract.

type Status = "Ordered" | "Paid" | "Shipped" | "Owned";

type Order = {
  readonly title: string;
  readonly items: number;
  readonly total: string;
  readonly status: Status;
  readonly images: readonly string[];
};

type S = {
  /** The two newest orders' checkboxes. */
  readonly picked: readonly [boolean, boolean];
  /** The count the bar shows; it keeps the last count while the bar leaves. */
  readonly count: 1 | 2;
  readonly dialog: boolean;
  readonly focus: boolean;
  readonly sel: boolean;
  readonly title: string;
  readonly pending: boolean;
  /** The new order is in the table. */
  readonly merged: boolean;
  /** The two originals are gone from it. */
  readonly gone: boolean;
  readonly wash: boolean;
};

const SOURCES: readonly Order[] = [
  {
    title: "Spring preorders",
    items: 2,
    total: "$323.50",
    status: "Ordered",
    images: ["/example-item2.webp", "/example-item3.webp"],
  },
  {
    title: "Winter preorders",
    items: 2,
    total: "$258.70",
    status: "Ordered",
    images: ["/example-item5.webp", "/example-item6.webp"],
  },
];

const TYPED = "Spring + Winter haul";

// Sum of the two: 2 + 2 items, $323.50 + $258.70, no fees
const MERGED: Order = {
  title: TYPED,
  items: 4,
  total: "$582.20",
  status: "Ordered",
  images: SOURCES.flatMap((order) => order.images),
};

const OTHERS: readonly Order[] = [
  {
    title: "Art book bundle",
    items: 2,
    total: "$72.40",
    status: "Owned",
    images: ["/example-item7.webp", "/example-item1.webp"],
  },
  {
    title: "Summer prize figures",
    items: 3,
    total: "$141.30",
    status: "Shipped",
    images: ["/example-item4.webp", "/example-item1.webp", "/example-item3.webp"],
  },
  {
    title: "Autumn scale preorders",
    items: 2,
    total: "$318.00",
    status: "Ordered",
    images: ["/example-item6.webp", "/example-item4.webp"],
  },
  {
    title: "Plush restock",
    items: 1,
    total: "$34.50",
    status: "Paid",
    images: ["/example-item3.webp"],
  },
  {
    title: "Acrylic stand set",
    items: 3,
    total: "$27.80",
    status: "Owned",
    images: ["/example-item1.webp", "/example-item7.webp", "/example-item5.webp"],
  },
  {
    title: "Garage kit lot",
    items: 2,
    total: "$212.00",
    status: "Paid",
    images: ["/example-item2.webp", "/example-item4.webp"],
  },
];

const initial: S = {
  picked: [false, false],
  count: 1,
  dialog: false,
  focus: false,
  sel: false,
  title: "New Merged Order",
  pending: false,
  merged: false,
  gone: false,
  wash: false,
};

// The result: the new order in place of the two
const poster: S = { ...initial, count: 2, title: TYPED, merged: true, gone: true };

const cls = (name: string) => `mk-merge-orders-${name}`;

async function script(a: Act<S>) {
  await a.wait(900);
  a.mark("select");
  await a.click("check-0");
  a.put({ picked: [true, false], count: 1 });
  await a.wait(420);
  await a.click("check-1");
  a.put({ picked: [true, true], count: 2 });
  await a.wait(700);
  a.mark("merge");
  await a.click({ at: "bar-merge", x: 0.93, y: 0.6 });
  a.put({ dialog: true });
  await a.wait(650);
  a.mark("title");
  // A triple click selects the whole default title, as in any text field
  await a.click({ at: "title-input", x: 0.82, y: 0.6 }, { double: true });
  a.put({ focus: true });
  await a.click();
  a.put({ sel: true });
  await a.wait(700);
  a.mark("type");
  a.put({ sel: false, title: "" });
  await a.type("title", TYPED, { interval: 70 });
  await a.wait(500);
  a.mark("submit");
  await a.click({ at: "submit", x: 0.84, y: 0.62 });
  a.put({ pending: true });
  await a.wait(700);
  // The merge returns: the selection clears, the dialog closes and the bar
  // leaves; the table refreshes a beat later
  a.mark("merged");
  await a.set({ dialog: false, focus: false, picked: [false, false] });
  const away = a.moveCursor("rest", { duration: 800 });
  await a.wait(300);
  // The new order arrives at the top, then the two it replaced leave
  a.put({ merged: true, wash: true });
  await a.wait(380);
  a.put({ gone: true });
  await away;
  await a.wait(1500);
  a.put({ wash: false });
  await a.wait(1200);
}

function Thumbs({ images }: { readonly images: readonly string[] }) {
  return (
    <span className={cls("thumbs")} data-count={Math.min(images.length, 4)}>
      {images.slice(0, 4).map((src) => (
        <img key={src} src={src} alt="" draggable={false} />
      ))}
    </span>
  );
}

function Check({ on, target }: { readonly on?: boolean; readonly target?: string }) {
  return (
    <span className={cls("check")} data-on={on || undefined} data-target={target}>
      <HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={2} />
    </span>
  );
}

function OrderRow({
  order,
  picked,
  target,
  wash,
}: {
  readonly order: Order;
  readonly picked?: boolean;
  readonly target?: string;
  readonly wash?: boolean;
}) {
  return (
    <div className={cls("row")} data-picked={picked || undefined} data-wash={wash || undefined}>
      <span className={cls("cell-check")}>
        <Check on={picked} target={target} />
      </span>
      <span className={cls("expand")}>
        <HugeiconsIcon icon={ExpandIcon} size={16} strokeWidth={1.5} />
      </span>
      <span className={cls("cell")}>
        <span className={cls("order")}>
          <Thumbs images={order.images} />
          <span className={cls("order-title")}>{order.title}</span>
        </span>
      </span>
      <span className={`${cls("cell")} ${cls("num")} ${cls("col-items")}`}>{order.items}</span>
      <span className={`${cls("cell")} ${cls("num")} ${cls("col-total")}`}>{order.total}</span>
      <span className={`${cls("cell")} ${cls("col-status")}`}>
        <span className={cls("status")}>
          <span className={cls("dot")} data-status={order.status} />
          {order.status}
        </span>
      </span>
      <span className={cls("cell-more")}>
        <HugeiconsIcon icon={MoreHorizontalIcon} size={16} strokeWidth={1.5} />
      </span>
    </div>
  );
}

function ActionBar({ s, compact }: { readonly s: S; readonly compact: boolean }) {
  const open = s.picked.some(Boolean);
  const ready = s.picked.every(Boolean);
  return (
    <div className={cls("bar")} data-open={open || undefined}>
      <span className={cls("bar-selection")}>
        <Roll className={cls("bar-count")}>
          {`${s.count} order${s.count === 1 ? "" : "s"} selected`}
        </Roll>
      </span>
      <span className={cls("bar-sep")} />
      <span className={cls("bar-group")}>
        <span
          className={cls("bar-item")}
          data-tone="primary"
          data-off={!ready || undefined}
          data-target="bar-merge"
        >
          <HugeiconsIcon icon={GitMergeIcon} size={14} strokeWidth={1.5} />
          Merge
        </span>
        {/* The phone column keeps the one action the story uses */}
        {compact ? null : (
          <>
            <span className={cls("bar-item")} data-tone="primary" data-off>
              <HugeiconsIcon icon={MoveIcon} size={14} strokeWidth={1.5} />
            </span>
            <span className={cls("bar-item")} data-tone="primary">
              <HugeiconsIcon icon={FolderAddIcon} size={14} strokeWidth={1.5} />
            </span>
            <span className={cls("bar-item")} data-tone="destructive">
              <HugeiconsIcon icon={Delete01Icon} size={14} strokeWidth={1.5} />
            </span>
          </>
        )}
      </span>
      <span className={cls("bar-sep")} />
      <span className={cls("bar-close")}>
        <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={1.5} />
      </span>
    </div>
  );
}

function FillerField({
  label,
  children,
}: {
  readonly label: number;
  readonly children: React.ReactNode;
}) {
  return (
    <div className={cls("field")}>
      <span className={cls("label")}>
        <Bar w={label} h={6} tone={3} />
      </span>
      <span className={cls("input")}>{children}</span>
    </div>
  );
}

function MergeDialog({ s, compact }: { readonly s: S; readonly compact: boolean }) {
  return (
    <div className={cls("dialog")} data-open={s.dialog || undefined}>
      <span className={cls("dialog-close")}>
        <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={2} />
      </span>
      <div className={cls("dialog-head")}>
        <div className={cls("dialog-title")}>Merge Orders</div>
        <div className={cls("dialog-desc")}>Merge the selected 2 orders into a new order.</div>
      </div>
      <div className={cls("fields")}>
        <div className={cls("field")}>
          <span className={cls("label")}>Title</span>
          <span
            className={cls("input")}
            data-target="title-input"
            data-cursor="ibeam"
            data-focus={s.focus || undefined}
          >
            <span className={cls("input-text")}>
              <span className={cls("sel")} data-on={s.sel || undefined} data-typing>
                {s.title}
              </span>
              {s.focus ? (
                <span className={cls("caret")} data-hide={s.sel || undefined} key={s.title} />
              ) : null}
            </span>
          </span>
        </div>
        {compact ? null : (
          <div className={cls("pair")}>
            <FillerField label={38}>
              <span className={cls("dot")} data-status="Ordered" />
              <Bar w={54} h={6} tone={3} />
            </FillerField>
            <FillerField label={30}>
              <Bar w={84} h={6} tone={2} />
            </FillerField>
          </div>
        )}
      </div>
      <div className={cls("dialog-foot")}>
        <span className={cls("button")} data-tone="outline">
          Cancel
        </span>
        <span
          className={cls("button")}
          data-tone="primary"
          data-target="submit"
          data-pending={s.pending || undefined}
        >
          <span className={cls("button-label")}>Merge</span>
          <span className={cls("button-spin")}>
            <HugeiconsIcon icon={Loading03Icon} size={16} strokeWidth={2} />
          </span>
        </span>
      </div>
    </div>
  );
}

export function MergeOrdersDemo({ theme }: DemoProps) {
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
      className="look-myakiba mk-merge-orders"
    >
      {(s, _rect, layout) => {
        const compact = layout === "compact";
        return (
          <>
            <Window className={cls("window")}>
              <div className={cls("body")}>
                <div className={cls("table")}>
                  <div className={`${cls("row")} ${cls("head")}`}>
                    <span className={cls("cell-check")}>
                      <Check />
                    </span>
                    <span />
                    <span className={cls("cell")}>Order</span>
                    <span className={`${cls("cell")} ${cls("num")} ${cls("col-items")}`}>
                      Items
                    </span>
                    <span className={`${cls("cell")} ${cls("num")} ${cls("col-total")}`}>
                      Total
                    </span>
                    <span className={`${cls("cell")} ${cls("col-status")} ${cls("head-last")}`}>
                      Status
                    </span>
                  </div>

                  <Collapse open={s.merged} reveal="drop">
                    <OrderRow order={MERGED} wash={s.wash} />
                  </Collapse>
                  {SOURCES.map((order, i) => (
                    <Collapse key={order.title} open={!s.gone}>
                      <OrderRow order={order} picked={s.picked[i]} target={`check-${i}`} />
                    </Collapse>
                  ))}
                  {OTHERS.map((order) => (
                    <OrderRow key={order.title} order={order} />
                  ))}
                </div>
                <ActionBar s={s} compact={compact} />
                <div className={cls("backdrop")} data-open={s.dialog || undefined} />
              </div>
            </Window>
            <MergeDialog s={s} compact={compact} />
            <span className={cls("rest")} data-target="rest" aria-hidden />
          </>
        );
      }}
    </Stage>
  );
}
