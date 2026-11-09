import { HugeiconsIcon } from "@hugeicons/react";
import { MoreHorizontalIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { Menu, Popover, Roll, Stage, Window } from "@/components/stageshow/kit";
import type { Act, Rect } from "@/components/stageshow/kit";
import { DisclosureIcon, ExpandIcon } from "@/lib/icons";
import type { DemoProps } from "../demo-props";
import "./release-delay.css";

// In the orders table, a figure's release slips: the pointer opens one item's
// Release select in the order's open subtable, the list opens with the
// current release over the cell, and it picks the later one. The item's date
// rolls at once, and a beat later the order's own Release rolls to match,
// with one wash on that cell. Plays once: the order's date never moves
// earlier on its own, so there is no honest way back for a loop.
//
// In the app the item edit shows its new release at once (the select keeps
// the picked value while it saves). The order's Release Date is advanced on
// the server, in the same transaction, to the latest Selected Item Release
// when that is later. The orders list shows it when it refetches after the
// edit, which is the beat between the two rolls.
//
// Dates read the way the app formats them by default (MM/DD/YYYY). A release
// listed by month only on the catalog is stored as its first day.

type Release = "mar" | "aug";

type S = {
  readonly open: boolean;
  readonly item: Release;
  readonly order: Release;
  readonly wash: boolean;
};

const RELEASES: readonly {
  readonly id: Release;
  readonly date: string;
  readonly type: string;
  readonly price: string;
}[] = [
  { id: "mar", date: "03/01/2027", type: "Standard", price: "$159.99" },
  { id: "aug", date: "08/01/2027", type: "Standard", price: "$159.99" },
];

const dateOf = (id: Release) => RELEASES.find((r) => r.id === id)?.date ?? "";

/** The open order's items; the second is the one whose release slips. */
const ITEMS = [
  {
    title: "Sora 1/4 Scale",
    price: "$289.00",
    image: "/example-item2.webp",
    release: "12/01/2026",
  },
  { title: "Hanami 1/7 Scale", price: "$162.70", image: "/example-item4.webp", release: null },
  { title: "Momo Plush", price: "$34.50", image: "/example-item3.webp", release: "02/01/2027" },
] as const;

const EDIT = 1;

const OTHER_ORDERS = [
  {
    title: "Winter scale figures",
    shop: "Lantern Figures",
    release: "01/01/2027",
    total: "$318.00",
    status: "Ordered",
    images: ["/example-item5.webp", "/example-item6.webp"],
  },
  {
    title: "Art book bundle",
    shop: "Tsuki Books",
    release: "06/01/2026",
    total: "$72.40",
    status: "Owned",
    images: ["/example-item7.webp", "/example-item1.webp"],
  },
] as const;

const OPEN_ORDER = {
  title: "Spring preorders",
  shop: "Kumo Hobby",
  total: "$486.20",
  status: "Paid",
  images: ITEMS.map((item) => item.image),
};

const initial: S = { open: false, item: "mar", order: "mar", wash: false };
const poster: S = { open: false, item: "aug", order: "aug", wash: false };

const cls = (name: string) => `mk-release-delay-${name}`;

async function script(a: Act<S>) {
  await a.wait(1100);
  a.mark("open");
  await a.moveCursor({ at: "item-release", x: 0.9, y: 0.8 });
  await a.wait(180);
  await a.click({ at: "item-release", x: 0.9, y: 0.8 });
  a.put({ open: true });
  await a.wait(700);
  await a.moveCursor({ at: "opt-aug", x: 0.84, y: 0.5 }, { duration: 420 });
  await a.wait(320);
  await a.click({ at: "opt-aug", x: 0.84, y: 0.5 });
  a.put({ open: false });
  await a.wait(90);
  a.mark("pick");
  a.put({ item: "aug" });
  // Off the values, so both rolls read
  const away = a.moveCursor("rest", { duration: 700 });
  await a.wait(1000);
  a.mark("order");
  a.put({ order: "aug", wash: true });
  await away;
  await a.wait(900);
  a.put({ wash: false });
  await a.wait(2600);
}

function DateValue({ children }: { readonly children: string }) {
  return <Roll className={cls("date")}>{children}</Roll>;
}

function StatusValue({ status }: { readonly status: string }) {
  return (
    <span className={cls("status-value")}>
      <span className={cls("dot")} data-status={status} />
      <span>{status}</span>
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

/** Where the list sits: the selected release's date over the trigger's value, as the app's select aligns it. */
function listPlacement(trigger: Rect, selected: number, stageWidth: number) {
  const width = 256;
  const inset = 4;
  const rowHeight = 58;
  // From a row's top to the middle of its date line
  const dateLine = 20;
  const left = trigger.x - 2;
  const maxLeft = stageWidth - 24 - width;
  return {
    left: Math.min(left, maxLeft),
    top: trigger.y + trigger.height / 2 - inset - rowHeight * selected - dateLine,
    width,
  };
}

export function ReleaseDelayDemo({ theme }: DemoProps) {
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
      className="look-myakiba mk-release-delay"
    >
      {(s, rect, layout) => {
        const compact = layout === "compact";
        const trigger = rect("item-release");
        const selected = RELEASES.findIndex((r) => r.id === s.item);
        const place = listPlacement(trigger, Math.max(selected, 0), compact ? 358 : 960);
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
                  <span className={cls("cell")}>Release</span>
                  <span className={`${cls("cell")} ${cls("num")} ${cls("col-total")}`}>Total</span>
                  <span className={`${cls("cell")} ${cls("col-status")} ${cls("head-last")}`}>
                    Status
                  </span>
                </div>

                <div className={cls("row")}>
                  <span className={cls("cell-check")}>
                    <Check />
                  </span>
                  <Expand open />
                  <span className={`${cls("cell")} ${cls("title-cell")}`}>
                    <OrderTitle title={OPEN_ORDER.title} images={OPEN_ORDER.images} />
                  </span>
                  <span className={`${cls("cell")} ${cls("col-shop")}`}>{OPEN_ORDER.shop}</span>
                  <span className={cls("cell")}>
                    <span
                      className={cls("ghost")}
                      data-target="order-release"
                      data-wash={s.wash || undefined}
                    >
                      <DateValue>{dateOf(s.order)}</DateValue>
                    </span>
                  </span>
                  <span className={`${cls("cell")} ${cls("num")} ${cls("col-total")}`}>
                    {OPEN_ORDER.total}
                  </span>
                  <span className={`${cls("cell")} ${cls("col-status")}`}>
                    <StatusValue status={OPEN_ORDER.status} />
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
                        <span className={`${cls("cell")} ${cls("title-cell")}`}>
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
                        <span className={cls("cell")}>
                          {i === EDIT ? (
                            <span
                              className={cls("trigger")}
                              data-target="item-release"
                              data-open={s.open || undefined}
                            >
                              <DateValue>{dateOf(s.item)}</DateValue>
                              <span className={cls("chevron")}>
                                <HugeiconsIcon icon={DisclosureIcon} size={16} strokeWidth={2} />
                              </span>
                            </span>
                          ) : (
                            <span className={cls("trigger")}>
                              <span className={cls("date")}>{item.release}</span>
                            </span>
                          )}
                        </span>
                        <span className={`${cls("cell")} ${cls("num")} ${cls("col-price")}`}>
                          {item.price}
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
                    <span className={cls("cell")}>{order.release}</span>
                    <span className={`${cls("cell")} ${cls("num")} ${cls("col-total")}`}>
                      {order.total}
                    </span>
                    <span className={`${cls("cell")} ${cls("col-status")}`}>
                      <StatusValue status={order.status} />
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
                targets={RELEASES.map((release) => `opt-${release.id}`)}
                items={RELEASES.map((release) => (
                  <span key={release.id} className={cls("option")}>
                    <span className={cls("option-line")}>
                      <span className={cls("option-date")}>{release.date}</span>
                      <span className={cls("option-type")}>{release.type}</span>
                    </span>
                    <span className={cls("option-price")}>{release.price}</span>
                    {release.id === s.item ? (
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
