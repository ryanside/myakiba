import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  CheckmarkCircle02Icon,
  PanelLeftIcon,
  SearchIcon,
} from "@hugeicons/core-free-icons";
import { Bar, Count, Stage, Text, Window } from "@/components/stageshow/kit";
import type { Act, Layout, Point } from "@/components/stageshow/kit";
import type { DemoProps } from "../demo-props";
import "./order-board.css";

// The dashboard's "In progress" board. The cursor takes a Shipped order by
// its card, carries it to Owned and drops it. The order's three items join
// the collection: a success toast, then Total Items rolls up by 3 and Active
// Orders down by 1 (the toast comes on the write, the totals on the refetch
// after it). Then the order is dragged back, which is what resets the loop:
// Total Items and Active Orders roll back, and no toast, as in the app.
//
// What makes the move read as one gesture (from the reorder and
// freeform-drag golds):
// - Every card sits at its place by a transform, so cards glide when the
//   carried one leaves or arrives.
// - The carried card follows the hand exactly from where it was taken hold
//   of, lifted a touch with a degree of tilt, and glides into its slot from
//   where the hand let go.
// - Its own column closes up as it lifts; the column it is over opens a slot
//   with a dashed mark that only fades.

type Col = "Ordered" | "Paid" | "Shipped" | "Owned";
type Home = "Shipped" | "Owned";

type S = {
  /** The order's column, and the column a carry starts from */
  status: Home;
  /** The carried card's top left, in board pixels, while the hand holds it */
  carry: Point | null;
  /** The column the carried card is over */
  over: Col | null;
  toast: boolean;
  /** The totals have caught up with the order being Owned */
  counted: boolean;
};

const initial: S = { status: "Shipped", carry: null, over: null, toast: false, counted: false };
const poster: S = { status: "Owned", carry: null, over: null, toast: true, counted: true };

type Geometry = {
  cols: readonly Col[];
  colW: number;
  gap: number;
  cardH: number;
  pitch: number;
  listY: number;
};

const GEOMETRY = {
  wide: {
    cols: ["Ordered", "Paid", "Shipped", "Owned"],
    colW: 207,
    gap: 12,
    cardH: 74,
    pitch: 82,
    listY: 32,
  },
  compact: { cols: ["Shipped", "Owned"], colW: 150, gap: 10, cardH: 66, pitch: 74, listY: 32 },
} satisfies Record<Layout, Geometry>;

const DOT = {
  Ordered: "var(--mk-ordered)",
  Paid: "var(--mk-paid)",
  Shipped: "var(--mk-shipped)",
  Owned: "var(--mk-owned)",
} satisfies Record<Col, string>;

const img = (n: number) => `/example-item${n}.webp`;

type Words = { title: string; shop: string; total: string };
type Filler = {
  images: readonly number[];
  title: number;
  shop: number;
  total: number;
  /** The neighbor the moving order lands on top of says what it is */
  words?: Words;
};

// The other orders on the board: real thumbnails, quiet words
const OTHERS = {
  Ordered: [
    { images: [3], title: 96, shop: 52, total: 38 },
    { images: [2, 6], title: 118, shop: 44, total: 42 },
    { images: [5, 7, 4, 3], title: 84, shop: 58, total: 36 },
  ],
  Paid: [
    { images: [6, 2], title: 104, shop: 48, total: 40 },
    { images: [7], title: 88, shop: 56, total: 36 },
    { images: [4, 5], title: 112, shop: 46, total: 42 },
  ],
  Shipped: [
    { images: [3, 5], title: 92, shop: 50, total: 40 },
    { images: [2], title: 110, shop: 44, total: 36 },
    { images: [6, 4, 3], title: 98, shop: 52, total: 40 },
    { images: [7, 5], title: 90, shop: 46, total: 38 },
  ],
  Owned: [
    {
      images: [5],
      title: 100,
      shop: 54,
      total: 38,
      words: { title: "Winter haul", shop: "Kumo Toys", total: "$148.50" },
    },
    { images: [2, 3, 6, 7], title: 86, shop: 46, total: 42 },
    { images: [7, 4], title: 116, shop: 50, total: 36 },
    { images: [3, 2], title: 94, shop: 48, total: 40 },
  ],
} satisfies Record<Col, readonly Filler[]>;

// How many orders each column holds without the one that moves; the columns
// run on past the crop. Ordered, Paid and Shipped add up to Active Orders,
// and Ordered is the unpaid count.
const BASE = { Ordered: 5, Paid: 4, Shipped: 4, Owned: 6 } satisfies Record<Col, number>;

const ORDER = { title: "Starfall set", shop: "Nekoya", total: "$386.00" } satisfies Words;
const ORDER_IMAGES = [4, 6, 7];
const ITEMS = 3;

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const cents = (n: number) => usd.format(n / 100);

// Where the cursor waits between beats: empty surface in the section
// heading's row, above the two columns the story uses
const REST = { wide: { x: 676, y: 223 }, compact: { x: 300, y: 137 } };

