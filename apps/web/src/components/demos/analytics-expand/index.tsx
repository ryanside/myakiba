import { Fragment } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Bar, Collapse, Row, Stage, Text, Window } from "@/components/stageshow/kit";
import type { Act, Layout } from "@/components/stageshow/kit";
import { ExpandIcon, SortDescendingIcon, UnsortedIcon } from "@/lib/icons";
import type { DemoProps } from "../demo-props";
import "./analytics-expand.css";

// Analytics, Artists: one artist's row opens in place. The rows below are
// carried down by the opening space, the owned figures resolve from their
// skeleton tiles in a stagger, and a beat later the Characters relationships
// resolve top to bottom. The pointer closes it again, the cause of the reset.
//
// Real strings: the section title, the column headers, the ranked rows (the
// subject), "Items for", the Characters tab and its character rows. The
// other relationship tabs and the rows past the fifth are filler.

type State = { open: boolean; panel: boolean; items: boolean; related: boolean };

const initial: State = { open: false, panel: false, items: false, related: false };
const poster: State = { open: true, panel: true, items: true, related: true };

interface Artist {
  readonly name: string;
  readonly count: number;
  readonly spent: string;
}

// Analytics Spend counts a figure's full price under every artist on it, so
// these totals never add up and nothing here sums them.
const ARTISTS: readonly Artist[] = [
  { name: "Kaname Oyu", count: 14, spent: "$2,486.00" },
  { name: "Tsubaki Reno", count: 11, spent: "$1,932.50" },
  { name: "Haru Mizuchi", count: 9, spent: "$1,610.00" },
  { name: "Ion Sakuraba", count: 7, spent: "$1,148.00" },
  { name: "Wren Kotobuki", count: 6, spent: "$972.00" },
];
const FILLER_ROWS: readonly (readonly [number, number, number])[] = [
  [92, 12, 52],
  [74, 12, 48],
  [86, 10, 52],
];

const FIGURES = [
  "/example-item5.webp",
  "/example-item2.webp",
  "/example-item6.webp",
  "/example-item4.webp",
  "/example-item7.webp",
  "/example-item3.webp",
] as const;

interface Character {
  readonly name: string;
  readonly count: number;
  readonly previews: readonly string[];
}

const CHARACTERS: readonly Character[] = [
  {
    name: "Rin Aokaze",
    count: 6,
    previews: ["/example-item2.webp", "/example-item4.webp", "/example-item7.webp"],
  },
  { name: "Suzu Hanabishi", count: 4, previews: ["/example-item5.webp", "/example-item6.webp"] },
  { name: "Mio Tsukishiro", count: 3, previews: ["/example-item3.webp", "/example-item4.webp"] },
];

// Where the pointer rests between loops: empty row surface, near the chevron.
const REST = { wide: { x: 260, y: 212 }, compact: { x: 220, y: 160 } } as const;
// Where it waits while the opened row is read: the blank end of "Items for".
const READ = { wide: { x: 440, y: 199 }, compact: { x: 250, y: 150 } } as const;

// The figures land a beat after the row opens, the relationships a beat
// after them, the way the two reads come back in the app.
async function script(a: Act<State>): Promise<void> {
  await a.wait(500);
  await a.move({ at: "expand", x: 0.72, y: 0.7 });
  await a.wait(180);
  a.mark("press");
  await a.click({ at: "expand", x: 0.72, y: 0.7 });
  a.mark("open");
  a.put({ open: true, panel: true });
  await a.wait(520);
  a.mark("items");
  a.put({ items: true });
  await a.wait(1100);
  a.mark("related");
  a.put({ related: true });
  await a.wait(1100);
  // Off the chevron while the result is read, onto the opened row's blank
  // header line, near where it goes back to close it.
  await a.move(READ[a.layout], { duration: 800 });
  await a.wait(2300);
  a.mark("close");
  await a.click({ at: "expand", x: 0.72, y: 0.7 });
  a.put({ open: false });
  await a.wait(700);
  // Under the closed row: the next opening loads again from its skeleton.
  await a.snap({ panel: false, items: false, related: false });
  await a.move(REST[a.layout], { duration: 600 });
  await a.wait(300);
}

function Chevron({ open }: { readonly open: boolean }): ReactNode {
  return (
    <span className="mk-analytics-expand-toggle" data-target="expand">
      <span className="mk-analytics-expand-chevron" data-open={open || undefined}>
        <HugeiconsIcon icon={ExpandIcon} size={16} />
      </span>
    </span>
  );
}

function Header({ compact }: { readonly compact: boolean }): ReactNode {
  return (
    <div className="mk-analytics-expand-row mk-analytics-expand-head">
      <span />
      <span>#</span>
      <span className="mk-analytics-expand-sort">
        name
        <HugeiconsIcon icon={UnsortedIcon} size={14} strokeWidth={2} />
      </span>
      <span className="mk-analytics-expand-sort" data-on="">
        count
        <HugeiconsIcon icon={SortDescendingIcon} size={14} strokeWidth={2} />
      </span>
      {compact ? null : (
        <span className="mk-analytics-expand-sort">
          spent
          <HugeiconsIcon icon={UnsortedIcon} size={14} strokeWidth={2} />
        </span>
      )}
    </div>
  );
}

function Thumb({
  src,
  index,
  shown,
}: {
  readonly src: string;
  readonly index: number;
  readonly shown: boolean;
}): ReactNode {
  return (
    <span className="mk-analytics-expand-thumb" style={{ "--i": index } as CSSProperties}>
      <img src={src} alt="" data-shown={shown || undefined} />
    </span>
  );
}

