import type { ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import {
  Add01Icon,
  Cancel01Icon,
  DatabaseIcon,
  FilterIcon,
  Folder01Icon,
  GridViewIcon,
  Image01Icon,
  LeftToRightListDashIcon,
  LibraryIcon,
  Loading03Icon,
  Menu01Icon,
  PackageAddIcon,
  PackageIcon,
  PanelLeftIcon,
  Search01Icon,
  SearchIcon,
  StarIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { Bar, Popover, Roll, Stage, Window } from "@/components/stageshow/kit";
import type { Act, Layout, Point, Rect } from "@/components/stageshow/kit";
import { DisclosureIcon, ExpandIcon, ExternalIcon } from "@/lib/icons";
import type { DemoProps } from "../demo-props";
import "./pick-to-add.css";

// One figure from someone else's catalog into the collection, in one browser.
//
// On a MyFigureCollection item page the extension's toggle sits last in the
// page's action bar. The pointer clicks "Pick for myakiba": the toggle shows
// "Working…" while it reads the page, then "✓ Picked", and the extension's
// note rises in the corner: "1 picked · Review in myakiba". The pointer
// follows that link to myakiba's Add page ("Review your picks"). The pick
// arrives as a row that is still saving, then turns into the Item. The
// destination sentence reads "Add 1 item to [choose where]": the pointer
// opens the choice and takes Collection, and the commit, which said "Choose
// where these go", now says "Add 1 to collection". It clicks it: a spinner,
// a check, the row leaves, the page empties to its own hint, and the toast
// says "Added 1 to your collection" with the figure and View. The pointer
// comes to rest on the toast, which holds it open, as a hover does in the
// app. It plays once and holds there.
//
// Truth from apps/extension/lib/mfc-page/ui.ts (labels, note, link),
// item-page.ts (the toggle goes last in the action bar), and the Add page in
// components/add (add-page, destination-sentence, commit-input's plan
// labels, commit-button, commit-toast, add-table, pick-status, empty-state,
// sentence-fit's narrow faces).
//
// Real strings: the figure's title, the toggle, the note, the page title and
// its count, the sentence and its choices, the row, the commit and the toast.
// The other site's chrome and specs are bars.

type Page = "mfc" | "add" | "collection";
type Pick = "idle" | "busy" | "picked";
type Row = "saving" | "item";
type Commit = "idle" | "loading" | "success";

type S = {
  readonly page: Page;
  readonly pick: Pick;
  /** The extension's corner note on the item page */
  readonly note: boolean;
  readonly row: Row;
  readonly menu: boolean;
  readonly collection: boolean;
  readonly commit: Commit;
  /** The commit answered: the row is gone and the form reset, as clearCommitted does */
  readonly committed: boolean;
  readonly toast: boolean;
};

const initial: S = {
  page: "mfc",
  pick: "idle",
  note: false,
  row: "saving",
  menu: false,
  collection: false,
  commit: "idle",
  committed: false,
  toast: false,
};

const poster: S = {
  ...initial,
  page: "collection",
  pick: "picked",
  note: true,
  row: "item",
  committed: true,
};

const cls = (name: string) => `mk-pick-to-add-${name}`;

const FIGURE = "/example-item4.webp";
const TITLE = "Suiren: Plum Moon Ver. 1/7";
const MFC_ID = "1784203";
const MFC_URL = `myfigurecollection.net/item/${MFC_ID}`;
const ADD_URL = "myakiba.app/add?from=mfc";
const COLLECTION_URL =
  "myakiba.app/collection?ids=%5B%227f3c2a9e-41d8-4b6e-9c1a-2d5e8f0b6a13%22%5D";
const URLS = { mfc: MFC_URL, add: ADD_URL, collection: COLLECTION_URL } satisfies Record<
  Page,
  string
>;

// Where the pointer waits before its first move, and where it comes to rest
const REST = { wide: { x: 812, y: 300 }, compact: { x: 250, y: 214 } };
// Where it settles on the collection: on the new row, the one place it rests,
// past the title's words and short of the next column, so the row shows its hover
const SETTLE = {
  wide: { at: "new-row", x: 0.5, y: 0.5 },
  compact: { at: "new-row", x: 0.93, y: 0.76 },
};

async function script(a: Act<S>): Promise<void> {
  await a.wait(600);
  a.mark("pick");
  // Low in the button, under its label
  await a.click({ at: "pick", x: 0.8, y: 0.78 });
  await a.set({ pick: "busy" });
  // The page and its picture are read before the pick is kept
  await a.wait(750);
  a.mark("picked");
  await a.set({ pick: "picked", note: true });
  await a.wait(1100);
  a.mark("review");
  await a.click({ at: "review", x: 0.55, y: 0.75 });
  await a.set({ page: "add" });
  // The Add page saves the pick, then shows its Item; the pointer comes up
  // toward the sentence meanwhile, onto the clear space beside the title
  await a.wait(250);
  await a.moveCursor({ at: "choose", x: 1.6, y: -0.4 }, { duration: 650 });
  a.mark("saved");
  await a.set({ row: "item" });
  await a.wait(700);
  a.mark("choose");
  await a.click({ at: "choose", x: 0.9, y: 0.7 });
  await a.set({ menu: true });
  await a.wait(350);
  await a.moveCursor({ at: "collection", x: 0.82, y: 0.55 });
  await a.wait(180);
  await a.click();
  await a.set({ menu: false, collection: true });
  await a.wait(800);
  a.mark("commit");
  await a.click({ at: "commit", x: 0.9, y: 0.78 });
  await a.set({ commit: "loading" });
  await a.wait(700);
  a.mark("committed");
  await a.set({ commit: "success", committed: true, collection: false, toast: true });
  // The check holds 900ms, then the button settles on what it can do now
  await a.wait(900);
  await a.set({ commit: "idle" });
  await a.wait(500);
  a.mark("view");
  // View closes the toast and opens the collection, filtered to what was just added
  await a.click({ at: "view", x: 0.82, y: 0.78 });
  await a.set({ toast: false });
  // The toast is on its way out as the collection comes in
  await a.wait(160);
  await a.set({ page: "collection" });
  await a.wait(500);
  await a.moveCursor(SETTLE[a.layout], { duration: 700 });
  a.mark("hold");
  await a.wait(2400);
}

function Icon({
  icon,
  size = 16,
  stroke = 1.5,
}: {
  readonly icon: IconSvgElement;
  readonly size?: number;
  readonly stroke?: number;
}) {
  return <HugeiconsIcon icon={icon} size={size} strokeWidth={stroke} />;
}

/* ---------------------------------------------------------------------------
   The other site: a neutral catalog page, its chrome in bars
--------------------------------------------------------------------------- */

const NEIGHBORS = [44, 52, 38];
const SPECS = [
  [58, 132],
  [72, 104],
  [50, 156],
  [64, 92],
] as const;

function PickToggle({ pick }: { readonly pick: Pick }) {
  return (
    <span
      className={cls("toggle")}
      data-target="pick"
      data-state={pick}
      aria-pressed={pick === "picked"}
    >
      <span className={cls("toggle-label")} data-on={pick === "idle" || undefined}>
        Pick for myakiba
      </span>
      <span className={cls("toggle-label")} data-on={pick === "busy" || undefined}>
        Working…
      </span>
      <span className={cls("toggle-label")} data-on={pick === "picked" || undefined}>
        ✓ Picked
      </span>
    </span>
  );
}

function CatalogPage({ s, compact }: { readonly s: S; readonly compact: boolean }) {
  return (
    <div className={cls("page")} data-show={s.page === "mfc" || undefined}>
      <div className={cls("site-head")}>
        <Bar w={compact ? 52 : 64} h={8} r={4} tone={3} />
        {compact ? null : (
          <span className={cls("site-nav")}>
            <Bar w={44} h={6} r={3} tone={2} />
            <Bar w={56} h={6} r={3} tone={2} />
            <Bar w={40} h={6} r={3} tone={2} />
          </span>
        )}
        <span className={cls("site-search")}>
          <Bar w={compact ? 40 : 96} h={6} r={3} tone={2} />
        </span>
      </div>
      <div className={cls("item")}>
        <span className={cls("item-image")}>
          <img src={FIGURE} alt="" draggable={false} />
        </span>
        <div className={cls("item-main")}>
          <span className={cls("crumbs")}>
            <Bar w={36} h={6} r={3} tone={2} />
            <Bar w={52} h={6} r={3} tone={2} />
          </span>
          <span className={cls("item-title")}>{TITLE}</span>
          <span className={cls("maker")}>
            <Bar w={compact ? 72 : 112} h={7} r={3.5} tone={2} />
          </span>
          {compact ? null : (
            <>
              <Actions s={s} compact={false} />
              <span className={cls("specs")}>
                {SPECS.map(([label, value]) => (
                  <span key={label} className={cls("spec")}>
                    <Bar w={label} h={6} r={3} tone={2} />
                    <Bar w={value} h={6} r={3} tone={3} />
                  </span>
                ))}
              </span>
            </>
          )}
        </div>
        {compact ? null : <Related />}
      </div>
      {/* A narrow page puts the actions under the picture, where the note leaves room */}
      {compact ? <Actions s={s} compact /> : null}
      {/* The extension's note, fixed to the page's foot corner, in its own dark surface */}
      <p className={cls("note")} data-show={s.note || undefined} role="status">
        1 picked ·{" "}
        <span className={cls("note-link")} data-target="review" data-cursor="hand">
          Review in myakiba
        </span>
      </p>
    </div>
  );
}

// The site's own column of related items: other figures, their words as bars
const RELATED = [
  { n: 6, title: 96, meta: 58 },
  { n: 3, title: 74, meta: 66 },
  { n: 7, title: 88, meta: 48 },
] as const;

function Related() {
  return (
    <div className={cls("related")}>
      <Bar w={72} h={7} r={3.5} tone={3} />
      {RELATED.map((r) => (
        <span key={r.n} className={cls("related-row")}>
          <span className={cls("related-thumb")}>
            <img src={`/example-item${r.n}.webp`} alt="" draggable={false} />
          </span>
          <span className={cls("related-text")}>
            <Bar w={r.title} h={6} r={3} tone={3} />
            <Bar w={r.meta} h={6} r={3} tone={2} />
          </span>
        </span>
      ))}
    </div>
  );
}

function Actions({ s, compact }: { readonly s: S; readonly compact: boolean }) {
  return (
    <span className={cls("actions")}>
      {NEIGHBORS.slice(0, compact ? 1 : 3).map((w) => (
        <span key={w} className={cls("action")}>
          <Bar w={w} h={6} r={3} tone={3} />
        </span>
      ))}
      <PickToggle pick={s.pick} />
    </span>
  );
}

/* ---------------------------------------------------------------------------
   myakiba: the app's header, then the Add page
--------------------------------------------------------------------------- */

function AppHeader() {
  return (
    <div className={cls("app-head")}>
      <span className={cls("head-group")}>
        <span className={cls("iconbtn")}>
          <Icon icon={PanelLeftIcon} />
        </span>
        <span className={cls("iconbtn")} data-wide>
          <Icon icon={SearchIcon} />
        </span>
      </span>
      <span className={cls("head-group")}>
        <span className={cls("plus")}>
          <Icon icon={Add01Icon} stroke={2} />
        </span>
        <Bar w={32} h={32} r={16} tone={2} />
      </span>
    </div>
  );
}

function Check({ on, dim }: { readonly on: boolean; readonly dim?: boolean }) {
  return (
    <span className={cls("check")} data-on={on || undefined} data-dim={dim || undefined}>
      <HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={2} />
    </span>
  );
}

type Choice = { readonly label: string; readonly icon: IconSvgElement; readonly target?: string };

const CHOICES: readonly (Choice | "sep")[] = [
  { label: "Collection", icon: LibraryIcon, target: "collection" },
  "sep",
  { label: "New Order", icon: PackageAddIcon },
  { label: "Existing Order", icon: PackageIcon },
  "sep",
  { label: "Item Database", icon: DatabaseIcon },
];

/** The select's popup, under its trigger and start-aligned, laid over the page */
function ChoiceMenu({ s, at }: { readonly s: S; readonly at: Point }) {
  return (
    <Popover
      show={s.menu}
      origin="top left"
      className={cls("menu")}
      style={{ left: at.x, top: at.y }}
    >
      {CHOICES.map((choice, i) =>
        choice === "sep" ? (
          <span key={`sep-${i}`} className={cls("menu-sep")} />
        ) : (
          <span key={choice.label} className={cls("menu-item")} data-target={choice.target}>
            <Icon icon={choice.icon} />
            {choice.label}
          </span>
        ),
      )}
    </Popover>
  );
}

/** What the commit says, from commitPlan: blocked until a choice, then what it will do */
function commitLabel(s: S): string {
  if (s.committed) return "Select items to add";
  return s.collection ? "Add 1 to collection" : "Choose where these go";
}

function CommitButton({ s, compact }: { readonly s: S; readonly compact: boolean }) {
  const busy = s.commit !== "idle";
  const blocked = s.committed || !s.collection;
  return (
    <span
      className={cls("commit")}
      data-target="commit"
      data-blocked={(blocked && !busy) || undefined}
      data-busy={busy || undefined}
    >
      <span className={cls("commit-label")}>
        <Roll variant="fade">{compact ? "Add" : commitLabel(s)}</Roll>
      </span>
      <span className={cls("commit-icon")} data-on={s.commit === "loading" || undefined}>
        <span className={cls("spin")}>
          <Icon icon={Loading03Icon} />
        </span>
      </span>
      <span className={cls("commit-icon")} data-on={s.commit === "success" || undefined}>
        <Icon icon={Tick02Icon} stroke={2} />
      </span>
    </span>
  );
}

function Sentence({ s, compact }: { readonly s: S; readonly compact: boolean }) {
  const disabled = s.committed;
  const chosen = s.collection;
  return (
    <section
      className={cls("sentence")}
      aria-label="Destination"
      data-disabled={disabled || undefined}
    >
      {compact ? null : (
        <span className={cls("lead")}>
          <Swap texts={["Add 1 item to", "Add items to"]} on={disabled ? 1 : 0} />
        </span>
      )}
      <span
        className={cls("choose")}
        data-target="choose"
        data-cue={(!chosen && !disabled) || undefined}
        data-open={s.menu || undefined}
      >
        {compact ? null : (
          <span className={cls("choose-icon")} data-on={chosen || undefined}>
            <Icon icon={LibraryIcon} />
          </span>
        )}
        <span className={cls("choose-label")}>
          <Roll variant="fade">{chosen ? "Collection" : "choose where"}</Roll>
        </span>
        <span className={cls("chevron")}>
          <Icon icon={DisclosureIcon} stroke={2} />
        </span>
      </span>
      {compact ? (
        <span className={cls("folded")}>
          <Icon icon={StarIcon} stroke={2} />
          <Icon icon={Folder01Icon} stroke={2} />
        </span>
      ) : (
        <>
          <span className={cls("quiet")}>also on</span>
          <span className={cls("wishlist")}>
            <Check on={false} />
            <span className={cls("star")}>
              <Icon icon={StarIcon} stroke={2} />
            </span>
            Wishlist
          </span>
          <span className={cls("quiet")}>and</span>
          <span className={cls("lists")}>
            Lists
            <span className={cls("chevron")}>
              <Icon icon={DisclosureIcon} stroke={2} />
            </span>
          </span>
        </>
      )}
      <CommitButton s={s} compact={compact} />
    </section>
  );
}

function ItemRow({ s, compact }: { readonly s: S; readonly compact: boolean }) {
  const saved = s.row === "item";
  return (
    <div className={cls("row")} data-saved={saved || undefined}>
      <span className={cls("cell-check")}>
        <span className={cls("skeleton-check")} data-on={!saved || undefined} />
        <Check on={saved} />
      </span>
      <span className={cls("cell-item")}>
        <span className={cls("thumb")}>
          <span className={cls("thumb-spin")} data-on={!saved || undefined}>
            <span className={cls("spin")}>
              <Icon icon={Loading03Icon} />
            </span>
          </span>
          <img src={FIGURE} alt="" draggable={false} data-on={saved || undefined} />
        </span>
        <span className={cls("item-text")}>
          <span className={cls("row-title")}>{TITLE}</span>
          <span className={cls("row-sub")}>
            <Swap texts={["Saving…", `MFC #${MFC_ID}`]} on={saved ? 1 : 0} />
          </span>
        </span>
      </span>
      {compact ? null : (
        <>
          <span className={cls("cell")} data-on={saved || undefined}>
            $214.99
          </span>
          <span className={cls("cell")} data-on={saved || undefined}>
            1
          </span>
          <span className={cls("cell")} data-on={saved || undefined}>
            New
          </span>
        </>
      )}
      <span className={cls("row-actions")} data-on={saved || undefined}>
        <span className={cls("details")} data-enabled={s.collection || undefined}>
          <Icon icon={ExpandIcon} size={16} stroke={1.5} />
          Details
        </span>
        <span className={cls("remove")}>
          <Icon icon={Cancel01Icon} />
        </span>
      </span>
    </div>
  );
}

function Empty() {
  return (
    <div className={cls("empty")}>
      <span className={cls("empty-title")}>No items yet</span>
      <span className={cls("empty-body")}>
        Click Pick for myakiba on any MyFigureCollection item and it lands here.
      </span>
    </div>
  );
}

function Table({ s, compact }: { readonly s: S; readonly compact: boolean }) {
  return (
    <div className={cls("table")}>
      <div className={cls("thead")}>
        <span className={cls("cell-check")}>
          <Check on={!s.committed && s.row === "item"} dim={s.committed} />
        </span>
        <span className={cls("th")}>Item</span>
        {compact ? null : (
          <>
            <span className={cls("th")}>Price</span>
            <span className={cls("th")}>Count</span>
            <span className={cls("th")}>Condition</span>
          </>
        )}
      </div>
      {/* The row leaves as one thing, and the page's own hint takes its place */}
      <div className={cls("body")} data-empty={s.committed || undefined}>
        <div className={cls("body-row")}>
          <ItemRow s={s} compact={compact} />
        </div>
        <div className={cls("body-empty")}>
          <Empty />
        </div>
      </div>
      <div className={cls("foot")}>
        <span className={cls("foot-mfc")}>
          <Icon icon={Search01Icon} size={14} stroke={2} />
          <Bar w={compact ? 64 : 132} h={6} r={3} tone={3} />
          <Icon icon={ExternalIcon} size={14} stroke={2} />
        </span>
        <span className={cls("foot-search")}>
          <Bar w={compact ? 40 : 88} h={6} r={3} tone={2} />
        </span>
      </div>
    </div>
  );
}

function Toast({ s }: { readonly s: S }) {
  return (
    <div
      className={cls("toast")}
      data-target="toast"
      data-show={s.toast || undefined}
      role="status"
    >
      <span className={cls("toast-media")}>
        <img src={FIGURE} alt="" draggable={false} />
      </span>
      <span className={cls("toast-title")}>Added 1 to your collection</span>
      <span className={cls("toast-view")} data-target="view">
        View
      </span>
      <span className={cls("toast-close")}>
        <Icon icon={Cancel01Icon} stroke={2} />
      </span>
    </div>
  );
}

function AddPage({
  s,
  compact,
  menuAt,
}: {
  readonly s: S;
  readonly compact: boolean;
  readonly menuAt: Point;
}) {
  return (
    <div className={cls("page")} data-show={s.page === "add" || undefined}>
      <div className={cls("add")} data-target="add-content">
        <div className={cls("page-head")}>
          <span className={cls("page-title")}>Review your picks</span>
          <span className={cls("page-meta")}>
            <Swap texts={["1 Item", "0 Items"]} on={s.committed ? 1 : 0} />
          </span>
        </div>
        <Sentence s={s} compact={compact} />
        <Table s={s} compact={compact} />
        <ChoiceMenu s={s} at={menuAt} />
      </div>
    </div>
  );
}

/** Words that change in place: each one in the same cell, crossfading with a small lift */
function Swap({ texts, on }: { readonly texts: readonly string[]; readonly on: number }) {
  return (
    <span className={cls("swap")}>
      {texts.map((text, i) => (
        <span key={text} className={cls("swap-item")} data-on={i === on || undefined}>
          {text}
        </span>
      ))}
    </span>
  );
}

const COLLECTION_HEAD = ["Item", "Scale", "Count", "Price"] as const;

/** The Collection, filtered to what the Add page just added, as View opens it */
function CollectionPage({ s, compact }: { readonly s: S; readonly compact: boolean }) {
  return (
    <div className={cls("page")} data-show={s.page === "collection" || undefined}>
      <div className={cls("add")}>
        <div className={cls("page-head")}>
          <span className={cls("page-title")}>Collection</span>
        </div>
        <div className={cls("toolbar")}>
          <span className={cls("tool")} data-field>
            <Icon icon={SearchIcon} />
            <Bar w={compact ? 48 : 96} h={6} r={3} tone={2} />
          </span>
          <span className={cls("tool")}>
            <Icon icon={FilterIcon} />
            {compact ? null : <Bar w={40} h={6} r={3} tone={3} />}
          </span>
          {compact ? null : (
            <span className={cls("views")}>
              {[LeftToRightListDashIcon, Menu01Icon, GridViewIcon, Image01Icon].map((icon, i) => (
                <span key={i} className={cls("view")} data-on={i === 0 || undefined}>
                  <Icon icon={icon} />
                </span>
              ))}
            </span>
          )}
          <span className={cls("toolbar-add")}>
            <Icon icon={Add01Icon} stroke={2} />
            {compact ? null : "Add"}
          </span>
        </div>
        <p className={cls("chip")}>
          Showing the item you just added
          <span className={cls("chip-link")}>Show all</span>
        </p>
        <div className={cls("table")} data-collection>
          <div className={cls("thead")}>
            <span className={cls("cell-check")}>
              <Check on={false} />
            </span>
            {COLLECTION_HEAD.slice(0, compact ? 1 : 4).map((h) => (
              <span key={h} className={cls("th")}>
                {h}
              </span>
            ))}
          </div>
          <div className={cls("row")} data-target="new-row" data-arrive>
            <span className={cls("cell-check")}>
              <Check on={false} />
            </span>
            <span className={cls("cell-item")}>
              <span className={cls("thumb")}>
                <img src={FIGURE} alt="" draggable={false} data-on />
              </span>
              <span className={cls("item-text")}>
                <span className={cls("row-title")}>{TITLE}</span>
                <span className={cls("row-sub")}>MFC #{MFC_ID}</span>
              </span>
            </span>
            {/* The narrow table shows the Item column; the rest scroll past its edge */}
            {compact ? null : (
              <>
                <span className={cls("cell")} data-on>
                  1/7
                </span>
                <span className={cls("cell")} data-on>
                  1
                </span>
                <span className={cls("cell")} data-on>
                  $214.99
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Browser({
  s,
  layout,
  rect,
}: {
  readonly s: S;
  readonly layout: Layout;
  readonly rect: (name: string) => Rect;
}) {
  const compact = layout === "compact";
  // The trigger's place in the page, so the popup opens 4px under it
  const trigger = rect("choose");
  const content = rect("add-content");
  const menuAt = { x: trigger.x - content.x, y: trigger.y - content.y + trigger.height + 4 };
  const pages: readonly Page[] = ["mfc", "add", "collection"];
  const url = <Swap texts={pages.map((page) => URLS[page])} on={pages.indexOf(s.page)} />;
  const viewport = (
    <div className={cls("viewport")}>
      <CatalogPage s={s} compact={compact} />
      {/* The app's header stays put from page to page; only the page under it changes */}
      <div className={cls("app-layer")} data-show={s.page !== "mfc" || undefined}>
        <AppHeader />
      </div>
      <AddPage s={s} compact={compact} menuAt={menuAt} />
      <CollectionPage s={s} compact={compact} />
      {/* The app's toaster is fixed to the viewport, over whichever page shows */}
      <Toast s={s} />
    </div>
  );
  if (!compact) {
    return (
      <Window url={url} className={cls("window")}>
        {viewport}
      </Window>
    );
  }
  // A phone column has no room for a desktop window's shape: the browser's
  // address and page, without the lights, whole inside the gutter
  return (
    <div className={`ss-window ${cls("panel")}`}>
      <div className="ss-window__bar">
        <span className="ss-window__url">{url}</span>
      </div>
      <div className="ss-window__body">{viewport}</div>
    </div>
  );
}

export function PickToAddDemo({ theme }: DemoProps): ReactNode {
  return (
    <Stage<S>
      width={960}
      height={440}
      compact={{ below: 560, width: 358, height: 440 }}
      initial={initial}
      poster={poster}
      script={script}
      play="once"
      theme={theme}
      fidelity="standard"
      cursor={{ at: REST }}
      className={`look-myakiba ${cls("root")}`}
    >
      {(s, rect, layout) => <Browser s={s} layout={layout} rect={rect} />}
    </Stage>
  );
}