// Where the hand takes hold of the card, as fractions of it: in the clear
// right of the title, or on the thumbnails where the title runs the width,
// so the hand never sits on the words
const GRAB = { wide: { x: 0.86, y: 0.3 }, compact: { x: 0.2, y: 0.5 } } satisfies Record<
  Layout,
  Point
>;

const colX = (g: Geometry, c: Col) => Math.max(0, g.cols.indexOf(c)) * (g.colW + g.gap);

/** The column under the carried card's middle */
function columnAt(g: Geometry, x: number): Col {
  const i = Math.floor((x + g.colW / 2 + g.gap / 2) / (g.colW + g.gap));
  return g.cols[Math.max(0, Math.min(g.cols.length - 1, i))] ?? "Shipped";
}

/** Whether the moving order takes the first place in a column right now */
function holds(s: S, c: Col): boolean {
  if (s.carry) return s.over === c && c !== s.status;
  return s.status === c;
}

/** The column the order counts in: the one it is over while carried, as dnd-kit moves it */
function countsIn(s: S, c: Col): boolean {
  return (s.carry ? (s.over ?? s.status) : s.status) === c;
}

async function carry(a: Act<S>, to: Home) {
  const g = GEOMETRY[a.layout];
  // Where the card is drawn: it sits by a translate, which a layout rect leaves out
  const card = a.rect("order");
  const hold = GRAB[a.layout];
  const grab = { x: card.width * hold.x, y: card.height * hold.y };
  await a.moveCursor({ x: card.x + grab.x, y: card.y + grab.y });
  await a.wait(220);
  const board = a.rect("board", { layout: true });
  const slot = a.rect(`slot-${to}`, { layout: true });
  await a.drag(
    { x: slot.x + grab.x, y: slot.y + grab.y },
    (at) => {
      const x = at.x - grab.x - board.x;
      const y = at.y - grab.y - board.y;
      // drag() has closed the hand before its first callback: the card lifts
      // on the press, never while the hand is open
      a.put({ carry: { x, y }, over: columnAt(g, x) });
    },
    { duration: 1250 },
  );
  // Released: it glides from where the hand left it into its slot
  await a.set({ carry: null, over: null, status: to });
}

async function script(a: Act<S>) {
  await a.wait(500);
  a.mark("grab");
  await carry(a, "Owned");
  a.mark("drop");
  await a.wait(450);
  a.mark("toast");
  await a.set({ toast: true });
  await a.wait(700);
  await a.moveCursor("rest", { duration: 700 });
  a.mark("totals");
  await a.set({ counted: true });
  await a.wait(2600);
  a.mark("back");
  await a.set({ toast: false });
  await a.wait(300);
  await carry(a, "Shipped");
  await a.wait(500);
  await a.set({ counted: false });
  await a.wait(600);
  await a.moveCursor("rest", { duration: 700 });
}

function Thumb({ images, size }: { images: readonly number[]; size: number }) {
  const shown = images.slice(0, 4);
  return (
    <span
      className="mk-order-board-thumb"
      data-count={shown.length}
      style={{ width: size, height: size }}
    >
      {shown.map((n, i) => (
        <img key={`${n}-${i}`} src={img(n)} alt="" draggable={false} />
      ))}
    </span>
  );
}

function FillerCard({ card, thumb, compact }: { card: Filler; thumb: number; compact: boolean }) {
  if (card.words)
    return <RealCard words={card.words} images={card.images} thumb={thumb} compact={compact} />;
  return (
    <div className="mk-order-board-card" data-cursor="open">
      <Thumb images={card.images} size={thumb} />
      <div className="mk-order-board-card__text">
        <span className="mk-order-board-card__line">
          <Bar w={card.title} h={7} r={3.5} tone={3} />
        </span>
        <span className="mk-order-board-card__meta">
          <Bar w={card.shop} h={6} r={3} tone={2} />
          <Bar w={card.total} h={6} r={3} tone={3} className="mk-order-board-card__end" />
        </span>
      </div>
    </div>
  );
}

/** A card with its words. A phone column has no room for the shop beside the
 * total, so it shows the total alone, as the app does for an order with no shop */
function RealCard({
  words,
  images,
  thumb,
  compact,
}: {
  words: Words;
  images: readonly number[];
  thumb: number;
  compact: boolean;
}) {
  return (
    <div className="mk-order-board-card" data-cursor="open">
      <Thumb images={images} size={thumb} />
      <div className="mk-order-board-card__text">
        <span className="mk-order-board-card__line">
          <Text className="mk-order-board-card__title">{words.title}</Text>
        </span>
        <span className="mk-order-board-card__meta">
          {!compact && <Text className="mk-order-board-card__shop">{words.shop}</Text>}
          <Text className="mk-order-board-card__total">{words.total}</Text>
        </span>
      </div>
    </div>
  );
}

function Kpi({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mk-order-board-kpi">
      <span className="mk-order-board-kpi__label">{label}</span>
      <span className="mk-order-board-kpi__row">{children}</span>
    </div>
  );
}

