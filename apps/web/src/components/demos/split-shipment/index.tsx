import type { CSSProperties } from "react";
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
import { Bar, Collapse, Count, Roll, Stage, Window } from "@/components/stageshow/kit";
import type { Act, Rect } from "@/components/stageshow/kit";
import { DisclosureIcon, ExpandIcon } from "@/lib/icons";
import type { DemoProps } from "../demo-props";
import "./split-shipment.css";

// One item moved out of an open order into a new order of its own, in the
// orders table: the mirror of merge-orders. Beats: the pointer ticks one item
// in the open order's subtable and the action bar rises with "1 item
// selected"; Move Item opens the Move Items dialog on Existing Order; the
// pointer picks New Order and the form grows into place; a triple click
// selects the default title and a new one is typed over it; Move to New Order
// spins, the dialog closes and the bar leaves; the item's figure lifts off its
// row and lands as the thumbnail of a new order at the top of the table, the
// subtable closes up, and the open order's Items and Total roll down. Plays
// once and holds on the two orders.
//
// True to the app (orders module `split`): it inserts a new order from the
// form and moves the selected items into it. The original order is not
// touched, so it keeps its own fees; an order's Total is its items' prices
// plus its fees, so the original drops by exactly the item's price, and the
// new order's Total is the item's price plus the form's fees, which default
// to 0.00. The new order's status is the form's default, Ordered. The table
// sorts newest first, so the new order lands at the top. The figure's flight
// is an illustration of the refetch that, in the app, swaps the rows at once.

type Status = "Ordered" | "Paid" | "Shipped" | "Owned";

type Order = {
  readonly title: string;
  readonly items: number;
  readonly total: string;
  readonly status: Status;
  readonly images: readonly string[];
};

type Item = {
  readonly title: string;
  readonly price: string;
  readonly image: string;
};

/** rest: on the row; lift: picked up; go: carried to the new order's row. */
type Flight = { readonly from: Rect; readonly to: Rect; readonly phase: "rest" | "lift" | "go" };

type S = {
  readonly picked: boolean;
  readonly dialog: boolean;
  readonly mode: "existing" | "new";
  readonly focus: boolean;
  readonly sel: boolean;
  readonly title: string;
  readonly pending: boolean;
  /** The figure in flight from the item's row to the new order's. */
  readonly fly: Flight | null;
  /** The item's own thumbnail has left its row. */
  readonly lifted: boolean;
  /** The new order's row is open at the top of the table. */
  readonly opened: boolean;
  /** The figure has landed as the new order's thumbnail. */
  readonly landed: boolean;
  /** The item's row has closed out of the subtable. */
  readonly gone: boolean;
  /** The open order's Items and Total have rolled down. */
  readonly rolled: boolean;
  readonly wash: boolean;
};

// The open order, newest in the table. Its items sum to its Total: no fees.
const SORA: Item = { title: "Sora 1/4 Scale", price: "$289.00", image: "/example-item2.webp" };
const HANAMI: Item = { title: "Hanami 1/7 Scale", price: "$162.70", image: "/example-item4.webp" };
const MOMO: Item = { title: "Momo Plush", price: "$34.50", image: "/example-item3.webp" };

const OPEN_TITLE = "Spring preorders";
// $289.00 + $162.70 + $34.50, then less the moved $162.70
const BEFORE = { items: 3, cents: 48_620, images: [SORA.image, HANAMI.image, MOMO.image] };
const AFTER = { items: 2, cents: 32_350, images: [SORA.image, MOMO.image] };

const TYPED = "Spring — early ship";

// The new order: the moved item's price and the form's default fees, 0.00
const SPLIT: Order = {
  title: TYPED,
  items: 1,
  total: "$162.70",
  status: "Ordered",
  images: [HANAMI.image],
};

const OTHERS: readonly Order[] = [
  {
    title: "Winter preorders",
    items: 2,
    total: "$258.70",
    status: "Ordered",
    images: ["/example-item5.webp", "/example-item6.webp"],
  },
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
];

const initial: S = {
  picked: false,
  dialog: false,
  mode: "existing",
  focus: false,
  sel: false,
  title: "New Order",
  pending: false,
  fly: null,
  lifted: false,
  opened: false,
  landed: false,
  gone: false,
  rolled: false,
  wash: false,
};

