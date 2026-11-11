import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  DragDropVerticalIcon,
  GridViewIcon,
  Image01Icon,
  LeftToRightListDashIcon,
  StarIcon,
} from "@hugeicons/core-free-icons";
import { Stage, Window } from "@/components/stageshow/kit";
import type { Act, Layout, Point, Rect } from "@/components/stageshow/kit";
import type { DemoProps } from "../demo-props";
import type { CSSProperties } from "react";
import "./wishlist-rank.css";

// The Wishlist in its All view, as a gallery. The pointer comes onto a
// figure, its controls fade in, and it takes the drag handle. As in the app
// (SortableMediaCollection), the tile itself stays put: a small label with
// the figure's title rides the pointer, and a 2px line centered in the gap
// marks where it will land, jumping from gap to gap. Dropped before the
// first tile, the figure takes first place and the tiles before it step on
// one place in reading order, wrapping at the row's end. After a hold, the
// same drag puts it back, which is the loop's reset.
//
// Real strings: the page title, its count, the three release filters, Add
// (the header's AddLink, after the view toggle) and the moved figure's
// title. Every other figure is its image alone, as the gallery draws it.

type S = {
  /** The figure sits first */
  readonly first: boolean;
  /** The tile under the pointer, which shows its controls */
  readonly hover: string | null;
  /** The figure is being dragged: its own controls stay up */
  readonly held: boolean;
  /** The drag label's center in stage pixels, or "first" to sit it over the first tile.
   * It stays where it was after the drop, so the label fades where it was let go */
  readonly pill: Point | "first";
  /** The place the label is over, as dnd-kit's closestCenter picks it */
  readonly over: number | null;
  /** The order has changed this loop, so the tile at a row's end wraps instead of sitting */
  readonly stepped: boolean;
};

type Geometry = {
  readonly cols: number;
  readonly size: number;
  readonly gap: number;
  /** The tiles in view, in their starting order */
  readonly order: readonly string[];
};

const MOVED = "hikari";
const TITLE = "Hikari Seraph 1/7 Scale";

// Figure 1 is an art book with a real artist's name on its cover, so it is left out.
// Repeats keep apart: never side by side, never one over the other.
const IMAGE = new Map<string, number>([
  ["a", 5],
  ["b", 2],
  ["c", 7],
  ["d", 4],
  ["e", 3],
  ["f", 3],
  ["g", 5],
  ["h", 2],
  ["i", 7],
  [MOVED, 6],
]);
// The repeats show another part of their photo
const REPEATS = new Set(["f", "g", "h", "i"]);

const GEOMETRY = {
  wide: {
    cols: 5,
    size: 166,
    gap: 8,
    order: ["a", "b", "c", "d", "e", "f", MOVED, "g", "h", "i"],
  },
  compact: { cols: 2, size: 147, gap: 8, order: ["a", "b", MOVED, "c", "d", "e"] },
} satisfies Record<Layout, Geometry>;

const img = (id: string) => `/example-item${IMAGE.get(id) ?? 2}.webp`;

/** The tiles in reading order, with the figure first or at its own place */
function orderOf(g: Geometry, first: boolean): readonly string[] {
  if (!first) return g.order;
  return [MOVED, ...g.order.filter((id) => id !== MOVED)];
}

/** Where a place sits in the grid, in grid pixels */
function placeAt(g: Geometry, i: number): Point {
  const pitch = g.size + g.gap;
  return { x: (i % g.cols) * pitch, y: Math.floor(i / g.cols) * pitch };
}

const centerOf = (r: Rect): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
// Where the hand lets go over a tile: right of its middle, so the label it
// carries stays clear of the window's edge, and still nearest this tile's center
const dropAt = (r: Rect): Point => ({ x: r.x + r.width * 0.68, y: r.y + r.height * 0.4 });
const inside = (r: Rect, p: Point) =>
  p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;

const initial: S = {
  first: false,
  hover: null,
  held: false,
  pill: "first",
  over: null,
  stepped: false,
};
// The figure carried over the first tile, the line before it: where it goes is the story
const poster: S = { ...initial, held: true, pill: "first", over: 0 };

// Where the pointer waits: open surface in the header, near the grid
const REST = { wide: { x: 560, y: 102 }, compact: { x: 306, y: 96 } };

/** Every place's rect, measured where it sits in the layout */
function places(a: Act<S>): readonly Rect[] {
  const g = GEOMETRY[a.layout];
  return g.order.map((_, i) => a.rect(`place-${i}`, { layout: true }));
}

