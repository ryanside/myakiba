import type { ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import {
  Add01Icon,
  Calendar01Icon,
  ChartColumnIcon,
  CreditCardIcon,
  DatabaseIcon,
  Edit03Icon,
  Folder01Icon,
  FolderAddIcon,
  Home01Icon,
  LibraryIcon,
  Loading03Icon,
  MoreHorizontalIcon,
  PackageIcon,
  PanelLeftIcon,
  SearchIcon,
  Settings01Icon,
  StarIcon,
} from "@hugeicons/core-free-icons";
import { Bar, Collapse, Stage, Window } from "@/components/stageshow/kit";
import type { Act } from "@/components/stageshow/kit";
import { BackIcon, NavigateIcon } from "@/lib/icons";
import type { DemoProps } from "../demo-props";
import "./command-menu.css";

// From the dashboard, Cmd+K opens the command menu and "spring" is typed.
// Navigate narrows on every key and drops away, Orders and Items search while
// the query settles, then "Spring preorders" lands under Orders and one item
// under Items. As in the app, the highlight stays on "View all orders" when
// the results arrive, so Up moves it to the order and Enter opens the order's
// page. The pointer clicks Back, the cause of the reset. On the empty query
// the Actions group's "Add items" sits under Navigate, below the list's fold;
// no word of "spring" starts its title or keywords, so it drops on the first
// key and never shows with the results.
//
// Real strings: the placeholder, the query, the group headings, the Navigate
// rows the typing filters, the results, and the order page's header. The
// dashboard behind and the order's summary are filler.

type View = "dashboard" | "order";

type S = {
  readonly open: boolean;
  readonly query: string;
  readonly searched: boolean;
  readonly up: boolean;
  readonly view: View;
};

const initial: S = { open: false, query: "", searched: false, up: false, view: "dashboard" };
const poster: S = { open: true, query: "spring", searched: true, up: true, view: "dashboard" };

const cls = (name: string) => `mk-command-menu-${name}`;

interface NavItem {
  readonly title: string;
  readonly icon: IconSvgElement;
  readonly keywords: readonly string[];
}

// The app's Navigate rows, in its order (APP_COMMAND_NAVIGATION_ITEMS).
const NAV: readonly NavItem[] = [
  { title: "Dashboard", icon: Home01Icon, keywords: ["home", "overview"] },
  { title: "Analytics", icon: ChartColumnIcon, keywords: ["reports", "insights", "stats"] },
  {
    title: "Expenses",
    icon: CreditCardIcon,
    keywords: ["costs", "spending", "budget", "payments"],
  },
  { title: "Orders", icon: PackageIcon, keywords: ["purchases", "order history"] },
  { title: "Collection", icon: LibraryIcon, keywords: ["items", "figures", "owned"] },
  { title: "Wishlist", icon: StarIcon, keywords: ["starred", "wanted", "planned"] },
  { title: "Lists", icon: Folder01Icon, keywords: ["folders", "groups", "organize"] },
  {
    title: "Item Database",
    icon: DatabaseIcon,
    keywords: ["database", "mfc", "figures", "goods", "media"],
  },
  { title: "Calendar", icon: Calendar01Icon, keywords: ["releases", "schedule", "dates", "month"] },
  { title: "Settings", icon: Settings01Icon, keywords: ["preferences", "account"] },
];

// The Actions group's one row (app-command.tsx): it shows while its title or
// a keyword matches, so it stands under Navigate on the empty query and drops
// with the first key of "spring".
const ADD_ITEMS: NavItem = {
  title: "Add items",
  icon: Add01Icon,
  keywords: [
    "add",
    "pick",
    "picks",
    "collection",
    "order",
    "wishlist",
    "item",
    "mfc",
    "myfigurecollection",
  ],
};

const ORDER = {
  title: "Spring preorders",
  id: "m8k2v7qzc3w1h9t4p6b0r5nj",
  shop: "Kumo Hobby",
  shipping: "EMS",
  items: "3 items",
  images: ["/example-item2.webp", "/example-item3.webp", "/example-item4.webp"],
} as const;

const ITEM = {
  title: "Hanami Spring Ver. 1/7 Scale",
  category: "Prepainted",
  image: "/example-item4.webp",
} as const;

const TERM_SEPARATOR = /[^a-z0-9]+/i;

const termsOf = (value: string) =>
  value
    .toLowerCase()
    .split(TERM_SEPARATOR)
    .filter((term) => term.length > 0);

/** The app's Navigate filter: every typed term starts some word of the title or a keyword. */
function matches(item: NavItem, query: string): boolean {
  if (query.length === 0) return true;
  const words = [item.title, ...item.keywords].flatMap(termsOf);
  return termsOf(query).every((term) => words.some((word) => word.startsWith(term)));
}

// Row geometry, as the app's command items lay out: a 32px lead with 8px
// above and below, a 28px group heading, 4px of group padding at each end
const ROW = 52;
const LOADING_ROW = 48;
const GROUP = 8 + 28;
const LIST_MAX = { wide: 281, compact: 229 } as const;

function listHeight(s: S, compact: boolean): number {
  const nav = NAV.filter((item) => matches(item, s.query)).length;
  const navigate = nav > 0 ? GROUP + nav * ROW : 0;
  const actions = matches(ADD_ITEMS, s.query) ? GROUP + ROW : 0;
  const first = s.searched ? ROW : LOADING_ROW;
  const search = s.query ? 2 * (GROUP + first) + (compact ? 1 : 2) * ROW + 1 : 0;
  return navigate + actions + search;
}

/** Which row cmdk highlights: the first enabled row after each keystroke, kept when results land. */
function selectedRow(s: S): string {
  const first = NAV.find((item) => matches(item, s.query));
  if (first) return `nav-${first.title}`;
  return s.up ? "order" : "orders-all";
}

async function script(a: Act<S>) {
  await a.wait(800);
  a.mark("open");
  await a.key("cmd+k");
  await a.set({ open: true });
  await a.wait(800);
  a.mark("type");
  await a.type("query", "spring", { interval: 130 });
  // The search waits out its 200ms debounce, then the results come back
  await a.wait(420);
  a.mark("results");
  await a.set({ searched: true });
  await a.wait(1200);
  a.mark("up");
  await a.key("up");
  await a.set({ up: true });
  await a.wait(800);
  a.mark("enter");
  await a.key("enter");
  await a.set({ open: false, view: "order" });
  await a.wait(500);
  // Closing clears the input, as the app does, out of sight
  await a.snap({ query: "", searched: false, up: false }, "dialog");
  await a.wait(2000);
  a.mark("back");
  await a.moveCursor({ at: "back", x: 0.14, y: 0.55 });
  await a.wait(150);
  await a.click({ at: "back", x: 0.14, y: 0.55 });
  await a.set({ view: "dashboard" });
  await a.wait(300);
  await a.moveCursor("rest", { duration: 600 });
  await a.wait(200);
}

function Icon({ icon, size = 16 }: { readonly icon: IconSvgElement; readonly size?: number }) {
  return <HugeiconsIcon icon={icon} size={size} strokeWidth={1.5} />;
}

function AppHeader({ compact }: { readonly compact: boolean }) {
  return (
    <div className={cls("header")}>
      <span className={cls("header-button")}>
        <Icon icon={PanelLeftIcon} />
      </span>
      <span className={cls("header-button")}>
        <Icon icon={SearchIcon} />
      </span>
      {compact ? null : (
        <>
          <span className={cls("spacer")} />
          <span className={cls("add")}>
            <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={2} />
          </span>
          <span className={cls("avatar")} />
        </>
      )}
    </div>
  );
}

const DAYS = Array.from({ length: 21 }, (_, i) => i);
const RELEASES = new Map([
  [4, "/example-item5.webp"],
  [9, "/example-item6.webp"],
  [16, "/example-item7.webp"],
]);
const CHART = [44, 62, 38, 70, 52, 86, 58, 48] as const;
const BREAKDOWN = [
  [78, 44],
  [64, 40],
  [86, 36],
  [56, 42],
] as const;

function Dashboard({ compact }: { readonly compact: boolean }) {
  return (
    <div className={cls("dashboard")}>
      <div className={cls("title-row")}>
        <Bar w={compact ? 132 : 112} h={10} tone={4} r={3} />
        <span className={cls("tabs")}>
          <span className={cls("tab")} data-active>
            <Bar w={46} h={5} tone={4} />
          </span>
          <span className={cls("tab")}>
            <Bar w={44} h={5} tone={2} />
          </span>
        </span>
      </div>
      <div className={cls("kpis")}>
        {[52, 60, 66, 58].map((w) => (
          <span key={w} className={cls("kpi")}>
            <Bar w={w} h={5} tone={2} />
            <Bar w={w + 18} h={12} tone={4} r={3} />
          </span>
        ))}
      </div>
      <div className={cls("panels")}>
        <section className={cls("panel")}>
          <Bar w={92} h={7} tone={3} />
          {BREAKDOWN.map(([label, value]) => (
            <span key={label} className={cls("line")}>
              <Bar w={label} h={5} tone={2} />
              <Bar w={value} h={5} tone={3} />
            </span>
          ))}
        </section>
        <section className={cls("panel")}>
          <Bar w={84} h={7} tone={3} />
          <span className={cls("chart")}>
            {CHART.map((h, i) => (
              <span key={`${h}-${String(i)}`} className={cls("column")} style={{ height: h }} />
            ))}
          </span>
        </section>
        <section className={cls("panel")}>
          <Bar w={104} h={7} tone={3} />
          <span className={cls("calendar")}>
            {DAYS.map((day) => {
              const image = RELEASES.get(day);
              return (
                <span key={day} className={cls("day")}>
                  {image ? <img src={image} alt="" draggable={false} /> : null}
                </span>
              );
            })}
          </span>
        </section>
      </div>
    </div>
  );
}

function Thumbs({
  images,
  className,
}: {
  readonly images: readonly string[];
  readonly className: string;
}) {
  return (
    <span className={className} data-count={images.length}>
      {images.map((src) => (
        <img key={src} src={src} alt="" draggable={false} />
      ))}
    </span>
  );
}

const COSTS = [
  [40, 64],
  [56, 48],
  [36, 44],
] as const;

const STEPS = [
  { key: "ordered", state: "done", w: 46 },
  { key: "paid", state: "current", w: 30 },
  { key: "shipped", state: "todo", w: 50 },
  { key: "owned", state: "todo", w: 42 },
] as const;

function OrderPage({ compact }: { readonly compact: boolean }) {
  return (
    <div className={cls("order-page")}>
      <span className={cls("back")} data-target="back">
        <HugeiconsIcon icon={BackIcon} size={14} strokeWidth={1.5} />
        <span>Back</span>
      </span>
      <div className={cls("hero")}>
        <Thumbs images={ORDER.images} className={cls("hero-thumbs")} />
        <div className={cls("hero-text")}>
          <div className={cls("hero-title-row")}>
            <span className={cls("hero-title")}>{ORDER.title}</span>
            <span className={cls("status")}>
              <span className={cls("dot")} />
              Paid
            </span>
          </div>
          <div className={cls("meta")}>
            <span>{ORDER.shop}</span>
            <span>{ORDER.shipping}</span>
            <span>{ORDER.items}</span>
          </div>
        </div>
        {compact ? null : (
          <div className={cls("actions")}>
            <span className={cls("button")}>
              <Icon icon={FolderAddIcon} />
              Add to List
            </span>
            <span className={cls("button")}>
              <Icon icon={Edit03Icon} />
              Edit
            </span>
            <span className={`${cls("button")} ${cls("button-icon")}`}>
              <Icon icon={MoreHorizontalIcon} />
            </span>
          </div>
        )}
      </div>
      <div className={cls("summary")}>
        <section className={cls("section")}>
          <Bar w={68} h={7} tone={3} />
          <span className={cls("timeline")}>
            {STEPS.map((step) => (
              <span key={step.key} className={cls("step")} data-state={step.state}>
                <span className={cls("step-mark")} />
                <Bar w={step.w} h={5} tone={step.state === "todo" ? 2 : 3} />
              </span>
            ))}
          </span>
        </section>
        {compact ? null : (
          <section className={`${cls("section")} ${cls("costs")}`}>
            <Bar w={104} h={7} tone={3} />
            {COSTS.map(([label, value]) => (
              <span key={label} className={cls("line")}>
                <Bar w={label} h={5} tone={2} />
                <Bar w={value} h={5} tone={3} />
              </span>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}

function CommandRow({
  value,
  selected,
  lead,
  title,
  subtitle,
}: {
  readonly value: string;
  readonly selected: string;
  readonly lead: ReactNode;
  readonly title: ReactNode;
  readonly subtitle: string;
}) {
  return (
    <div className={cls("item")} data-selected={value === selected || undefined}>
      {lead}
      <span className={cls("item-text")}>
        <span className={cls("item-title")}>{title}</span>
        <span className={cls("item-subtitle")}>{subtitle}</span>
      </span>
    </div>
  );
}

function LeadIcon({ icon }: { readonly icon: IconSvgElement }) {
  return (
    <span className={cls("lead")}>
      <Icon icon={icon} />
    </span>
  );
}

function LoadingRow({ label }: { readonly label: string }) {
  return (
    <div className={`${cls("item")} ${cls("loading")}`}>
      <span className={`${cls("lead")} ${cls("lead-muted")}`}>
        <span className={cls("spinner")}>
          <Icon icon={Loading03Icon} />
        </span>
      </span>
      <span className={cls("loading-label")}>{label}</span>
    </div>
  );
}

function SearchGroup({
  heading,
  loading,
  searched,
  result,
  all,
}: {
  readonly heading: string;
  readonly loading: string;
  readonly searched: boolean;
  readonly result: ReactNode;
  readonly all: ReactNode;
}) {
  return (
    <div className={cls("group")}>
      <div className={cls("heading")}>{heading}</div>
      {/* The result takes the loading row's place: one slot, the rows crossfading */}
      <div className={cls("slot")} data-searched={searched || undefined}>
        <div className={cls("slot-loading")}>
          <LoadingRow label={loading} />
        </div>
        <div className={cls("slot-result")}>{result}</div>
      </div>
      {all}
    </div>
  );
}

function CommandDialog({ s, compact }: { readonly s: S; readonly compact: boolean }) {
  const selected = selectedRow(s);
  const navOpen = NAV.some((item) => matches(item, s.query));
  const overflow = listHeight(s, compact) > (compact ? LIST_MAX.compact : LIST_MAX.wide);
  const quoted = `"${s.query}"`;
  return (
    <div className={cls("dialog")} data-show={s.open || undefined} data-target="dialog">
      <div className={cls("input")}>
        <span className={cls("search-icon")}>
          <HugeiconsIcon icon={SearchIcon} size={18} strokeWidth={2} />
        </span>
        <span className={cls("field")}>
          {s.query ? (
            <span className={cls("query")} data-typing>
              {s.query}
            </span>
          ) : null}
          <span key={s.query} className={cls("caret")} />
          <span
            className={cls("placeholder")}
            data-hidden={s.query.length > 0 || undefined}
            data-typing
          >
            Search pages, actions, orders, or items…
          </span>
        </span>
      </div>
      <div className={cls("list")} data-overflow={overflow || undefined}>
        <Collapse className={cls("collapse")} open={navOpen}>
          <div className={cls("group")}>
            <div className={cls("heading")}>Navigate</div>
            {NAV.map((item) => (
              <Collapse key={item.title} className={cls("collapse")} open={matches(item, s.query)}>
                <CommandRow
                  value={`nav-${item.title}`}
                  selected={selected}
                  lead={<LeadIcon icon={item.icon} />}
                  title={item.title}
                  subtitle={`Open ${item.title}`}
                />
              </Collapse>
            ))}
          </div>
        </Collapse>
        <Collapse className={cls("collapse")} open={matches(ADD_ITEMS, s.query)}>
          <div className={cls("group")}>
            <div className={cls("heading")}>Actions</div>
            <CommandRow
              value="add-items"
              selected={selected}
              lead={<LeadIcon icon={ADD_ITEMS.icon} />}
              title={ADD_ITEMS.title}
              subtitle="Open the Add page to review your picks or search myakiba"
            />
          </div>
        </Collapse>
        {/* Solid: it opens below the fold on the first key, so its rows are
            already drawn when Navigate drops away and they rise into view */}
        <Collapse className={cls("collapse")} open={s.query.length > 0} solid>
          <SearchGroup
            heading="Orders"
            loading="Searching orders..."
            searched={s.searched}
            result={
              <CommandRow
                value="order"
                selected={selected}
                lead={<Thumbs images={ORDER.images} className={cls("thumbs")} />}
                title={ORDER.title}
                subtitle={`Open order ${ORDER.id}`}
              />
            }
            all={
              <CommandRow
                value="orders-all"
                selected={selected}
                lead={<LeadIcon icon={NavigateIcon} />}
                title={<span data-typing>{`View all orders for ${quoted}`}</span>}
                subtitle="Open the full orders page with this query"
              />
            }
          />
          <div className={cls("separator")} />
          <SearchGroup
            heading="Items"
            loading="Searching items..."
            searched={s.searched}
            result={
              <CommandRow
                value="item"
                selected={selected}
                lead={<img className={cls("thumb")} src={ITEM.image} alt="" draggable={false} />}
                title={ITEM.title}
                subtitle={ITEM.category}
              />
            }
            all={
              // The phone column's list ends at the item; this row sits below its fold
              compact ? null : (
                <CommandRow
                  value="items-all"
                  selected={selected}
                  lead={<LeadIcon icon={NavigateIcon} />}
                  title={<span data-typing>{`View all items for ${quoted}`}</span>}
                  subtitle="Open the collection page with this query"
                />
              )
            }
          />
        </Collapse>
      </div>
    </div>
  );
}

export function CommandMenuDemo({ theme }: DemoProps) {
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
      keys="top"
      cursor={{ at: "rest" }}
      className="look-myakiba mk-command-menu"
    >
      {(s, _rect, layout) => {
        const compact = layout === "compact";
        return (
          <>
            <Window className={cls("window")}>
              {/* The page runs on past the window's foot, as a scrolled app does */}
              <div className={cls("app")} data-crop>
                <AppHeader compact={compact} />
                <div className={cls("pages")}>
                  <div className={cls("page")} data-show={s.view === "dashboard" || undefined}>
                    <Dashboard compact={compact} />
                  </div>
                  <div className={cls("page")} data-show={s.view === "order" || undefined}>
                    <OrderPage compact={compact} />
                  </div>
                </div>
                <div className={cls("scrim")} data-show={s.open || undefined} />
                <CommandDialog s={s} compact={compact} />
              </div>
            </Window>
            <span className={cls("rest")} data-target="rest" aria-hidden />
          </>
        );
      }}
    </Stage>
  );
}
