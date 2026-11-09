import { HugeiconsIcon } from "@hugeicons/react";
import { MoreHorizontalIcon } from "@hugeicons/core-free-icons";
import { Bar, Roll, Stage, Window } from "@/components/stageshow/kit";
import type { Act } from "@/components/stageshow/kit";
import type { DemoProps } from "../demo-props";
import "./order-price.css";

// An item's price corrected in place on the order's own page, and the cost
// breakdown following. Copied from the table-edit gold: one click opens the
// price cell as a field (as InlineCurrencyCell does), Cmd+A selects the value,
// the new amount is typed over it, Enter commits, the cell washes once, and a
// beat later the breakdown's Items line and its Total roll. Plays once.
//
// The math holds: Items is the sum of the item prices (each counted once),
// and Total is Items plus the order's fees.
//
// Each item reads as ItemTitleCell draws it: the title, then its MFC number
// and its category on a second line.

type S = {
  readonly edit: boolean;
  readonly sel: boolean;
  readonly val: string;
  readonly price: number;
  readonly wash: boolean;
};

type Item = {
  readonly title: string;
  /** The item's MyFigureCollection number, shown under its title */
  readonly mfc: number;
  readonly category: string;
  readonly tone: "prepainted" | "plushes";
  readonly image: string;
  readonly price: number;
};

const ITEMS: readonly Item[] = [
  {
    title: "Sakura Tsukimi 1/7 Scale",
    mfc: 1_482_317,
    category: "Prepainted",
    tone: "prepainted",
    image: "/example-item4.webp",
    price: 172.4,
  },
  {
    title: "Luna Starling 1/8 Scale",
    mfc: 1_519_064,
    category: "Prepainted",
    tone: "prepainted",
    image: "/example-item6.webp",
    price: 129.99,
  },
  {
    title: "Momo Plush (Large)",
    mfc: 1_396_852,
    category: "Plushes",
    tone: "plushes",
    image: "/example-item3.webp",
    price: 38,
  },
];
const EDIT = 1;
const OLD_PRICE = 129.99;
const NEW_PRICE = 148.5;
const FEES = [
  { label: "Shipping", amount: 24.5 },
  { label: "Taxes", amount: 18.62 },
] as const;
const RELEASE_WIDTHS = [64, 52, 70] as const;

const money = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const initial: S = { edit: false, sel: false, val: "", price: OLD_PRICE, wash: false };
// The result, with the edited cell still marked, so the still says what changed
const poster: S = { ...initial, price: NEW_PRICE, wash: true };

async function script(a: Act<S>) {
  await a.wait(900);
  a.mark("open");
  await a.move({ at: "price", x: 0.15, y: 0.55 });
  await a.wait(200);
  // One click opens the cell, as the real InlineCurrencyCell does
  await a.click({ at: "price", x: 0.15, y: 0.55 });
  a.put({ edit: true, val: "129.99" });
  // Off the digits while typing, as a hand does once it goes to the keys
  await a.move({ at: "price", x: -0.6, y: 1.6 }, { duration: 450 });
  await a.wait(150);
  a.mark("select");
  await a.key("cmd+a");
  a.put({ sel: true });
  await a.wait(900);
  a.mark("type");
  a.put({ sel: false, val: "" });
  await a.type("val", "148.50", { interval: 90 });
  await a.wait(400);
  a.mark("commit");
  await a.key("enter");
  a.put({ edit: false, price: NEW_PRICE, wash: true });
  await a.wait(900);
  a.put({ wash: false });
  await a.wait(2400);
}