/** A move that shows a tile's controls while the pointer is over it, as hover does */
async function glide(a: Act<S>, to: Point, first: boolean, duration?: number) {
  const g = GEOMETRY[a.layout];
  const order = orderOf(g, first);
  const rects = places(a);
  await a.moveCursor(to, {
    duration,
    onMove: (at) => {
      const i = rects.findIndex((r) => inside(r, at));
      a.put({ hover: i === -1 ? null : (order[i] ?? null) });
    },
  });
}

/** Take the figure by its handle and drop it on a place, as dnd-kit lets the label do */
async function carry(a: Act<S>, from: number, to: number, first: boolean) {
  const rects = places(a);
  const source = rects[from];
  const target = rects[to];
  if (!source || !target) return;
  // Onto the figure first, so its controls come up, then onto the handle
  await glide(a, { x: source.x + source.width * 0.55, y: source.y + source.height * 0.42 }, first);
  await a.wait(260);
  const handle = a.rect("handle");
  await a.moveCursor(centerOf(handle), { duration: 380 });
  await a.wait(180);
  const end = dropAt(target);
  await a.drag(
    end,
    (at) => {
      // The pointer has pressed and moved before this first call: the label
      // is up from the first frame of the carry, centered on the pointer
      let over = from;
      let best = Number.POSITIVE_INFINITY;
      rects.forEach((r, i) => {
        const c = centerOf(r);
        const d = Math.hypot(c.x - at.x, c.y - at.y);
        if (d < best) {
          best = d;
          over = i;
        }
      });
      a.put({ held: true, hover: null, pill: at, over });
    },
    { duration: 1300 },
  );
}

async function script(a: Act<S>) {
  const g = GEOMETRY[a.layout];
  const home = g.order.indexOf(MOVED);
  await a.wait(600);
  a.mark("grab");
  await carry(a, home, 0, false);
  a.mark("drop");
  // Released before the first tile: the label goes, and the order follows
  await a.set({
    held: false,
    over: null,
    first: true,
    hover: MOVED,
    stepped: true,
  });
  await a.wait(900);
  await glide(a, REST[a.layout], true, 800);
  a.mark("hold");
  await a.wait(2200);
  // Put back where it was, the visible cause of the reset
  a.mark("back");
  await carry(a, 0, home, true);
  await a.set({ held: false, over: null, first: false, hover: MOVED });
  await a.wait(700);
  await glide(a, REST[a.layout], false, 800);
  // The wrapped tile's copy and the label have long faded: nothing on screen changes
  await a.snap({ stepped: false, pill: "first" });
  await a.wait(900);
}

/** The drop line: 2px, centered in the gap before or after the tile it marks */
function DropLine({ s, g }: { readonly s: S; readonly g: Geometry }) {
  const order = orderOf(g, s.first);
  const active = order.indexOf(MOVED);
  const over = s.over;
  const show = s.held && over !== null && over !== active;
  const at = placeAt(g, over ?? 0);
  const after = over !== null && active < over;
  const x = after ? at.x + g.size + g.gap / 2 - 1 : at.x - g.gap / 2 - 1;
  return (
    <span
      className="mk-wishlist-rank-line"
      data-snap
      data-show={show || undefined}
      style={{ left: x, top: at.y + 8, height: g.size - 16 }}
    />
  );
}

type Wrap = "down" | "up" | undefined;

function Face({ id }: { readonly id: string }) {
  return (
    <span className="mk-wishlist-rank-image" data-cursor="hand" data-crop>
      <img src={img(id)} alt="" draggable={false} data-alt={REPEATS.has(id) || undefined} />
    </span>
  );
}

function Tile({
  id,
  at,
  shown,
  wrap,
}: {
  readonly id: string;
  readonly at: Point;
  readonly shown: boolean;
  readonly wrap: Wrap;
}) {
  const moved = id === MOVED;
  return (
    <div
      className="mk-wishlist-rank-tile"
      data-moved={moved || undefined}
      data-shown={shown || undefined}
      data-wrap={wrap}
      style={{ transform: `translate(${at.x}px, ${at.y}px)` }}
    >
      <span className="mk-wishlist-rank-face">
        <Face id={id} />
      </span>
      <span className="mk-wishlist-rank-controls">
        <span
          className="mk-wishlist-rank-control"
          data-target={moved ? "handle" : undefined}
          data-cursor="open"
        >
          <HugeiconsIcon icon={DragDropVerticalIcon} size={14} />
        </span>
        <span className="mk-wishlist-rank-control mk-wishlist-rank-star">
          <HugeiconsIcon icon={StarIcon} size={14} fill="currentColor" />
        </span>
      </span>
    </div>
  );
}

