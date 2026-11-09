import { HugeiconsIcon } from "@hugeicons/react";
import {
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Delete01Icon,
  Delete02Icon,
  DragDropVerticalIcon,
  Edit03Icon,
  FolderAddIcon,
  GitMergeIcon,
  GridViewIcon,
  Image01Icon,
  LeftToRightListDashIcon,
  Loading03Icon,
  MoreHorizontalIcon,
  MoveIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { Bar, Stage, Window } from "@/components/stageshow/kit";
import type { Act } from "@/components/stageshow/kit";
import { ExpandIcon, ExternalIcon } from "@/lib/icons";
import type { DemoProps } from "../demo-props";
import "./list-anything.css";

// One order added to a List that already holds an Item and a Collection
// Item. Beats: in the orders table the pointer ticks an order and the action
// bar rises; Add Orders to List opens the Add to List dialog; Wonfes 2027 is
// ticked and Saved; the dialog closes and a toast says the order was added,
// with Open List; Open List goes to the List, where the order sits as the
// last member, an order card among figure cards, each named by its kind. The
// pointer comes to rest on the order and its controls show. The orders page
// coming back is the reset.
//
// True to the app (add-to-lists-dialog.tsx, use-lists.ts, lists module):
// - The dialog runs per target kind: the orders action bar passes only
//   orders, the item pages only items. No single dialog adds a mixed
//   selection; a List becomes mixed by adding to it from each page.
// - A List created in the dialog is empty, so the List here already exists:
//   it was filled earlier from the item pages. Ticking it enables Save.
// - Save closes the dialog and clears the order selection, its spinner back
//   to its label with no check on the way out; the toast reads
//   "1 Order added to 1 List" with Open List, which goes to that List.
// - Members keep a manual order and a new one is appended, so the order is
//   last. Each member's kind (Item, Collection Item, Order) sits above its
//   title in the grid, under it in the list view.
// - A List made in the dialog has no description, and this one has none.

type Page = "orders" | "list";

type S = {
  readonly page: Page;
  /** The order's checkbox, which also raises the action bar. */
  readonly picked: boolean;
  readonly dialog: boolean;
  /** Wonfes 2027 is ticked in the dialog. */
  readonly ticked: boolean;
  readonly saving: boolean;
  readonly toast: boolean;
};

type Status = "Ordered" | "Paid" | "Shipped" | "Owned";

type Order = {
  readonly title: string;
  readonly items: number;
  readonly total: string;
  readonly status: Status;
  readonly images: readonly string[];
};

type Kind = "Item" | "Collection Item" | "Order";

type Member = {
  readonly title: string;
  readonly kind: Kind;
  readonly images: readonly string[];
};

const LIST = "Wonfes 2027";

const img = (n: number) => `/example-item${n}.webp`;

// The order the story adds. Its three item photos are the card's mosaic.
const ADDED: Order = {
  title: "Event exclusives",
  items: 3,
  total: "$286.40",
  status: "Paid",
  images: [img(2), img(4), img(6)],
};

const ORDERS: readonly Order[] = [
  {
    title: "Spring preorders",
    items: 2,
    total: "$323.50",
    status: "Ordered",
    images: [img(5), img(7)],
  },
  ADDED,
  {
    title: "Plush restock",
    items: 1,
    total: "$34.50",
    status: "Owned",
    images: [img(3)],
  },
  {
    title: "Summer prize figures",
    items: 3,
    total: "$141.30",
    status: "Shipped",
    images: [img(4), img(3), img(7)],
  },
  {
    title: "Autumn scale preorders",
    items: 2,
    total: "$318.00",
    status: "Ordered",
    images: [img(6), img(5)],
  },
  {
    title: "Garage kit lot",
    items: 2,
    total: "$212.00",
    status: "Owned",
    images: [img(2), img(6)],
  },
];

const ORDER_MEMBER: Member = { title: ADDED.title, kind: "Order", images: ADDED.images };

// What the List held before: figures added from their own pages
const MEMBERS_WIDE: readonly Member[] = [
  { title: "Akari 1/7 Scale", kind: "Item", images: [img(5)] },
  { title: "Momo Plush", kind: "Collection Item", images: [img(3)] },
  { title: "Sylphine 1/7 Scale", kind: "Item", images: [img(7)] },
  ORDER_MEMBER,
];

// The phone column has room for three rows under the title
const MEMBERS_COMPACT: readonly Member[] = [
  { title: "Akari 1/7 Scale", kind: "Item", images: [img(5)] },
  { title: "Momo Plush", kind: "Collection Item", images: [img(3)] },
  ORDER_MEMBER,
];

// The folder shows the first four photos of the List's members, as the page does
const FOLDER = [img(5), img(3), img(7), img(2)];

const initial: S = {
  page: "orders",
  picked: false,
  dialog: false,
  ticked: false,
  saving: false,
  toast: false,
};

// The result: the List with the order among its figures
const poster: S = { ...initial, page: "list" };

const cls = (name: string) => `mk-list-anything-${name}`;

async function script(a: Act<S>) {
  await a.wait(800);
  a.mark("select");
  await a.click("check");
  a.put({ picked: true });
  await a.wait(650);
  a.mark("add");
  await a.click({ at: "bar-add", x: a.layout === "wide" ? 0.88 : 0.5, y: 0.6 });
  a.put({ dialog: true });
  await a.wait(750);
  a.mark("tick");
  await a.click({ at: "list-check", x: 0.5, y: 0.5 });
  a.put({ ticked: true });
  await a.wait(550);
  a.mark("save");
  await a.click({ at: "save", x: 0.72, y: 0.62 });
  a.put({ saving: true });
  await a.wait(650);
  // Saved: the dialog closes, the selection clears and the toast drops in.
  // Save closes on success (closesOnSuccess), so it shows no check: its
  // spinner gives way to its label as the dialog goes
  a.mark("added");
  await a.set({ dialog: false, picked: false, saving: false });
  await a.wait(160);
  a.put({ toast: true });
  // The closed dialog forgets its choices out of sight, as the app unmounts it
  await a.snap({ ticked: false }, "dialog");
  await a.wait(900);
  a.mark("open");
  await a.click({ at: "toast-open", x: 0.7, y: 0.62 });
  await a.set({ toast: false, page: "list" });
  await a.wait(450);
  a.mark("list");
  await a.moveCursor(
    { at: "order-card", x: 0.58, y: a.layout === "wide" ? 0.62 : 0.55 },
    { duration: 750 },
  );
  await a.wait(2600);
  // Back to the orders page, which is where the loop begins
  a.mark("back");
  const away = a.moveCursor("rest", { duration: 800 });
  await a.wait(200);
  await a.set({ page: "orders" });
  await away;
  await a.wait(700);
}

function Thumbs({
  images,
  className,
}: {
  readonly images: readonly string[];
  readonly className: string;
}) {
  const shown = images.slice(0, 4);
  return (
    <span className={className} data-count={shown.length}>
      {shown.map((src) => (
        <img key={src} src={src} alt="" draggable={false} />
      ))}
    </span>
  );
}

function Check({ on, target }: { readonly on?: boolean; readonly target?: string }) {
  return (
    <span className={cls("check")} data-on={on || undefined} data-target={target}>
      <HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={2} />
    </span>
  );
}

function OrderRow({ order, picked }: { readonly order: Order; readonly picked?: boolean }) {
  const isAdded = order === ADDED;
  return (
    <div className={cls("row")} data-picked={picked || undefined}>
      <span className={cls("cell-check")}>
        <Check on={picked} target={isAdded ? "check" : undefined} />
      </span>
      <span className={cls("expand")}>
        <HugeiconsIcon icon={ExpandIcon} size={16} strokeWidth={1.5} />
      </span>
      <span className={cls("cell")}>
        <span className={cls("order")}>
          <Thumbs images={order.images} className={cls("thumbs")} />
          <span className={cls("order-title")}>{order.title}</span>
        </span>
      </span>
      <span className={`${cls("cell")} ${cls("num")} ${cls("col-items")}`}>{order.items}</span>
      <span className={`${cls("cell")} ${cls("num")} ${cls("col-total")}`}>{order.total}</span>
      <span className={`${cls("cell")} ${cls("col-status")}`}>
        <span className={cls("status")}>
          <span className={cls("dot")} data-status={order.status} />
          {order.status}
        </span>
      </span>
      <span className={cls("cell-more")}>
        <HugeiconsIcon icon={MoreHorizontalIcon} size={16} strokeWidth={1.5} />
      </span>
    </div>
  );
}

function ActionBar({ open, compact }: { readonly open: boolean; readonly compact: boolean }) {
  return (
    <div className={cls("bar")} data-open={open || undefined}>
      <span className={cls("bar-selection")}>1 order selected</span>
      <span className={cls("bar-sep")} />
      <span className={cls("bar-group")}>
        {compact ? null : (
          <>
            <span className={cls("bar-item")} data-off>
              <HugeiconsIcon icon={GitMergeIcon} size={14} strokeWidth={1.5} />
            </span>
            <span className={cls("bar-item")} data-off>
              <HugeiconsIcon icon={MoveIcon} size={14} strokeWidth={1.5} />
            </span>
          </>
        )}
        {/* Below md the app shows the action's icon alone */}
        <span className={cls("bar-item")} data-target="bar-add">
          <HugeiconsIcon icon={FolderAddIcon} size={14} strokeWidth={1.5} />
          {compact ? null : "Add Orders to List"}
        </span>
        {compact ? null : (
          <span className={cls("bar-item")} data-tone="destructive">
            <HugeiconsIcon icon={Delete01Icon} size={14} strokeWidth={1.5} />
          </span>
        )}
      </span>
      <span className={cls("bar-sep")} />
      <span className={cls("bar-close")}>
        <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={1.5} />
      </span>
    </div>
  );
}

function OrdersPage({ s, compact }: { readonly s: S; readonly compact: boolean }) {
  return (
    <div className={cls("page")} data-page="orders" data-on={s.page === "orders" || undefined}>
      <div className={cls("table")}>
        <div className={`${cls("row")} ${cls("head")}`}>
          <span className={cls("cell-check")}>
            <Check />
          </span>
          <span />
          <span className={cls("cell")}>Order</span>
          <span className={`${cls("cell")} ${cls("num")} ${cls("col-items")}`}>Items</span>
          <span className={`${cls("cell")} ${cls("num")} ${cls("col-total")}`}>Total</span>
          <span className={`${cls("cell")} ${cls("col-status")} ${cls("head-last")}`}>Status</span>
        </div>
        {ORDERS.map((order) => (
          <OrderRow key={order.title} order={order} picked={order === ADDED && s.picked} />
        ))}
      </div>
      <ActionBar open={s.picked} compact={compact} />
    </div>
  );
}

// The app's Folder, as the List page draws it: a back panel, the first
// photos fanned like papers, and a front that covers their feet
function Folder() {
  return (
    <span className={cls("folder")} aria-hidden>
      <svg className={cls("folder-back")} viewBox="0 0 200 160" preserveAspectRatio="none">
        <path d="M 0 28 Q 0 15 13 15 L 16 15 C 22 15 20 0 26 0 L 80 0 C 86 0 84 15 90 15 L 187 15 Q 200 15 200 28 L 200 147 Q 200 160 187 160 L 13 160 Q 0 160 0 147 Z" />
      </svg>
      {FOLDER.map((src, i) => (
        <span key={src} className={cls("paper")} data-slot={i}>
          <img src={src} alt="" draggable={false} />
        </span>
      ))}
      <span className={cls("folder-front")} />
    </span>
  );
}

function ViewToggle() {
  return (
    <span className={cls("segmented")}>
      <span className={cls("segment")} data-on>
        <HugeiconsIcon icon={GridViewIcon} size={14} strokeWidth={2} />
      </span>
      <span className={cls("segment")}>
        <HugeiconsIcon icon={LeftToRightListDashIcon} size={14} strokeWidth={2} />
      </span>
      <span className={cls("segment")}>
        <HugeiconsIcon icon={Image01Icon} size={14} strokeWidth={2} />
      </span>
    </span>
  );
}

// The controls a member shows under the pointer: select, reorder, remove
function CardControls() {
  return (
    <span className={cls("controls")}>
      <span className={cls("control")}>
        <span className={cls("control-box")} />
      </span>
      <span className={cls("control")}>
        <HugeiconsIcon icon={DragDropVerticalIcon} size={16} strokeWidth={1.5} />
      </span>
      <span className={cls("control")}>
        <HugeiconsIcon icon={Delete02Icon} size={16} strokeWidth={1.5} />
      </span>
    </span>
  );
}

function MemberCard({ member }: { readonly member: Member }) {
  const isOrder = member.kind === "Order";
  return (
    <div className={cls("card")} data-target={isOrder ? "order-card" : undefined}>
      <span className={cls("card-image")}>
        <Thumbs images={member.images} className={cls("mosaic")} />
        <CardControls />
      </span>
      <span className={cls("card-body")}>
        <span className={cls("kind")}>{member.kind}</span>
        <span className={cls("card-title")}>{member.title}</span>
      </span>
    </div>
  );
}

function MemberRow({ member }: { readonly member: Member }) {
  const isOrder = member.kind === "Order";
  return (
    <div className={cls("member-row")} data-target={isOrder ? "order-card" : undefined}>
      <Thumbs images={member.images} className={`${cls("mosaic")} ${cls("row-image")}`} />
      <span className={cls("row-text")}>
        <span className={cls("row-title")}>{member.title}</span>
        <span className={cls("kind")}>{member.kind}</span>
      </span>
      <span className={cls("row-controls")}>
        <span className={cls("control")}>
          <span className={cls("control-box")} />
        </span>
        <span className={cls("control")}>
          <HugeiconsIcon icon={DragDropVerticalIcon} size={16} strokeWidth={1.5} />
        </span>
        <span className={cls("control")}>
          <HugeiconsIcon icon={Delete02Icon} size={16} strokeWidth={1.5} />
        </span>
      </span>
    </div>
  );
}

function ListPage({ s, compact }: { readonly s: S; readonly compact: boolean }) {
  const on = s.page === "list";
  return (
    <div className={cls("page")} data-page="list" data-on={on || undefined}>
      {compact ? (
        <>
          <div className={cls("list-title")}>{LIST}</div>
          <div className={cls("rows")}>
            {MEMBERS_COMPACT.map((member) => (
              <MemberRow key={member.title} member={member} />
            ))}
          </div>
        </>
      ) : (
        <>
          <div className={cls("list-head")}>
            <span className={cls("list-lead")}>
              <Folder />
              <span className={cls("heading")}>
                <span className={cls("list-title")}>{LIST}</span>
                <span className={cls("list-count")}>{MEMBERS_WIDE.length} in this List</span>
              </span>
            </span>
            <span className={cls("list-tools")}>
              <ViewToggle />
              <span className={cls("tool-group")}>
                <span className={cls("button")} data-tone="outline">
                  <HugeiconsIcon icon={Edit03Icon} size={16} strokeWidth={1.5} />
                  Edit
                </span>
                <span className={cls("button")} data-tone="outline" data-icon>
                  <HugeiconsIcon icon={MoreHorizontalIcon} size={16} strokeWidth={1.5} />
                </span>
              </span>
            </span>
          </div>
          <div className={cls("grid")}>
            {MEMBERS_WIDE.map((member) => (
              <MemberCard key={member.title} member={member} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ListOption({
  title,
  ticked,
  target,
  bar,
}: {
  readonly title?: string;
  readonly ticked?: boolean;
  readonly target?: string;
  readonly bar?: number;
}) {
  return (
    <div className={cls("option")}>
      <Check on={ticked} target={target} />
      {title ? (
        <span className={cls("option-title")}>
          {title}
          <span className={cls("option-open")}>
            <HugeiconsIcon icon={ExternalIcon} size={12} strokeWidth={1.75} />
          </span>
        </span>
      ) : (
        <Bar w={bar ?? 96} h={6} tone={3} />
      )}
    </div>
  );
}

function AddDialog({ s, compact }: { readonly s: S; readonly compact: boolean }) {
  return (
    <div className={cls("dialog")} data-open={s.dialog || undefined} data-target="dialog">
      <span className={cls("dialog-close")}>
        <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={2} />
      </span>
      <div className={cls("dialog-head")}>
        <div className={cls("dialog-title")}>Add to List</div>
        {compact ? null : (
          <div className={cls("dialog-desc")}>
            <Bar w={252} h={6} tone={2} />
          </div>
        )}
      </div>
      <div className={cls("form")}>
        <div className={cls("field")}>
          <span className={cls("label")}>New List</span>
          <span className={cls("input")}>
            <span className={cls("placeholder")}>List title</span>
            <span className={cls("create")}>Create</span>
          </span>
        </div>
        <div className={cls("options")}>
          {compact ? null : <ListOption bar={86} />}
          <ListOption title={LIST} ticked={s.ticked} target="list-check" />
          <ListOption bar={compact ? 104 : 118} />
        </div>
        <div className={cls("dialog-foot")}>
          <span className={cls("button")} data-tone="outline">
            Close
          </span>
          <span
            className={cls("button")}
            data-tone="primary"
            data-off={!s.ticked || undefined}
            data-pending={s.saving || undefined}
            data-target="save"
          >
            <span className={cls("button-label")}>Save</span>
            <span className={cls("button-spin")} data-snap>
              <HugeiconsIcon icon={Loading03Icon} size={16} strokeWidth={2} />
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

function Toast({ open }: { readonly open: boolean }) {
  return (
    <div className={cls("toast")} data-open={open || undefined}>
      <span className={cls("toast-icon")}>
        <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} strokeWidth={2} />
      </span>
      <span className={cls("toast-title")}>1 Order added to 1 List</span>
      <span className={cls("button")} data-tone="outline" data-size="sm" data-target="toast-open">
        Open List
      </span>
      <span className={cls("toast-close")}>
        <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={2} />
      </span>
    </div>
  );
}

export function ListAnythingDemo({ theme }: DemoProps) {
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
      cursor={{ at: { wide: "rest", compact: "rest" } }}
      className="look-myakiba mk-list-anything"
    >
      {(s, _rect, layout) => {
        const compact = layout === "compact";
        return (
          <>
            <Window className={cls("window")}>
              <div className={cls("body")}>
                <OrdersPage s={s} compact={compact} />
                <ListPage s={s} compact={compact} />
                <div className={cls("backdrop")} data-open={s.dialog || undefined} />
                <AddDialog s={s} compact={compact} />
                <Toast open={s.toast} />
              </div>
            </Window>
            <span className={cls("rest")} data-target="rest" aria-hidden />
          </>
        );
      }}
    </Stage>
  );
}
