import type { CSSProperties, ReactNode } from "react";
import {
  Add01Icon,
  DragDropVerticalIcon,
  FilterIcon,
  GridViewIcon,
  Image01Icon,
  LeftToRightListDashIcon,
  Menu01Icon,
  MoreHorizontalIcon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Bar, Stage, Text, Window } from "@/components/stageshow/kit";
import type { Act, Layout } from "@/components/stageshow/kit";
import { UnsortedIcon } from "@/lib/icons";
import type { DemoProps } from "../demo-props";
import "./collection-layouts.css";

// Collection, the view toggle: Compact to Gallery and back. Each figure keeps
// its identity across the switch: its row thumbnail grows into its gallery
// tile on a short stagger while the rows' words fade, and on the way back
// every tile flies home to its own row. Nothing cross-fades between two
// layouts: there is one image per figure the whole time.
//
// The Item cell is ItemTitleCell: the title over the MFC number and the
// category, both quiet bars here.
//
// Real strings: the page title, the Item column, four item titles and Add.
// Every other cell is a quiet bar.

type State = { gallery: boolean };

const initial: State = { gallery: false };
const poster: State = { gallery: true };

interface Figure {
  readonly src: string;
  /** Where a square crop sits on a tall photo: the top, or lower down */
  readonly crop?: "low";
  readonly title?: string;
  /** Bar widths for the quiet cells: title (when it has no words), category, price, shop, collected */
  readonly bars: readonly [number, number, number, number, number];
}

// The same figures carry the same names across the page's demos. The last
// is a second listing of the first figure, its photo cropped lower, far from
// it in the gallery's corner.
const FIGURES: readonly Figure[] = [
  { src: "/example-item5.webp", title: "Akari Labcoat 1/7 Scale", bars: [0, 46, 52, 96, 60] },
  { src: "/example-item2.webp", title: "Sora 1/4 Scale", bars: [0, 46, 48, 78, 64] },
  { src: "/example-item6.webp", title: "Luna Starling 1/8 Scale", bars: [0, 46, 50, 104, 58] },
  { src: "/example-item3.webp", title: "Momo Plush", bars: [0, 34, 40, 84, 62] },
  { src: "/example-item4.webp", bars: [148, 46, 46, 92, 60] },
  { src: "/example-item7.webp", bars: [120, 52, 38, 70, 64] },
  { src: "/example-item1.webp", bars: [164, 40, 50, 88, 58] },
  { src: "/example-item5.webp", crop: "low", bars: [132, 46, 44, 98, 62] },
];

interface Geometry {
  /** Header and row heights of the compact table */
  readonly head: number;
  readonly row: number;
  /** The thumbnail's left edge inside the content column */
  readonly thumbX: number;
  readonly thumb: number;
  /** The gallery: columns, tile size and gap */
  readonly cols: number;
  readonly tile: number;
  readonly gap: number;
}

const GEOMETRY = {
  wide: { head: 32, row: 52, thumbX: 48, thumb: 32, cols: 4, tile: 210, gap: 8 },
  compact: { head: 32, row: 52, thumbX: 8, thumb: 32, cols: 2, tile: 151, gap: 8 },
} satisfies Record<Layout, Geometry>;

interface Box {
  readonly left: number;
  readonly top: number;
  readonly size: number;
}

function thumbBox(g: Geometry, i: number): Box {
  return { left: g.thumbX, top: g.head + i * g.row + (g.row - g.thumb) / 2, size: g.thumb };
}

function tileBox(g: Geometry, i: number): Box {
  const pitch = g.tile + g.gap;
  return { left: (i % g.cols) * pitch, top: Math.floor(i / g.cols) * pitch, size: g.tile };
}

// Where the pointer waits: the toolbar's empty run beside the view toggle,
// clear of the highlight it is about to move.
const REST = { wide: { x: 600, y: 100 }, compact: { x: 152, y: 86 } } as const;
const AIM = { x: 0.7, y: 0.74 } as const;

async function script(a: Act<State>): Promise<void> {
  await a.wait(1100);
  a.mark("aim");
  await a.move({ at: "view-gallery", ...AIM });
  await a.wait(160);
  a.mark("press");
  await a.click({ at: "view-gallery", ...AIM });
  a.mark("gallery");
  await a.set({ gallery: true });
  await a.wait(500);
  // Off the toggle while the figures settle into their tiles
  await a.move(REST[a.layout], { duration: 750 });
  await a.wait(2300);
  a.mark("back");
  await a.click({ at: "view-compact", ...AIM });
  a.mark("compact");
  await a.set({ gallery: false });
  await a.wait(500);
  await a.move(REST[a.layout], { duration: 750 });
  await a.wait(2000);
}

const MODES = [
  { mode: "compact", icon: LeftToRightListDashIcon },
  { mode: "table", icon: Menu01Icon },
  { mode: "grid", icon: GridViewIcon },
  { mode: "gallery", icon: Image01Icon },
] as const;

function ViewToggle({ gallery }: { readonly gallery: boolean }): ReactNode {
  return (
    <div className="mk-collection-layouts-toggle" data-value={gallery ? "gallery" : "compact"}>
      <span className="mk-collection-layouts-toggle-thumb" aria-hidden />
      {MODES.map(({ mode, icon }) => (
        <span
          key={mode}
          className="mk-collection-layouts-toggle-item"
          data-target={mode === "compact" || mode === "gallery" ? `view-${mode}` : undefined}
          data-on={(gallery ? mode === "gallery" : mode === "compact") || undefined}
        >
          <HugeiconsIcon icon={icon} size={16} strokeWidth={2} />
        </span>
      ))}
    </div>
  );
}

