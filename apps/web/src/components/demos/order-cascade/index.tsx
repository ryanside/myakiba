import { HugeiconsIcon } from "@hugeicons/react";
import { MoreHorizontalIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { Menu, Popover, Roll, Stage, Window } from "@/components/stageshow/kit";
import type { Act, Rect } from "@/components/stageshow/kit";
import { DisclosureIcon, ExpandIcon } from "@/lib/icons";
import type { DemoProps } from "../demo-props";
import "./order-cascade.css";

// In the orders table, an order's Status goes from Paid to Shipped, and the
// items in its open subtable follow. Beats: the pointer opens the order's
// Status select, the list opens over the cell with Paid under the pointer, it
// picks Shipped, the order's status rolls in place, then a beat later each
// item's status rolls top to bottom. The reset is the same select set back
// to Paid, so the items are seen following the order both ways.
//
// In the app an order edit sends its Status as a cascade, so every item's
// status really changes. They update together when the items refetch; the
// stagger here is an illustration of that one update.

type Status = "Ordered" | "Paid" | "Shipped" | "Owned";

type S = {
  readonly open: boolean;
  readonly order: Status;
  readonly items: readonly Status[];
};

const STATUSES: readonly Status[] = ["Ordered", "Paid", "Shipped", "Owned"];

const ITEMS = [
  { title: "Sora 1/4 Scale", price: "$289.00", image: "/example-item2.webp" },
  { title: "Momo Plush", price: "$34.50", image: "/example-item3.webp" },
  { title: "Hanami 1/7 Scale", price: "$162.70", image: "/example-item4.webp" },
] as const;

const OTHER_ORDERS = [
  {
    title: "Winter scale figures",
    shop: "Lantern Figures",
    items: 2,
    total: "$318.00",
    status: "Ordered",
    images: ["/example-item5.webp", "/example-item6.webp"],
  },
  {
    title: "Art book bundle",
    shop: "Tsuki Books",
    items: 2,
    total: "$72.40",
    status: "Owned",
    images: ["/example-item7.webp", "/example-item1.webp"],
  },
] as const;

const OPEN_ORDER = {
  title: "Spring preorders",
  shop: "Kumo Hobby",
  items: 3,
  total: "$486.20",
  images: ITEMS.map((item) => item.image),
};

const initial: S = { open: false, order: "Paid", items: ["Paid", "Paid", "Paid"] };
const poster: S = { open: false, order: "Shipped", items: ["Shipped", "Shipped", "Shipped"] };

const cls = (name: string) => `mk-order-cascade-${name}`;

/** Picks a status from the order's select, as a mouse does it. */
async function pick(a: Act<S>, to: Status) {
  await a.moveCursor({ at: "order-status", x: 0.78, y: 0.55 });
  await a.wait(180);
  await a.click({ at: "order-status", x: 0.78, y: 0.55 });
  a.put({ open: true });
  await a.wait(520);
  await a.moveCursor({ at: `opt-${to}`, x: 0.72, y: 0.55 }, { duration: 420 });
  await a.wait(260);
  await a.click({ at: `opt-${to}`, x: 0.72, y: 0.55 });
  a.put({ open: false });
  await a.wait(90);
  a.put({ order: to });
}

/** The items follow their order, top to bottom. */
async function cascade(a: Act<S>, to: Status) {
  await a.stagger(
    [0, 1, 2],
    (index) => {
      a.put((s) => ({ items: s.items.map((status, i) => (i === index ? to : status)) }));
    },
    70,
  );
}

async function script(a: Act<S>) {
  await a.wait(1100);
  a.mark("open");
  await pick(a, "Shipped");
  // Off the value so the roll reads, to empty space left of the item statuses
  const away = a.moveCursor("rest", { duration: 700 });
  await a.wait(650);
  a.mark("cascade");
  await cascade(a, "Shipped");
  await away;
  await a.wait(2600);
  a.mark("reset");
  await pick(a, "Paid");
  const back = a.moveCursor("rest", { duration: 700 });
  await a.wait(650);
  await cascade(a, "Paid");
  await back;
  await a.wait(1300);
}

function StatusValue({ status }: { readonly status: Status }) {
  return (
    <span className={cls("status-value")}>
      <span className={cls("dot")} data-status={status} />
      <Roll className={cls("status-label")}>{status}</Roll>
    </span>
  );
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

function Check() {
  return <span className={cls("check")} />;
}

function Expand({ open }: { readonly open?: boolean }) {
  return (
    <span className={cls("expand")} data-open={open || undefined}>
      <HugeiconsIcon icon={ExpandIcon} size={16} strokeWidth={1.5} />
    </span>
  );
}

function More() {
  return (
    <span className={cls("more")}>
      <HugeiconsIcon icon={MoreHorizontalIcon} size={16} strokeWidth={1.5} />
    </span>
  );
}

function OrderTitle({
  title,
  images,
}: {
  readonly title: string;
  readonly images: readonly string[];
}) {
  return (
    <span className={cls("order")}>
      <Thumbs images={images} />
      <span className={cls("order-title")}>{title}</span>
    </span>
  );
}

/** Where the list sits: the selected row's text over the trigger's value, as the app's select aligns it. */
function listPlacement(trigger: Rect, selected: number, stageWidth: number) {
  const width = 144;
  const inset = 4;
  const rowHeight = 30;
  const left = trigger.x - 2;
  const maxLeft = stageWidth - 24 - width;
  return {
    left: Math.min(left, maxLeft),
    top: trigger.y + trigger.height / 2 - inset - rowHeight * selected - rowHeight / 2,
    width,
  };
}

export function OrderCascadeDemo({ theme }: DemoProps) {
  return (
    <Stage<S>
      width={960}
      height={440}
      compact={{ below: 560, width: 358, height: 400 }}
      initial={initial}
      poster={poster}
      script={script}
      play="loop"
      theme={theme}
      cursor={{ at: { wide: "rest", compact: "rest" } }}
      className="look-myakiba mk-order-cascade"
    >
      {(s, rect, layout) => {
        const compact = layout === "compact";
        const trigger = rect("order-status");
        const selected = STATUSES.indexOf(s.order);
        const place = listPlacement(trigger, selected, compact ? 358 : 960);
        return (
          <>
            <Window className={cls("window")}>
              <div className={cls("body")}>
                <div className={`${cls("row")} ${cls("head")}`}>
                  <span className={cls("cell-check")}>
                    <Check />
                  </span>
                  <span className={cls("head-expand")} />
                  <span className={`${cls("cell")} ${cls("head-order")}`}>Order</span>
                  <span className={`${cls("cell")} ${cls("col-shop")}`}>Shop</span>
                  <span className={`${cls("cell")} ${cls("num")} ${cls("col-items")}`}>Items</span>
                  <span className={`${cls("cell")} ${cls("num")} ${cls("col-total")}`}>Total</span>
                  <span className={`${cls("cell")} ${cls("head-last")}`}>Status</span>
                </div>

                <div className={cls("row")}>
                  <span className={cls("cell-check")}>
                    <Check />
                  </span>
                  <Expand open />
                  <span className={cls("cell")}>
                    <OrderTitle title={OPEN_ORDER.title} images={OPEN_ORDER.images} />
                  </span>
                  <span className={`${cls("cell")} ${cls("col-shop")}`}>{OPEN_ORDER.shop}</span>
                  <span className={`${cls("cell")} ${cls("num")} ${cls("col-items")}`}>
                    {OPEN_ORDER.items}
                  </span>
                  <span className={`${cls("cell")} ${cls("num")} ${cls("col-total")}`}>
                    {OPEN_ORDER.total}
                  </span>
                  <span className={cls("cell")}>
                    <span
                      className={cls("trigger")}
                      data-target="order-status"
                      data-open={s.open || undefined}
                    >
                      <StatusValue status={s.order} />
                      <span className={cls("chevron")}>
                        <HugeiconsIcon icon={DisclosureIcon} size={16} strokeWidth={2} />
                      </span>
                    </span>
                  </span>
                  <span className={cls("cell-more")}>
                    <More />
                  </span>
                </div>

                <div className={cls("sub")}>
                  <div className={cls("sub-card")}>
                    {ITEMS.map((item, i) => (
                      <div key={item.title} className={cls("sub-row")}>
                        <span className={cls("cell-check")}>
                          <Check />
                        </span>
                        <span className={cls("cell")}>
                          <span className={cls("item")}>
                            <img
                              className={cls("item-thumb")}
                              src={item.image}
                              alt=""
                              draggable={false}
                            />
                            <span className={cls("item-title")}>{item.title}</span>
                          </span>
                        </span>
                        <span className={`${cls("cell")} ${cls("num")} ${cls("col-price")}`}>
                          {item.price}
                        </span>
                        <span className={cls("cell")}>
                          <span className={cls("trigger")} data-target={`item-status-${i}`}>
                            <StatusValue status={s.items[i] ?? "Paid"} />
                          </span>
                        </span>
                        <span className={cls("cell-more")}>
                          <More />
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {OTHER_ORDERS.map((order) => (
                  <div key={order.title} className={`${cls("row")} ${cls("other")}`}>
                    <span className={cls("cell-check")}>
                      <Check />
                    </span>
                    <Expand />
                    <span className={cls("cell")}>
                      <OrderTitle title={order.title} images={order.images} />
                    </span>
                    <span className={`${cls("cell")} ${cls("col-shop")}`}>{order.shop}</span>
                    <span className={`${cls("cell")} ${cls("num")} ${cls("col-items")}`}>
                      {order.items}
                    </span>
                    <span className={`${cls("cell")} ${cls("num")} ${cls("col-total")}`}>
                      {order.total}
                    </span>
                    <span className={cls("cell")}>
                      <span className={cls("trigger")}>
                        <StatusValue status={order.status} />
                      </span>
                    </span>
                    <span className={cls("cell-more")}>
                      <More />
                    </span>
                  </div>
                ))}
              </div>
            </Window>

            <span className={cls("rest")} data-target="rest" aria-hidden />

            <Popover
              show={s.open}
              origin="center"
              className={cls("list")}
              style={{ left: place.left, top: place.top, width: place.width }}
            >
              <Menu
                className={cls("menu")}
                targets={STATUSES.map((status) => `opt-${status}`)}
                items={STATUSES.map((status) => (
                  <span key={status} className={cls("option")}>
                    <span className={cls("dot")} data-status={status} />
                    <span>{status}</span>
                    {status === s.order ? (
                      <span className={cls("tick")}>
                        <HugeiconsIcon icon={Tick02Icon} size={16} strokeWidth={2} />
                      </span>
                    ) : null}
                  </span>
                ))}
              />
            </Popover>
          </>
        );
      }}
    </Stage>
  );
}
