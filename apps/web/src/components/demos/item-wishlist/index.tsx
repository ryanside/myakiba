import type { CSSProperties, ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  Calendar01Icon,
  FolderAddIcon,
  GridViewIcon,
  Image01Icon,
  LeftToRightListDashIcon,
  Loading03Icon,
  Refresh01Icon,
  Search01Icon,
  StarIcon,
} from "@hugeicons/core-free-icons";
import { Bar, Collapse, Roll, Stage, Window } from "@/components/stageshow/kit";
import type { Act, Layout } from "@/components/stageshow/kit";
import { BackIcon } from "@/lib/icons";
import type { DemoProps } from "../demo-props";
import "./item-wishlist.css";

// The Item Database in its list view. The pointer clicks into the search
// pill and types "aria"; after the input's debounce the results come back
// and the rows that don't match close up, while the count rolls to 3. The
// first result opens its own page: its thumbnail is the one image that grows
// into the page's hero, as the list fades and the page rises under it. On
// the page the pointer clicks Add to Wishlist: the star turns into a spinner
// while it saves, then fills and the label becomes Remove from Wishlist. The
// app shows no toast on add. It plays once and holds there.
//
// The hero is staging's ItemHero: the title over the MFC link and when it
// was updated (bars), then Refresh item details (the extension's Item
// Refresh, idle), the wishlist toggle and Add Item to List, wrapping one to a
// line in the phone column. Your Collection is its empty state: a line of
// text and Add to collection and Add to an order (AddLink), as bars.
//
// Real strings: the page title and its count, the placeholder and the query,
// the three results with their category, Add, Back, the figure's title, the
// three hero buttons, and the two section headings. Everything else is a bar.

type View = "database" | "item";

type S = {
  readonly focused: boolean;
  readonly query: string;
  readonly searched: boolean;
  readonly view: View;
  /** The wishlist save is in flight: the button shows its spinner, disabled */
  readonly saving: boolean;
  readonly wishlisted: boolean;
};

const initial: S = {
  focused: false,
  query: "",
  searched: false,
  view: "database",
  saving: false,
  wishlisted: false,
};
const poster: S = {
  focused: false,
  query: "aria",
  searched: true,
  view: "item",
  saving: false,
  wishlisted: true,
};

const cls = (name: string) => `mk-item-wishlist-${name}`;

// A list row: a 64px thumbnail with an 8px inset all round, 80px tall
const INSET = 8;
const THUMB = 64;

interface Geometry {
  /** The page's side insets: the end one keeps words inside the stage when the window runs off */
  readonly pad: number;
  readonly padEnd: number;
  /** Where the result list starts, under the toolbar */
  readonly listTop: number;
  /** The item page's hero image: its top and its size, at the app's 11:15 */
  readonly heroTop: number;
  readonly heroW: number;
  readonly heroH: number;
  /** Where Releases starts: under the image, or under the stacked buttons in the phone column */
  readonly detailsTop: number;
}

const GEOMETRY = {
  wide: {
    pad: 24,
    padEnd: 24,
    listTop: 106,
    heroTop: 60,
    heroW: 160,
    heroH: 218,
    detailsTop: 310,
  },
  compact: {
    pad: 16,
    padEnd: 58,
    listTop: 130,
    heroTop: 56,
    heroW: 96,
    heroH: 131,
    detailsTop: 254,
  },
} satisfies Record<Layout, Geometry>;

const TITLE = "Hoshino Aria 1/7 Scale";

// A quiet label on a primary button
const ON_PRIMARY = "color-mix(in oklab, var(--primary-foreground) 45%, transparent)";

interface Result {
  readonly id: string;
  readonly image: string;
  /** A second listing shows another part of its photo */
  readonly crop?: "low";
  /** Matches carry their words; the rest of the database is bars */
  readonly title?: string;
  /** Bar widths for a filler row's title and category */
  readonly bars: readonly [number, number];
  /** Bar widths for the release date and price on the right */
  readonly facts: readonly [number, number];
}

