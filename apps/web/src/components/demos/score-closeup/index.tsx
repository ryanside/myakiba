import type { ReactNode } from "react";
import { StarIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Bar, Popover, Roll, Stage, Window } from "@/components/stageshow/kit";
import type { Act, Point } from "@/components/stageshow/kit";
import type { DemoProps } from "../demo-props";
import "./score-closeup.css";

// A close-up of the collection table: the collector opens one figure's Score
// cell and rates it out of ten. The whole window is drawn at 1.4 times its
// size, chrome and all, running off the bottom, with the scored row whole.
//
// What the app does (popover-rating-cell.tsx and ui/rating.tsx): the cell is
// a ghost button showing an em dash while the score is zero. It opens a
// popover labeled Score with ten whole stars (no half steps), 4px apart, and
// the value beside them. Hovering a star previews it: every star up to it
// fills and the value reads that score. Each star's hit area reaches 2px past
// it, so the areas touch and the gaps between stars keep the star. A click saves that score at once and the cell shows
// it, but the popover stays open; nothing in it closes on change. The score
// can't be cleared from here (a click always sets 1 to 10), so the demo plays
// once and ends on the result.
//
// The Item cell is ItemTitleCell: the title over the MFC number and the
// category. The number is a quiet bar.
//
// Real strings: Item and Score over the columns, the figure's title and
// category, the popover's Score label, its value and the cell's value.

type S = {
  readonly open: boolean;
  /** The star under the pointer, which the rating previews, or null */
  readonly preview: number | null;
  readonly score: number;
};

const initial: S = { open: false, preview: null, score: 0 };
const poster: S = { open: true, preview: null, score: 9 };

const STARS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
const PICK = 9;

const cls = (name: string) => `mk-score-closeup-${name}`;

/** The rows around the scored one: a thumbnail and quiet bars. */
interface Filler {
  readonly src: string;
  /** Title, MFC number, category, scale, count, score and shop bar widths */
  readonly bars: readonly [number, number, number, number, number, number, number];
}

const ABOVE: Filler = { src: "/example-item5.webp", bars: [148, 56, 48, 24, 8, 22, 76] };
const BELOW: readonly Filler[] = [
  { src: "/example-item6.webp", bars: [168, 52, 40, 26, 8, 22, 64] },
  { src: "/example-item3.webp", bars: [104, 56, 36, 0, 8, 0, 64] },
  { src: "/example-item4.webp", bars: [136, 52, 44, 24, 8, 22, 84] },
];

/** A star's hit area reaches this far past it on every side (after:-inset-0.5). */
const HIT = 2;

/** The star the point is over, as the stars' own hover reports it. */
function starAt(p: Point, a: Act<S>): number | null {
  const scale = a.rect("star-1").width / 20;
  const reach = HIT * scale;
  for (const n of STARS) {
    const r = a.rect(`star-${n}`);
    if (
      p.x >= r.x - reach &&
      p.x < r.x + r.width + reach &&
      p.y >= r.y - reach &&
      p.y < r.y + r.height + reach
    ) {
      return n;
    }
  }
  return null;
}

async function script(a: Act<S>): Promise<void> {
  const track = (p: Point) => {
    a.put({ preview: starAt(p, a) });
  };
  // A level run along the stars, the way a hand sweeps a row
  const level = (e: number, from: Point, to: Point): Point => ({
    x: from.x + (to.x - from.x) * e,
    y: from.y + (to.y - from.y) * e,
  });

  await a.wait(1000);
  a.mark("open");
  await a.moveCursor({ at: "score", x: 0.3, y: 0.6 });
  await a.wait(140);
  await a.click({ at: "score", x: 0.3, y: 0.6 });
  a.put({ open: true });
  await a.wait(650);
  // Down into the popover, onto the first star
  await a.moveCursor({ at: "star-1", x: 0.5, y: 0.6 }, { duration: 560, onMove: track });
  await a.wait(220);
  a.mark("sweep");
  await a.moveCursor(
    { at: "star-10", x: 0.5, y: 0.6 },
    { duration: 1500, path: level, onMove: track },
  );
  await a.wait(320);
  await a.moveCursor({ at: `star-${PICK}`, x: 0.5, y: 0.6 }, { duration: 360, onMove: track });
  await a.wait(260);
  a.mark("score");
  await a.click({ at: `star-${PICK}`, x: 0.5, y: 0.6 });
  a.put({ score: PICK });
  await a.wait(500);
  // Off the stars and the cell, so both read
  await a.moveCursor("rest", { duration: 800, onMove: track });
  await a.wait(2600);
}

function Thumb({ src }: { readonly src: string }): ReactNode {
  return (
    <span className={cls("thumb")}>
      <img src={src} alt="" draggable={false} />
    </span>
  );
}

function Check(): ReactNode {
  return (
    <span className={cls("cell-check")}>
      <span className={cls("check")} />
    </span>
  );
}