function Toolbar({
  gallery,
  compact,
}: {
  readonly gallery: boolean;
  readonly compact: boolean;
}): ReactNode {
  return (
    <div className="mk-collection-layouts-toolbar">
      <div className="mk-collection-layouts-title">Collection</div>
      {compact ? null : (
        <>
          <span className="mk-collection-layouts-search">
            <HugeiconsIcon icon={Search01Icon} size={16} />
            <Bar w={64} h={6} r={3} tone={2} />
          </span>
          <span className="mk-collection-layouts-button">
            <HugeiconsIcon icon={FilterIcon} size={16} />
          </span>
          <span className="mk-collection-layouts-button">
            <HugeiconsIcon icon={UnsortedIcon} size={16} />
          </span>
          {/* Columns is a table control: the app drops it in Gallery */}
          <span className="mk-collection-layouts-button" data-gone={gallery || undefined}>
            <HugeiconsIcon icon={DragDropVerticalIcon} size={16} />
          </span>
        </>
      )}
      <span className="mk-collection-layouts-spacer" />
      <ViewToggle gallery={gallery} />
      {compact ? null : (
        <span className="mk-collection-layouts-add">
          <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={2} />
          Add
        </span>
      )}
    </div>
  );
}

function Rows({ compact }: { readonly compact: boolean }): ReactNode {
  return (
    <div className="mk-collection-layouts-table">
      <div className="mk-collection-layouts-row mk-collection-layouts-head">
        {compact ? null : <span className="mk-collection-layouts-check" />}
        <span className="mk-collection-layouts-item-head">Item</span>
        <Bar w={30} h={6} r={3} tone={2} className="mk-collection-layouts-end" />
        {compact ? null : (
          <>
            <Bar w={30} h={6} r={3} tone={2} />
            <Bar w={58} h={6} r={3} tone={2} />
            <span />
          </>
        )}
      </div>
      {FIGURES.map((figure, i) => {
        const [title, category, price, shop, collected] = figure.bars;
        return (
          <div key={`${figure.src}-${i}`} className="mk-collection-layouts-row">
            {compact ? null : <span className="mk-collection-layouts-check" />}
            <span className="mk-collection-layouts-item">
              <span className="mk-collection-layouts-item-title">
                {figure.title ? (
                  <Text>{figure.title}</Text>
                ) : (
                  <Bar w={compact ? Math.round(title * 0.7) : title} h={7} r={3.5} tone={3} />
                )}
              </span>
              <span className="mk-collection-layouts-item-sub">
                <Bar w={56} h={5} r={2.5} tone={2} />
                <Bar w={category} h={5} r={2.5} tone={2} />
              </span>
            </span>
            <Bar w={price} h={6} r={3} tone={2} className="mk-collection-layouts-end" />
            {compact ? null : (
              <>
                <Bar w={shop} h={6} r={3} tone={2} />
                <Bar w={collected} h={6} r={3} tone={2} />
                <span className="mk-collection-layouts-more">
                  <HugeiconsIcon icon={MoreHorizontalIcon} size={16} />
                </span>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** One element per figure, laid over the table and the gallery: in Compact it
 * sits on its row's thumbnail slot, in Gallery on its tile, and it travels
 * between the two, so the figure never stops being itself. */
function Figures({ gallery, layout }: { readonly gallery: boolean; readonly layout: Layout }) {
  const g = GEOMETRY[layout];
  return (
    <div className="mk-collection-layouts-figures" aria-hidden>
      {FIGURES.map((figure, i) => {
        const box = gallery ? tileBox(g, i) : thumbBox(g, i);
        return (
          <span
            key={`${figure.src}-${i}`}
            className="mk-collection-layouts-figure"
            data-tile={gallery || undefined}
            style={
              {
                "--i": i,
                left: box.left,
                top: box.top,
                width: box.size,
                height: box.size,
              } as CSSProperties
            }
          >
            <img src={figure.src} alt="" draggable={false} data-crop={figure.crop} />
          </span>
        );
      })}
    </div>
  );
}

export function CollectionLayoutsDemo({ theme }: DemoProps): ReactNode {
  return (
    <Stage<State>
      width={960}
      height={440}
      compact={{ below: 560, width: 358, height: 400 }}
      initial={initial}
      poster={poster}
      script={script}
      play="loop"
      theme={theme}
      cursor={{ at: REST }}
      className="look-myakiba mk-collection-layouts"
    >
      {(state, _rect, layout) => {
        const compact = layout === "compact";
        return (
          <div className="mk-collection-layouts-mask">
            <Window className="mk-collection-layouts-window" body={{ "data-crop": true }}>
              <div className="mk-collection-layouts-body">
                <Toolbar gallery={state.gallery} compact={compact} />
                <div
                  className="mk-collection-layouts-content"
                  data-gallery={state.gallery || undefined}
                >
                  <Rows compact={compact} />
                  <Figures gallery={state.gallery} layout={layout} />
                </div>
              </div>
            </Window>
          </div>
        );
      }}
    </Stage>
  );
}