// Figure 1 is an art book with a real artist's name on its cover, so it is
// left out. The opened figure is first, so it stays put while the rest close.
const ROWS: readonly Result[] = [
  { id: "aria", image: "/example-item6.webp", title: TITLE, bars: [0, 0], facts: [64, 48] },
  { id: "f1", image: "/example-item2.webp", bars: [168, 58], facts: [60, 52] },
  {
    id: "ariana",
    image: "/example-item7.webp",
    title: "Ariana Verdant 1/7 Scale",
    bars: [0, 0],
    facts: [66, 50],
  },
  { id: "f2", image: "/example-item4.webp", bars: [132, 64], facts: [62, 46] },
  { id: "f3", image: "/example-item5.webp", bars: [150, 52], facts: [58, 54] },
  {
    id: "limited",
    image: "/example-item6.webp",
    crop: "low",
    title: "Hoshino Aria 1/7 Scale Limited Ver.",
    bars: [0, 0],
    facts: [64, 52],
  },
  { id: "f4", image: "/example-item3.webp", bars: [120, 60], facts: [60, 44] },
];

const PLACEHOLDER = "Search by title, MFC ID, or entry";

// Where the pointer waits: open page beside the header, near the search; on
// the item page, open space right of and below the buttons, clear of their labels
const REST = { wide: { x: 560, y: 96 }, compact: { x: 300, y: 126 } } as const;
const AFTER = { wide: { x: 812, y: 296 }, compact: { x: 304, y: 300 } } as const;
// Where the presses land: past the placeholder's last word in the pill, and in
// the row's open run beside its title, so the pointer never covers the words
const AIM = {
  wide: { search: 0.72, result: 0.62 },
  compact: { search: 0.94, result: 0.88 },
} as const;

async function script(a: Act<S>): Promise<void> {
  await a.wait(700);
  a.mark("search");
  // Into the pill past where the words will run, so the I-beam never covers them
  await a.click({ at: "search", x: AIM[a.layout].search, y: 0.55 });
  await a.set({ focused: true });
  await a.wait(350);
  a.mark("type");
  await a.type("query", "aria", { interval: 150 });
  // The input's 200ms debounce, then the request; the old list stays until it lands
  await a.wait(520);
  a.mark("results");
  await a.set({ searched: true });
  await a.wait(1200);
  a.mark("open");
  await a.click({ at: "result", x: AIM[a.layout].result, y: 0.5 });
  await a.set({ view: "item", focused: false });
  // On toward the button while the hero lands
  await a.wait(450);
  a.mark("star");
  await a.click({ at: "wishlist", x: 0.93, y: 0.84 });
  await a.set({ saving: true });
  await a.wait(480);
  a.mark("saved");
  await a.set({ saving: false, wishlisted: true });
  await a.wait(400);
  await a.move(AFTER[a.layout], { duration: 700 });
  a.mark("hold");
  await a.wait(2000);
}

function Icon({ icon, size = 16 }: { readonly icon: typeof StarIcon; readonly size?: number }) {
  return <HugeiconsIcon icon={icon} size={size} strokeWidth={1.5} />;
}

function SearchPill({ s }: { readonly s: S }): ReactNode {
  return (
    <span
      className={cls("search")}
      data-target="search"
      data-cursor="ibeam"
      data-focused={s.focused || undefined}
    >
      <span className={cls("search-icon")}>
        <HugeiconsIcon icon={Search01Icon} size={16} strokeWidth={1.5} />
      </span>
      <span className={cls("field")}>
        {s.query ? (
          <span className={cls("query")} data-typing>
            {s.query}
          </span>
        ) : null}
        {s.focused ? <span key={s.query} className={cls("caret")} data-typing /> : null}
        <span
          className={cls("placeholder")}
          data-hidden={s.query.length > 0 || undefined}
          data-typing
        >
          {PLACEHOLDER}
        </span>
      </span>
    </span>
  );
}

const VIEWS = [
  { mode: "grid", icon: GridViewIcon },
  { mode: "list", icon: LeftToRightListDashIcon },
  { mode: "gallery", icon: Image01Icon },
] as const;

function Toolbar({ s, compact }: { readonly s: S; readonly compact: boolean }): ReactNode {
  return (
    <div className={cls("toolbar")}>
      <SearchPill s={s} />
      {compact ? null : (
        <span className={cls("tools")}>
          <span className={cls("segmented")}>
            {VIEWS.map(({ mode, icon }) => (
              <span key={mode} className={cls("segment")} data-on={mode === "list" || undefined}>
                <HugeiconsIcon icon={icon} size={16} strokeWidth={2} />
              </span>
            ))}
          </span>
          <span className={cls("add")}>
            <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={2} />
            Add
          </span>
        </span>
      )}
    </div>
  );
}