function FillerRow({ row }: { readonly row: Filler }): ReactNode {
  const [title, mfc, category, scale, count, score, shop] = row.bars;
  return (
    <div className={cls("row")}>
      <Check />
      <span className={`${cls("cell")} ${cls("item")}`}>
        <Thumb src={row.src} />
        <span className={cls("lines")} data-filler>
          <span className={cls("title")}>
            <Bar w={title} h={7} r={3.5} tone={3} />
          </span>
          <span className={cls("sub")}>
            <Bar w={mfc} h={5} r={2.5} tone={2} />
            <Bar w={category} h={5} r={2.5} tone={2} />
          </span>
        </span>
      </span>
      <span className={`${cls("cell")} ${cls("col-scale")}`}>
        {scale ? <Bar w={scale} h={6} r={3} tone={2} /> : null}
      </span>
      <span className={`${cls("cell")} ${cls("num")} ${cls("col-count")}`}>
        <Bar w={count} h={6} r={3} tone={2} />
      </span>
      <span className={`${cls("cell")} ${cls("num")}`}>
        {score ? <Bar w={score} h={6} r={3} tone={2} /> : null}
      </span>
      <span className={`${cls("cell")} ${cls("col-shop")}`}>
        <Bar w={shop} h={6} r={3} tone={2} />
      </span>
    </div>
  );
}

/** The cell's value: the empty dash rolls up and out as the score rises in. */
function CellValue({ score }: { readonly score: number }): ReactNode {
  const scored = score > 0;
  return (
    <span className={cls("value")} data-scored={scored || undefined}>
      <span className={cls("dash")}>—</span>
      <span className={cls("number")}>{scored ? score.toFixed(1) : PICK.toFixed(1)}</span>
    </span>
  );
}

function Stars({ shown }: { readonly shown: number }): ReactNode {
  return (
    <span className={cls("stars")}>
      {STARS.map((n) => (
        <span key={n} className={cls("star")} data-target={`star-${n}`} data-cursor="hand">
          <HugeiconsIcon icon={StarIcon} size={20} className={cls("star-empty")} />
          <span className={cls("star-fill")} data-on={shown >= n || undefined}>
            <HugeiconsIcon icon={StarIcon} size={20} />
          </span>
        </span>
      ))}
    </span>
  );
}

export function ScoreCloseupDemo({ theme }: DemoProps): ReactNode {
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
      cursor={{ at: { wide: "rest", compact: "rest" }, style: "large" }}
      className="look-myakiba mk-score-closeup"
    >
      {(s) => {
        const shown = s.preview ?? s.score;
        return (
          <>
            <div className={cls("mask")}>
              <div className={cls("zoom")}>
                <Window className={cls("window")}>
                  <div className={cls("body")}>
                    <div className={`${cls("row")} ${cls("head")}`}>
                      <Check />
                      <span className={cls("cell")}>Item</span>
                      <span className={`${cls("cell")} ${cls("col-scale")}`}>
                        <Bar w={30} h={6} r={3} tone={2} />
                      </span>
                      <span className={`${cls("cell")} ${cls("num")} ${cls("col-count")}`}>
                        <Bar w={34} h={6} r={3} tone={2} />
                      </span>
                      <span className={`${cls("cell")} ${cls("num")}`}>Score</span>
                      <span className={`${cls("cell")} ${cls("col-shop")}`}>
                        <Bar w={30} h={6} r={3} tone={2} />
                      </span>
                    </div>

                    <FillerRow row={ABOVE} />

                    <div className={cls("row")} data-target="row">
                      <Check />
                      <span className={`${cls("cell")} ${cls("item")}`}>
                        <Thumb src="/example-item2.webp" />
                        <span className={cls("lines")}>
                          <span className={cls("title")}>Sora 1/4 Scale</span>
                          <span className={cls("sub")}>
                            <Bar w={56} h={5} r={2.5} tone={2} />
                            <span className={cls("category")}>Prepainted</span>
                          </span>
                        </span>
                      </span>
                      <span className={`${cls("cell")} ${cls("col-scale")}`}>
                        <Bar w={26} h={6} r={3} tone={2} />
                      </span>
                      <span className={`${cls("cell")} ${cls("num")} ${cls("col-count")}`}>
                        <Bar w={8} h={6} r={3} tone={2} />
                      </span>
                      <span className={`${cls("cell")} ${cls("num")}`}>
                        <span
                          className={cls("trigger")}
                          data-target="score"
                          data-open={s.open || undefined}
                        >
                          <CellValue score={s.score} />
                        </span>
                      </span>
                      <span className={`${cls("cell")} ${cls("col-shop")}`}>
                        <Bar w={88} h={6} r={3} tone={2} />
                      </span>
                    </div>

                    {BELOW.map((row) => (
                      <FillerRow key={row.src} row={row} />
                    ))}
                  </div>
                </Window>
              </div>
            </div>

            <div className={`${cls("zoom")} ${cls("over")}`}>
              <Popover show={s.open} origin="top" className={cls("popover")}>
                <span className={cls("label")}>Score</span>
                <span className={cls("rating")}>
                  <Stars shown={shown} />
                  <span className={cls("preview")}>
                    <Roll align="start" stagger={20}>
                      {shown.toFixed(1)}
                    </Roll>
                  </span>
                </span>
              </Popover>
              <span className={cls("rest")} data-target="rest" aria-hidden />
            </div>
          </>
        );
      }}
    </Stage>
  );
}