// The result: the new order at the top, the open order one item lighter
const poster: S = {
  ...initial,
  mode: "new",
  title: TYPED,
  lifted: true,
  opened: true,
  landed: true,
  gone: true,
  rolled: true,
};

const cls = (name: string) => `mk-split-shipment-${name}`;

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

async function script(a: Act<S>) {
  await a.wait(900);
  a.mark("select");
  await a.click({ at: "item-check", x: 0.5, y: 0.5 });
  a.put({ picked: true });
  await a.wait(800);
  a.mark("move");
  await a.click({ at: "bar-move", x: 0.9, y: 0.6 });
  a.put({ dialog: true });
  await a.wait(800);
  a.mark("new");
  await a.click({ at: "radio-new", x: 0.5, y: 0.5 });
  a.put({ mode: "new" });
  await a.wait(750);
  a.mark("title");
  // A triple click selects the whole default title, as in any text field
  await a.click({ at: "title-input", x: 0.86, y: 0.6 }, { double: true });
  a.put({ focus: true });
  await a.click();
  a.put({ sel: true });
  await a.wait(650);
  a.mark("type");
  a.put({ sel: false, title: "" });
  await a.type("title", TYPED, { interval: 55 });
  await a.wait(500);
  a.mark("submit");
  await a.click({ at: "submit", x: 0.9, y: 0.62 });
  a.put({ pending: true });
  await a.wait(700);
  // The move returns: the selection clears, the dialog closes, the bar leaves
  a.mark("moved");
  await a.set({ dialog: false, focus: false, picked: false });
  const away = a.move("rest", { duration: 900 });
  await a.wait(250);
  // The figure lifts off its row, then rides up into the new order's row as
  // that row opens at the top; the subtable closes up behind it
  const from = a.rect("item-thumb", { layout: true });
  const to = a.rect("new-thumb", { layout: true });
  await a.set({ fly: { from, to, phase: "rest" }, lifted: true });
  await a.set({ fly: { from, to, phase: "lift" } });
  await a.wait(220);
  a.mark("fly");
  await a.set({ opened: true, fly: { from, to, phase: "go" } });
  await a.wait(200);
  a.put({ gone: true });
  await a.wait(700);
  a.put({ fly: null, landed: true, wash: true });
  await a.wait(300);
  a.mark("rolled");
  a.put({ rolled: true });
  await away;
  await a.wait(1600);
  a.put({ wash: false });
  await a.wait(1400);
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

function StatusCell({ status }: { readonly status: Status }) {
  return (
    <span className={cls("status")}>
      <span className={cls("dot")} data-status={status} />
      {status}
    </span>
  );
}

function More() {
  return (
    <span className={cls("cell-more")}>
      <HugeiconsIcon icon={MoreHorizontalIcon} size={16} strokeWidth={1.5} />
    </span>
  );
}

function OrderRow({
  order,
  wash,
  thumb,
}: {
  readonly order: Order;
  readonly wash?: boolean;
  readonly thumb?: React.ReactNode;
}) {
  return (
    <div className={cls("row")} data-wash={wash || undefined}>
      <span className={cls("cell-check")}>
        <Check />
      </span>
      <span className={cls("expand")}>
        <HugeiconsIcon icon={ExpandIcon} size={16} strokeWidth={1.5} />
      </span>
      <span className={cls("cell")}>
        <span className={cls("order")}>
          {thumb ?? <Thumbs images={order.images} />}
          <span className={cls("order-title")}>{order.title}</span>
        </span>
      </span>
      <span className={`${cls("cell")} ${cls("num")} ${cls("col-items")}`}>{order.items}</span>
      <span className={`${cls("cell")} ${cls("num")} ${cls("col-total")}`}>{order.total}</span>
      <span className={`${cls("cell")} ${cls("col-status")}`}>
        <StatusCell status={order.status} />
      </span>
      <More />
    </div>
  );
}

/** The open order: its row, then its items on the subtable's tinted panel. */
function OpenOrder({ s }: { readonly s: S }) {
  const items = [SORA, HANAMI, MOMO];
  return (
    <div className={cls("open-order")}>
      <div className={cls("row")}>
        <span className={cls("cell-check")}>
          <Check />
        </span>
        <span className={cls("expand")} data-open>
          <HugeiconsIcon icon={ExpandIcon} size={16} strokeWidth={1.5} />
        </span>
        <span className={cls("cell")}>
          <span className={cls("order")}>
            {/* The stack loses the moved figure: the two stacks crossfade */}
            <span className={cls("thumb-swap")} data-rolled={s.rolled || undefined}>
              <Thumbs images={BEFORE.images} />
              <Thumbs images={AFTER.images} />
            </span>
            <span className={cls("order-title")}>{OPEN_TITLE}</span>
          </span>
        </span>
        <span className={`${cls("cell")} ${cls("num")} ${cls("col-items")}`}>
          <Count value={s.rolled ? AFTER.items : BEFORE.items} duration={600} />
        </span>
        <span className={`${cls("cell")} ${cls("num")} ${cls("col-total")}`}>
          <Count value={s.rolled ? AFTER.cents : BEFORE.cents} format={money} duration={800} />
        </span>
        <span className={`${cls("cell")} ${cls("col-status")}`}>
          <StatusCell status="Ordered" />
        </span>
        <More />
      </div>
      <div className={cls("sub")}>
        <div className={cls("sub-card")}>
          {items.map((item) => {
            const moving = item === HANAMI;
            const row = (
              <div
                className={cls("sub-row")}
                data-picked={(moving && s.picked) || undefined}
                data-lifted={(moving && s.lifted) || undefined}
              >
                <span className={cls("cell-check")}>
                  <Check on={moving && s.picked} target={moving ? "item-check" : undefined} />
                </span>
                <span className={cls("cell")}>
                  <span className={cls("item")}>
                    <img
                      className={cls("item-thumb")}
                      src={item.image}
                      alt=""
                      draggable={false}
                      data-target={moving ? "item-thumb" : undefined}
                    />
                    <span className={cls("item-title")}>{item.title}</span>
                  </span>
                </span>
                <span className={`${cls("cell")} ${cls("num")} ${cls("col-price")}`}>
                  {item.price}
                </span>
                <span className={`${cls("cell")} ${cls("col-status")}`}>
                  <StatusCell status="Ordered" />
                </span>
                <More />
              </div>
            );
            return moving ? (
              <Collapse key={item.title} open={!s.gone}>
                {row}
              </Collapse>
            ) : (
              <div key={item.title}>{row}</div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ActionBar({ s, compact }: { readonly s: S; readonly compact: boolean }) {
  return (
    <div className={cls("bar")} data-open={s.picked || undefined}>
      <span className={cls("bar-selection")}>1 item selected</span>
      <span className={cls("bar-sep")} />
      <span className={cls("bar-group")}>
        {/* The phone column keeps the one action the story uses */}
        {compact ? null : (
          <span className={cls("bar-item")} data-off>
            <HugeiconsIcon icon={GitMergeIcon} size={14} strokeWidth={1.5} />
          </span>
        )}
        <span className={cls("bar-item")} data-target="bar-move">
          <HugeiconsIcon icon={MoveIcon} size={14} strokeWidth={1.5} />
          Move Item
        </span>
        {compact ? null : (
          <>
            <span className={cls("bar-item")} data-off>
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

function Radio({
  on,
  label,
  target,
}: {
  readonly on: boolean;
  readonly label: string;
  readonly target?: string;
}) {
  return (
    <span className={cls("radio-row")}>
      <span className={cls("radio")} data-on={on || undefined} data-target={target} />
      {label}
    </span>
  );
}

function MoveDialog({ s, compact }: { readonly s: S; readonly compact: boolean }) {
  const fresh = s.mode === "new";
  return (
    <div className={cls("dialog")} data-open={s.dialog || undefined}>
      <span className={cls("dialog-close")}>
        <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={2} />
      </span>
      <div className={cls("dialog-head")}>
        <div className={cls("dialog-title")}>Move Items</div>
        <div className={cls("dialog-desc")}>
          Move the selected 1 item to an existing order or create a new order.
        </div>
      </div>
      <div className={cls("dest")}>
        <span className={cls("label")}>
          <Bar w={64} h={6} tone={3} />
        </span>
        <span className={cls("radios")}>
          <Radio on={!fresh} label="Existing Order" />
          <Radio on={fresh} label="New Order" target="radio-new" />
        </span>
      </div>
      <div className={cls("modes")}>
        {/* Existing Order: the order picker, closed */}
        <Collapse open={!fresh}>
          <div className={cls("existing")}>
            <div className={cls("field")}>
              <span className={cls("label")}>
                <Bar w={72} h={6} tone={3} />
              </span>
              <span className={`${cls("input")} ${cls("combo")}`}>
                <Bar w={112} h={6} tone={2} />
                <HugeiconsIcon icon={DisclosureIcon} size={16} strokeWidth={1.5} />
              </span>
            </div>
          </div>
        </Collapse>
        {/* New Order: the order form, scrolled to Basics */}
        <Collapse open={fresh}>
          <div className={cls("form")}>
            <div className={cls("section")}>
              <HugeiconsIcon icon={ExpandIcon} size={14} strokeWidth={2} />
              Basics
            </div>
            <div className={cls("pair")}>
              <div className={cls("field")}>
                <span className={cls("label")}>Title</span>
                <span
                  className={cls("input")}
                  data-target="title-input"
                  data-cursor="ibeam"
                  data-focus={s.focus || undefined}
                >
                  <span className={cls("input-clip")}>
                    <span className={cls("input-text")}>
                      <span className={cls("sel")} data-on={s.sel || undefined} data-typing>
                        {s.title}
                      </span>
                      {s.focus ? (
                        <span
                          className={cls("caret")}
                          data-hide={s.sel || undefined}
                          key={s.title}
                        />
                      ) : null}
                    </span>
                  </span>
                </span>
              </div>
              <FillerField label={30}>
                <Bar w={compact ? 52 : 92} h={6} tone={2} />
              </FillerField>
            </div>
            <div className={cls("pair")}>
              <FillerField label={38}>
                <span className={cls("dot")} data-status="Ordered" />
                <Bar w={compact ? 40 : 54} h={6} tone={3} />
              </FillerField>
              <FillerField label={84}>
                <Bar w={24} h={6} tone={3} />
              </FillerField>
            </div>
          </div>
        </Collapse>
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
          <span className={cls("button-label")}>
            <Roll variant="fade">{fresh ? "Move to New Order" : "Move Items"}</Roll>
          </span>
          <span className={cls("button-spin")}>
            <HugeiconsIcon icon={Loading03Icon} size={16} strokeWidth={2} />
          </span>
        </span>
      </div>
    </div>
  );
}

/** The moved item's figure, carried from its row to the new order's. */
function Flyer({ fly }: { readonly fly: Flight }) {
  const style = {
    left: fly.from.x,
    top: fly.from.y,
    width: fly.from.width,
    height: fly.from.height,
    "--mk-dx": `${fly.to.x - fly.from.x}px`,
    "--mk-dy": `${fly.to.y - fly.from.y}px`,
  } as CSSProperties;
  return (
    <span className={cls("flyer")} data-phase={fly.phase} style={style} aria-hidden>
      <span className={cls("flyer-card")}>
        <img src={HANAMI.image} alt="" draggable={false} />
      </span>
    </span>
  );
}

export function SplitShipmentDemo({ theme }: DemoProps) {
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
      className="look-myakiba mk-split-shipment"
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

                  {/* The table's body: the rows under its header */}
                  <div>
                    <Collapse open={s.opened} reveal="drop">
                      <OrderRow
                        order={SPLIT}
                        wash={s.wash}
                        thumb={
                          <span
                            className={cls("new-thumb")}
                            data-target="new-thumb"
                            data-landed={s.landed || undefined}
                          >
                            <img src={HANAMI.image} alt="" draggable={false} />
                          </span>
                        }
                      />
                    </Collapse>
                    <OpenOrder s={s} />
                    {/* The older orders, under the open one */}
                    <div>
                      {OTHERS.map((order) => (
                        <OrderRow key={order.title} order={order} />
                      ))}
                    </div>
                  </div>
                </div>
                <ActionBar s={s} compact={compact} />
                <div className={cls("backdrop")} data-open={s.dialog || undefined} />
              </div>
            </Window>
            <MoveDialog s={s} compact={compact} />
            {s.fly ? <Flyer fly={s.fly} /> : null}
            <span className={cls("rest")} data-target="rest" aria-hidden />
          </>
        );
      }}
    </Stage>
  );
}