function ResultRow({
  row,
  picked,
  compact,
}: {
  readonly row: Result;
  readonly picked: boolean;
  readonly compact: boolean;
}): ReactNode {
  const [titleBar, categoryBar] = row.bars;
  const [dateBar, priceBar] = row.facts;
  return (
    <div
      className={cls("row")}
      data-target={picked ? "result" : undefined}
      data-cursor="hand"
      data-picked={picked || undefined}
    >
      {/* The opened figure's image is the one that travels, laid over this slot */}
      <span className={cls("thumb")}>
        {picked ? null : <img src={row.image} alt="" draggable={false} data-crop={row.crop} />}
      </span>
      <span className={cls("row-text")}>
        {row.title ? (
          <>
            <span className={cls("row-title")}>{row.title}</span>
            <span className={cls("category")}>Prepainted</span>
          </>
        ) : (
          <>
            <span className={cls("bar-line")}>
              <Bar w={compact ? Math.round(titleBar * 0.75) : titleBar} h={7} r={3.5} tone={3} />
            </span>
            <span className={cls("bar-line")} data-small>
              <Bar w={categoryBar} h={6} r={3} tone={2} />
            </span>
          </>
        )}
      </span>
      {compact ? null : (
        <span className={cls("facts")}>
          <span className={cls("bar-line")} data-small>
            <Bar w={dateBar} h={5} r={2.5} tone={2} />
          </span>
          <span className={cls("bar-line")} data-small>
            <Bar w={priceBar} h={6} r={3} tone={3} />
          </span>
        </span>
      )}
    </div>
  );
}

function DatabasePage({
  s,
  g,
  compact,
}: {
  readonly s: S;
  readonly g: Geometry;
  readonly compact: boolean;
}): ReactNode {
  return (
    <div className={cls("page")} data-show={s.view === "database" || undefined}>
      <div className={cls("header")}>
        <span className={cls("title")}>Item Database</span>
        <span className={cls("count")}>
          <Roll>{s.searched ? "3 Items" : "12,408 Items"}</Roll>
        </span>
      </div>
      <Toolbar s={s} compact={compact} />
      <div className={cls("list")} style={{ top: g.listTop }}>
        {ROWS.map((row) => (
          <Collapse
            key={row.id}
            className={cls("collapse")}
            open={!s.searched || row.title !== undefined}
          >
            <ResultRow row={row} picked={row.id === "aria"} compact={compact} />
          </Collapse>
        ))}
      </div>
    </div>
  );
}

function WishlistButton({ s }: { readonly s: S }): ReactNode {
  let icon = "star";
  if (s.saving) icon = "spinner";
  else if (s.wishlisted) icon = "filled";
  return (
    <span
      className={cls("button")}
      data-target="wishlist"
      data-saving={s.saving || undefined}
      data-icon={icon}
    >
      {/* One slot, the three icons crossfading in it */}
      <span className={cls("button-icon")}>
        <span className={cls("star")}>
          <HugeiconsIcon icon={StarIcon} size={16} strokeWidth={1.5} />
        </span>
        <span className={cls("star-filled")}>
          <HugeiconsIcon icon={StarIcon} size={16} strokeWidth={1.5} fill="currentColor" />
        </span>
        <span className={cls("spinner")}>
          <HugeiconsIcon icon={Loading03Icon} size={16} strokeWidth={1.5} />
        </span>
      </span>
      <Roll variant="fade">{s.wishlisted ? "Remove from Wishlist" : "Add to Wishlist"}</Roll>
    </span>
  );
}

const RELEASES = [
  { date: 68, badge: 44, price: 56 },
  { date: 64, badge: 52, price: 52 },
] as const;