function Board({ s, layout }: { s: S; layout: Layout }) {
  const g = GEOMETRY[layout];
  const thumb = layout === "compact" ? 40 : 48;
  const lifted = s.carry !== null;
  const at = s.carry ?? { x: colX(g, s.status), y: g.listY };
  return (
    <div className="mk-order-board-board" data-target="board">
      {g.cols.map((c) => {
        const shift = holds(s, c) ? 1 : 0;
        const others = OTHERS[c];
        const count = BASE[c] + (countsIn(s, c) && (c === "Shipped" || c === "Owned") ? 1 : 0);
        const slotShown = lifted && s.over === c && c !== s.status;
        return (
          <div key={c} className="mk-order-board-col" style={{ left: colX(g, c), width: g.colW }}>
            <div className="mk-order-board-col__head">
              <span className="mk-order-board-col__dot" style={{ background: DOT[c] }} />
              <span className="mk-order-board-col__title">{c}</span>
              <span className="mk-order-board-col__badge">
                <Count value={count} duration={420} />
              </span>
            </div>
            {(c === "Shipped" || c === "Owned") && (
              <div
                className="mk-order-board-slot"
                data-target={`slot-${c}`}
                data-show={slotShown || undefined}
                style={{ top: g.listY, height: g.cardH }}
              />
            )}
            {others.map((card, i) => (
              <div
                key={i}
                className="mk-order-board-place"
                style={{ transform: `translateY(${g.listY + (i + shift) * g.pitch}px)` }}
              >
                <FillerCard card={card} thumb={thumb} compact={layout === "compact"} />
              </div>
            ))}
          </div>
        );
      })}
      <div
        className="mk-order-board-carried"
        data-target="order"
        data-cursor="open"
        data-lifted={lifted || undefined}
        style={{
          width: g.colW,
          translate: `${at.x}px ${at.y}px`,
          transformOrigin: `${GRAB[layout].x * 100}% ${GRAB[layout].y * 100}%`,
        }}
      >
        <RealCard
          words={ORDER}
          images={ORDER_IMAGES}
          thumb={thumb}
          compact={layout === "compact"}
        />
      </div>
    </div>
  );
}

/** The dashboard page: the app's header, the totals, then the board */
function App({ s, layout }: { s: S; layout: Layout }) {
  return (
    <div className="mk-order-board-app">
      <div className="mk-order-board-header">
        <span className="mk-order-board-header__group">
          <span className="mk-order-board-iconbtn">
            <HugeiconsIcon icon={PanelLeftIcon} size={16} />
          </span>
          <span className="mk-order-board-iconbtn" data-wide>
            <HugeiconsIcon icon={SearchIcon} size={16} />
          </span>
        </span>
        <span className="mk-order-board-header__group">
          <span className="mk-order-board-add">
            <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={2} />
          </span>
          <Bar w={28} h={28} r={14} tone={2} />
        </span>
      </div>
      <div className="mk-order-board-page">
        <div className="mk-order-board-kpis">
          <Kpi label="Total Items">
            <Count
              className="mk-order-board-kpi__value"
              value={128 + (s.counted ? ITEMS : 0)}
              duration={900}
            />
          </Kpi>
          {layout === "wide" && (
            <>
              <Kpi label="Total Spent">
                <Count className="mk-order-board-kpi__value" value={841_260} format={cents} />
              </Kpi>
              <Kpi label="Active Orders">
                <Count
                  className="mk-order-board-kpi__value"
                  value={14 - (s.counted ? 1 : 0)}
                  duration={900}
                />
                <span className="mk-order-board-kpi__sub">5 unpaid</span>
              </Kpi>
              <Kpi label="Unpaid Costs">
                <Count className="mk-order-board-kpi__value" value={29_640} format={cents} />
              </Kpi>
            </>
          )}
        </div>
        <div className="mk-order-board-section">In progress</div>
        <Board s={s} layout={layout} />
      </div>
      <div className="mk-order-board-toast" data-show={s.toast || undefined} role="status">
        <span className="mk-order-board-toast__icon">
          <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} strokeWidth={2} />
        </span>
        <span>Order marked as collected</span>
      </div>
    </div>
  );
}

export function OrderBoardDemo({ theme }: DemoProps) {
  return (
    <Stage<S>
      width={960}
      height={500}
      compact={{ below: 560, width: 358, height: 440 }}
      initial={initial}
      poster={poster}
      script={script}
      play="loop"
      theme={theme}
      fidelity="standard"
      cursor={{ at: REST }}
      className="look-myakiba mk-order-board"
    >
      {(s, _rect, layout) => (
        <>
          {layout === "wide" ? (
            <Window className="mk-order-board-window">
              <App s={s} layout={layout} />
            </Window>
          ) : (
            // A phone column has no room for a desktop window's shape: the
            // window's surface without its chrome, the page with its own
            // header on top, off the foot
            <div className="ss-window mk-order-board-panel">
              <App s={s} layout={layout} />
            </div>
          )}
          <span
            data-target="rest"
            className="mk-order-board-rest"
            style={{ left: REST[layout].x, top: REST[layout].y }}
          />
        </>
      )}
    </Stage>
  );
}