function Header({ layout }: { readonly layout: Layout }) {
  return (
    <div className="mk-wishlist-rank-header">
      <span className="mk-wishlist-rank-heading">
        <span className="mk-wishlist-rank-title">Wishlist</span>
        <span className="mk-wishlist-rank-count">24 Items</span>
      </span>
      <span className="mk-wishlist-rank-actions">
        <span className="mk-wishlist-rank-segmented">
          <span className="mk-wishlist-rank-segment" data-on>
            All
          </span>
          <span className="mk-wishlist-rank-segment">Upcoming</span>
          <span className="mk-wishlist-rank-segment">Available</span>
        </span>
        {layout === "wide" ? (
          <span className="mk-wishlist-rank-segmented">
            <span className="mk-wishlist-rank-segment mk-wishlist-rank-view">
              <HugeiconsIcon icon={GridViewIcon} size={16} strokeWidth={2} />
            </span>
            <span className="mk-wishlist-rank-segment mk-wishlist-rank-view">
              <HugeiconsIcon icon={LeftToRightListDashIcon} size={16} strokeWidth={2} />
            </span>
            <span className="mk-wishlist-rank-segment mk-wishlist-rank-view" data-on>
              <HugeiconsIcon icon={Image01Icon} size={16} strokeWidth={2} />
            </span>
          </span>
        ) : null}
        {layout === "wide" ? (
          <span className="mk-wishlist-rank-add">
            <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={2} />
            Add
          </span>
        ) : null}
      </span>
    </div>
  );
}

function Gallery({ s, layout }: { readonly s: S; readonly layout: Layout }) {
  const g = GEOMETRY[layout];
  const order = orderOf(g, s.first);
  const rows = Math.ceil(g.order.length / g.cols);
  const pitch = g.size + g.gap;
  // The tile at the first row's end steps across the row break: it leaves
  // its row to the right and comes into the next from the left, or back
  const wrapId = g.order[g.cols - 1] ?? "";
  let wrap: Wrap;
  if (s.stepped) wrap = s.first ? "down" : "up";
  const left = placeAt(g, s.first ? g.cols - 1 : g.cols);
  return (
    <div
      className="mk-wishlist-rank-grid"
      style={
        {
          width: g.cols * pitch - g.gap,
          height: rows * pitch - g.gap,
          "--tile": `${g.size}px`,
        } as CSSProperties
      }
    >
      {g.order.map((_, i) => {
        const at = placeAt(g, i);
        return (
          <span
            key={i}
            className="mk-wishlist-rank-place"
            data-target={`place-${i}`}
            style={{ left: at.x, top: at.y }}
          />
        );
      })}
      {g.order.map((id) => (
        <Tile
          key={id}
          id={id}
          at={placeAt(g, order.indexOf(id))}
          shown={s.hover === id || (s.held && id === MOVED)}
          wrap={id === wrapId ? wrap : undefined}
        />
      ))}
      {wrap ? (
        // The wrapping tile leaving the place it had, as it comes in at the next
        <div
          className="mk-wishlist-rank-tile mk-wishlist-rank-ghost"
          data-wrap={wrap}
          style={{ transform: `translate(${left.x}px, ${left.y}px)` }}
        >
          <span className="mk-wishlist-rank-face">
            <Face id={wrapId} />
          </span>
        </div>
      ) : null}
      <DropLine s={s} g={g} />
    </div>
  );
}

function Page({ s, layout }: { readonly s: S; readonly layout: Layout }) {
  return (
    <div className="mk-wishlist-rank-page">
      <Header layout={layout} />
      <Gallery s={s} layout={layout} />
    </div>
  );
}

/** The drag label, as SortableMediaCollection's DragOverlay draws it: centered on the pointer */
function Pill({ s, first }: { readonly s: S; readonly first: Rect }) {
  const at = s.pill === "first" ? dropAt(first) : s.pill;
  return (
    <span
      className="mk-wishlist-rank-pill"
      data-show={s.held || undefined}
      style={{ transform: `translate(${at.x}px, ${at.y}px)` }}
    >
      {TITLE}
    </span>
  );
}

export function WishlistRankDemo({ theme }: DemoProps) {
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
      cursor={{ at: REST }}
      className="look-myakiba mk-wishlist-rank"
    >
      {(s, rect, layout) => (
        <>
          {layout === "wide" ? (
            <Window className="mk-wishlist-rank-window" body={{ "data-crop": true }}>
              <Page s={s} layout={layout} />
            </Window>
          ) : (
            // A phone column has no room for a desktop window's shape: the
            // window's surface without its chrome, the page with its header
            // on top, off the right and the foot
            <div className="ss-window mk-wishlist-rank-panel" data-crop>
              <Page s={s} layout={layout} />
            </div>
          )}
          <Pill s={s} first={rect("place-0")} />
        </>
      )}
    </Stage>
  );
}