function CharacterRow({
  character,
  index,
  shown,
  label,
}: {
  readonly character: Character;
  readonly index: number;
  readonly shown: boolean;
  readonly label: string;
}): ReactNode {
  return (
    <li
      className="mk-analytics-expand-rel"
      style={{ "--i": index } as CSSProperties}
      data-shown={shown || undefined}
    >
      <div className="mk-analytics-expand-rel-skeleton" aria-hidden>
        <span className="mk-analytics-expand-rel-lines">
          <Bar w={96} h={8} r={4} tone={2} />
          <Bar w={48} h={6} r={3} tone={2} />
        </span>
        <span className="mk-analytics-expand-previews">
          {[0, 1].map((n) => (
            <span
              key={n}
              className="mk-analytics-expand-preview mk-analytics-expand-preview-empty"
            />
          ))}
        </span>
      </div>
      <Row
        pad={0}
        className="mk-analytics-expand-rel-row"
        title={<Text className="mk-analytics-expand-rel-name">{character.name}</Text>}
        subtitle={
          <Text className="mk-analytics-expand-rel-count">{`${label}${character.count} items`}</Text>
        }
      >
        <span className="mk-analytics-expand-previews">
          {character.previews.map((src) => (
            <span key={src} className="mk-analytics-expand-preview">
              <img src={src} alt="" />
            </span>
          ))}
        </span>
      </Row>
    </li>
  );
}

function Expanded({
  state,
  layout,
}: {
  readonly state: State;
  readonly layout: Layout;
}): ReactNode {
  const compact = layout === "compact";
  const figures = compact ? FIGURES.slice(0, 5) : FIGURES;
  const characters = compact ? CHARACTERS.slice(0, 1) : CHARACTERS;
  return (
    <div className="mk-analytics-expand-panel">
      <div className="mk-analytics-expand-for">
        <span>Items for </span>
        <b>Kaname Oyu</b>
      </div>
      <div className="mk-analytics-expand-panel-body">
        <div className="mk-analytics-expand-thumbs">
          {figures.map((src, i) => (
            <Thumb key={src} src={src} index={i} shown={state.items} />
          ))}
        </div>
        <div className="mk-analytics-expand-related">
          {compact ? null : (
            <div className="mk-analytics-expand-tabs">
              <Bar w={72} h={6} tone={2} />
              <Bar w={40} h={6} tone={2} />
              <span className="mk-analytics-expand-tab">Characters</span>
              <Bar w={58} h={6} tone={2} />
              <Bar w={44} h={6} tone={2} />
            </div>
          )}
          <ul className="mk-analytics-expand-rels">
            {characters.map((character, i) => (
              <CharacterRow
                key={character.name}
                character={character}
                index={i}
                shown={state.related}
                label={compact ? "Character · " : ""}
              />
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Table({ state, layout }: { readonly state: State; readonly layout: Layout }): ReactNode {
  const compact = layout === "compact";
  return (
    <div className="mk-analytics-expand-table">
      <Header compact={compact} />
      {ARTISTS.map((artist, i) => (
        <Fragment key={artist.name}>
          <div
            className="mk-analytics-expand-row"
            data-target={i === 0 ? "row" : undefined}
            data-open={(i === 0 && state.open) || undefined}
          >
            {i === 0 ? <Chevron open={state.open} /> : <ChevronQuiet />}
            <span className="mk-analytics-expand-rank">{i + 1}</span>
            <span className="mk-analytics-expand-name">{artist.name}</span>
            <span className="mk-analytics-expand-num">{artist.count}</span>
            {compact ? null : <span className="mk-analytics-expand-num">{artist.spent}</span>}
          </div>
          {i === 0 ? (
            <Collapse open={state.open}>
              {state.panel ? <Expanded state={state} layout={layout} /> : <span />}
            </Collapse>
          ) : null}
        </Fragment>
      ))}
      {FILLER_ROWS.map(([name, count, spent], i) => (
        <div key={name} className="mk-analytics-expand-row" aria-hidden>
          <ChevronQuiet />
          <span className="mk-analytics-expand-rank">{ARTISTS.length + i + 1}</span>
          <Bar w={name} h={6} tone={2} />
          <Bar w={count} h={6} tone={2} />
          {compact ? null : <Bar w={spent} h={6} tone={2} />}
        </div>
      ))}
    </div>
  );
}

function ChevronQuiet(): ReactNode {
  return (
    <span className="mk-analytics-expand-toggle" aria-hidden>
      <span className="mk-analytics-expand-chevron">
        <HugeiconsIcon icon={ExpandIcon} size={16} />
      </span>
    </span>
  );
}

export function AnalyticsExpandDemo({ theme }: DemoProps): ReactNode {
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
      className="look-myakiba mk-analytics-expand"
    >
      {(state, _rect, layout) => (
        <div className="mk-analytics-expand-mask">
          <Window
            className="mk-analytics-expand-window"
            title={layout === "compact" ? "Artists" : undefined}
            body={{ "data-crop": true }}
          >
            <div className="mk-analytics-expand-content">
              {layout === "compact" ? null : (
                <div className="mk-analytics-expand-title">
                  <span>All artists</span>
                  <span className="mk-analytics-expand-search">
                    <HugeiconsIcon icon={Search01Icon} size={14} />
                    <Bar w={92} h={6} tone={2} />
                  </span>
                </div>
              )}
              <Table state={state} layout={layout} />
            </div>
          </Window>
        </div>
      )}
    </Stage>
  );
}