function ItemPage({
  s,
  g,
  compact,
}: {
  readonly s: S;
  readonly g: Geometry;
  readonly compact: boolean;
}): ReactNode {
  return (
    <div className={cls("page")} data-show={s.view === "item" || undefined}>
      <span className={cls("back")}>
        <HugeiconsIcon icon={BackIcon} size={14} strokeWidth={1.5} />
        Back
      </span>
      <div className={cls("hero")} style={{ top: g.heroTop, minHeight: g.heroH }}>
        {/* The image itself is the figure laid over this slot */}
        <span className={cls("hero-slot")} style={{ width: g.heroW, height: g.heroH }} />
        <div className={cls("hero-text")}>
          <div className={cls("hero-heading")}>
            <span className={cls("hero-title")}>{TITLE}</span>
            {compact ? null : (
              <span className={cls("hero-meta")}>
                <Bar w={196} h={5} r={2.5} tone={2} />
                <Bar w={84} h={5} r={2.5} tone={1} />
              </span>
            )}
          </div>
          <div className={cls("hero-actions")}>
            <span className={cls("button")}>
              <Icon icon={Refresh01Icon} />
              Refresh item details
            </span>
            <WishlistButton s={s} />
            <span className={cls("button")}>
              <Icon icon={FolderAddIcon} />
              Add Item to List
            </span>
          </div>
        </div>
      </div>
      <div className={cls("details")} style={{ top: g.detailsTop }}>
        <section className={cls("releases")}>
          <span className={cls("section-title")}>Releases</span>
          <span className={cls("release-rows")}>
            {RELEASES.map((release) => (
              <span key={release.date} className={cls("release")}>
                <span className={cls("release-icon")}>
                  <Icon icon={Calendar01Icon} size={14} />
                </span>
                <Bar w={release.date} h={7} r={3.5} tone={3} />
                <span className={cls("badge")}>
                  <Bar w={release.badge - 16} h={5} r={2.5} tone={2} />
                </span>
                <span className={cls("release-price")}>
                  <Bar w={release.price} h={7} r={3.5} tone={3} />
                </span>
              </span>
            ))}
          </span>
        </section>
        {compact ? null : (
          <section className={cls("collection")}>
            <span className={cls("section-title")}>Your Collection</span>
            <span className={cls("collection-text")}>
              <span className={cls("bar-line")}>
                <Bar w={252} h={6} r={3} tone={2} />
              </span>
              <span className={cls("bar-line")}>
                <Bar w={196} h={6} r={3} tone={2} />
              </span>
            </span>
            <span className={cls("collection-actions")}>
              <span className={cls("add")}>
                <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={2} />
                <Bar w={92} h={6} r={3} style={{ background: ON_PRIMARY }} />
              </span>
              <span className={cls("button")}>
                <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={2} />
                <Bar w={82} h={6} r={3} tone={3} />
              </span>
            </span>
          </section>
        )}
      </div>
    </div>
  );
}

/** The opened figure's one image: on its row's thumbnail, then the item page's hero. */
function Figure({ s, g }: { readonly s: S; readonly g: Geometry }): ReactNode {
  const open = s.view === "item";
  const box = open
    ? { left: g.pad, top: g.heroTop, width: g.heroW, height: g.heroH }
    : { left: g.pad + INSET, top: g.listTop + INSET, width: THUMB, height: THUMB };
  return (
    <span
      className={cls("figure")}
      data-open={open || undefined}
      style={
        {
          width: box.width,
          height: box.height,
          transform: `translate(${box.left}px, ${box.top}px)`,
        } as CSSProperties
      }
      aria-hidden
    >
      <img src="/example-item6.webp" alt="" draggable={false} />
    </span>
  );
}

export function ItemWishlistDemo({ theme }: DemoProps): ReactNode {
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
      cursor={{ at: REST }}
      className="look-myakiba mk-item-wishlist"
    >
      {(s, _rect, layout) => {
        const compact = layout === "compact";
        const g = GEOMETRY[layout];
        return (
          <Window className={cls("window")} body={{ "data-crop": true }}>
            <div
              className={cls("app")}
              style={{ "--pad": `${g.pad}px`, "--pad-end": `${g.padEnd}px` } as CSSProperties}
            >
              <DatabasePage s={s} g={g} compact={compact} />
              <ItemPage s={s} g={g} compact={compact} />
              <Figure s={s} g={g} />
            </div>
          </Window>
        );
      }}
    </Stage>
  );
}