export function OrderPriceDemo({ theme }: DemoProps) {
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
      keys={{ wide: "bottom-right", compact: "top" }}
      cursor={{ at: { wide: { x: 820, y: 392 }, compact: { x: 262, y: 214 } } }}
      className="look-myakiba mk-order-price"
    >
      {(s, _rect, layout) => {
        const compact = layout === "compact";
        const prices = ITEMS.map((item, i) => (i === EDIT ? s.price : item.price));
        const itemsTotal = prices.reduce((sum, p) => sum + p, 0);
        const total = FEES.reduce((sum, fee) => sum + fee.amount, itemsTotal);

        return (
          <Window className="mk-order-price-win">
            <div className="mk-order-price-body">
              {compact ? null : (
                <div className="mk-order-price-hero">
                  <img className="mk-order-price-hero-thumb" src="/example-item4.webp" alt="" />
                  <div className="mk-order-price-hero-text">
                    <div className="mk-order-price-hero-title">
                      <span>Spring preorders</span>
                      <span className="mk-order-price-status">
                        <span className="mk-order-price-status-dot" />
                        Shipped
                      </span>
                    </div>
                    <div className="mk-order-price-hero-meta">
                      <Bar w={84} h={6} tone={2} />
                      <Bar w={40} h={6} tone={2} />
                      <Bar w={52} h={6} tone={2} />
                    </div>
                  </div>
                </div>
              )}

              <div className="mk-order-price-grid">
                <section className="mk-order-price-items">
                  {compact ? null : (
                    <div className="mk-order-price-heading">Items ({ITEMS.length})</div>
                  )}
                  <div className="mk-order-price-table">
                    {compact ? null : (
                      <div className="mk-order-price-row mk-order-price-row--head">
                        <span className="mk-order-price-check" />
                        <span>Item</span>
                        <span>Release</span>
                        <span className="mk-order-price-num">Price</span>
                        <span />
                      </div>
                    )}
                    {ITEMS.map((item, i) => {
                      const edited = i === EDIT;
                      const price = prices[i] ?? item.price;
                      return (
                        <div key={item.title} className="mk-order-price-row">
                          {compact ? null : <span className="mk-order-price-check" />}
                          <span className="mk-order-price-item">
                            <img className="mk-order-price-thumb" src={item.image} alt="" />
                            <span className="mk-order-price-item-text">
                              {compact && !edited ? (
                                <Bar w={i === 0 ? 112 : 88} h={7} tone={3} />
                              ) : (
                                <span className="mk-order-price-title">{item.title}</span>
                              )}
                              <span className="mk-order-price-meta">
                                {compact && !edited ? (
                                  <Bar w={64} h={6} tone={2} />
                                ) : (
                                  <span className="mk-order-price-mfc">MFC #{item.mfc}</span>
                                )}
                                <span className="mk-order-price-category" data-tone={item.tone}>
                                  {item.category}
                                </span>
                              </span>
                            </span>
                          </span>
                          {compact ? null : (
                            <span>
                              <Bar w={RELEASE_WIDTHS[i] ?? 60} h={6} tone={2} />
                            </span>
                          )}
                          {edited ? (
                            <PriceCell s={s} />
                          ) : (
                            <span className="mk-order-price-num mk-order-price-amount">
                              {money(price)}
                            </span>
                          )}
                          {compact ? null : (
                            <span className="mk-order-price-actions">
                              <HugeiconsIcon icon={MoreHorizontalIcon} size={16} />
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section className="mk-order-price-costs">
                  <div className="mk-order-price-heading">Cost breakdown</div>
                  <div className="mk-order-price-lines">
                    <div className="mk-order-price-line">
                      <span className="mk-order-price-label">Items</span>
                      <span className="mk-order-price-num">
                        <Roll delay={350}>{money(itemsTotal)}</Roll>
                      </span>
                    </div>
                    {FEES.map((fee) => (
                      <div key={fee.label} className="mk-order-price-line">
                        <span className="mk-order-price-label">{fee.label}</span>
                        <span className="mk-order-price-num">{money(fee.amount)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mk-order-price-total">
                    <span>Total</span>
                    <span className="mk-order-price-num mk-order-price-total-value">
                      <Roll delay={500}>{money(total)}</Roll>
                    </span>
                  </div>
                </section>
              </div>
            </div>
          </Window>
        );
      }}
    </Stage>
  );
}

// The price cell, closed or open. The field's surface is drawn inside the
// cell and the digits keep their exact place, right aligned, so opening it
// brings only the surface, the ring and the caret.
function PriceCell({ s }: { readonly s: S }) {
  return (
    <span
      className="mk-order-price-num mk-order-price-cell"
      data-target="price"
      data-edit={s.edit || undefined}
      data-wash={s.wash || undefined}
    >
      <span className="mk-order-price-field" />
      <span className="mk-order-price-cell-text">
        {s.edit ? (
          <>
            <span className="mk-order-price-sel" data-typing data-on={s.sel || undefined}>
              ${s.val}
            </span>
            <span className="mk-order-price-caret" data-hide={s.sel || undefined} key={s.val} />
          </>
        ) : (
          money(s.price)
        )}
      </span>
    </span>
  );
}
