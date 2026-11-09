import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  DragDropVerticalIcon,
  Edit03Icon,
  FolderAddIcon,
  MoreHorizontalIcon,
} from "@hugeicons/core-free-icons";
import {
  addDays,
  format,
  getDaysInMonth,
  max,
  min,
  setHours,
  setMinutes,
  startOfMonth,
  subDays,
} from "date-fns";
import { buttonVariants } from "@/components/ui/button";
import { BackIcon, UnsortedIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";

const ORDER = {
  title: "Makise Kurisu 1/7",
  status: "Owned",
  shop: "AmiAmi",
  shippingMethod: "SAL",
  itemCount: 1,
  image: "/example-item5.webp",
  costs: [
    { label: "Items", amount: 198 },
    { label: "Shipping", amount: 21.4 },
    { label: "Tariffs", amount: 29.7 },
  ],
  total: 249.1,
} as const;

const ITEM = {
  title: "Steins;Gate - Makise Kurisu - 1/7 - Reading Steiner (Good Smile Company)",
  mfcId: 1_618_468,
  category: "Prepainted",
  count: 1,
  price: 198,
  status: "Owned",
} as const;

type Column = {
  readonly id: "select" | "item" | "release" | "count" | "price" | "status" | "actions";
  readonly label: string | null;
  readonly width: number;
  readonly align: "start" | "end";
};

const COLUMNS: readonly Column[] = [
  { id: "select", label: null, width: 32, align: "start" },
  { id: "item", label: "Item", width: 300, align: "start" },
  { id: "release", label: "Release", width: 136, align: "start" },
  { id: "count", label: "Count", width: 88, align: "end" },
  { id: "price", label: "Price", width: 95, align: "end" },
  { id: "status", label: "Status", width: 136, align: "start" },
  { id: "actions", label: null, width: 72, align: "start" },
];

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** A day in the month `offset` months from `now`, as the fixture places the order's steps. */
function dayOfMonth(now: Date, offset: number, day: number): Date {
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return new Date(first.getFullYear(), first.getMonth(), Math.min(day, getDaysInMonth(first)));
}

/** Released the 13th of last month, ordered the 12th two months back, received 19 days after shipping. */
function orderDates(now: Date) {
  const shipped = dayOfMonth(now, -1, 16);
  const owned = min([addDays(shipped, 19), max([startOfMonth(now), subDays(now, 1)])]);
  const ordered = dayOfMonth(now, -2, 12);
  return {
    release: dayOfMonth(now, -1, 13),
    steps: [
      { title: "Ordered", date: ordered },
      { title: "Paid", date: dayOfMonth(now, -1, 14) },
      { title: "Shipped", date: shipped },
      { title: "Owned", date: owned },
    ],
    created: setMinutes(setHours(ordered, 22), 37),
    updated: setHours(owned, 9),
  };
}

const day = (date: Date) => format(date, "MM/dd/yyyy");
const timestamp = (date: Date) => format(date, "MM/dd/yyyy, h:mm a");

const OUTLINE = cn(buttonVariants({ variant: "outline" }));

function Hero({ release }: { readonly release: Date }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-4">
        <div className="size-20 shrink-0 overflow-hidden rounded-xl will-change-transform ring-1 ring-foreground/10">
          <img src={ORDER.image} alt="" className="h-full w-full object-cover object-top" />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <div className="display text-2xl leading-tight font-medium text-pretty break-words">
            <h1 className="inline">{ORDER.title}</h1>
            <span className="ml-3 inline-flex items-center gap-1.5 align-middle text-sm font-medium tracking-normal whitespace-nowrap text-foreground">
              <span className="size-1.5 rounded-full bg-success" />
              {ORDER.status}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>{ORDER.shop}</span>
            <span>{ORDER.shippingMethod}</span>
            <span>
              {ORDER.itemCount} {ORDER.itemCount === 1 ? "item" : "items"}
            </span>
            <span>Release {day(release)}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className={OUTLINE}>
          <HugeiconsIcon icon={FolderAddIcon} data-icon="inline-start" />
          Add to List
        </span>
        <span className={OUTLINE}>
          <HugeiconsIcon icon={Edit03Icon} data-icon="inline-start" /> Edit
        </span>
        <span className={cn(buttonVariants({ variant: "outline", size: "icon" }))}>
          <HugeiconsIcon icon={MoreHorizontalIcon} />
        </span>
      </div>
    </div>
  );
}

function Progress({ steps }: { readonly steps: readonly { title: string; date: Date }[] }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-base font-medium text-foreground">Progress</h2>
      <div className="flex w-full">
        {steps.map(({ title, date }, index) => {
          const last = index === steps.length - 1;
          return (
            <div key={title} className="relative mt-8 flex flex-1 flex-col gap-0.5 not-last:pe-8">
              <div
                className={cn(
                  "absolute -top-6 left-0 size-4 -translate-y-1/2 rounded-full border-2 border-primary bg-primary",
                  last && "ring-4 ring-primary/15",
                )}
              />
              {last ? null : (
                <div className="absolute -top-6 h-0.5 w-[calc(100%-1rem-0.25rem)] translate-x-4.5 -translate-y-1/2 self-start bg-primary" />
              )}
              <h3 className="text-sm font-medium">{title}</h3>
              <time className="mb-1 block text-xs font-medium text-muted-foreground">
                {day(date)}
              </time>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CostBreakdown() {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-base font-medium text-foreground">Cost breakdown</h2>
      <div className="flex flex-col gap-2.5">
        {ORDER.costs.map(({ label, amount }) => (
          <div key={label} className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{label}</span>
            <span className="tabular-nums">{usd.format(amount)}</span>
          </div>
        ))}
      </div>
      <div className="flex min-h-7 items-center justify-between pt-2">
        <span className="text-sm font-medium">Total</span>
        <span className="text-lg font-medium tracking-tight tabular-nums">
          {usd.format(ORDER.total)}
        </span>
      </div>
    </section>
  );
}

const CHECKBOX =
  "relative mb-0.5 flex size-4 shrink-0 items-center justify-center rounded-xs border border-input dark:bg-input/30";

const CELL_BUTTON =
  "-mx-2 flex h-8 w-[calc(100%+1rem)] items-center gap-1.5 rounded-lg border border-transparent px-2 text-sm whitespace-nowrap";

function HeaderCell({ column }: { readonly column: Column }) {
  const end = column.align === "end";
  return (
    <div
      className={cn(
        "relative table-cell h-8 border-b border-border/70 px-2 text-left align-middle font-normal text-secondary-foreground/80",
        column.id === "select" ? "pe-0" : null,
        column.label === null ? null : "truncate",
        end && "pe-6",
      )}
      style={{ width: column.width }}
    >
      {column.id === "select" ? <span className={CHECKBOX} /> : null}
      {column.label === null ? null : (
        <div
          className={cn(
            "flex h-full items-center gap-1.5",
            end ? "justify-end" : "justify-between",
          )}
        >
          <span
            className={cn(
              "inline-flex h-6 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-transparent px-2 text-sm font-normal whitespace-nowrap",
              end ? "-me-3 flex-row-reverse" : "-ms-2",
            )}
          >
            {column.label}
            <span className="mt-px inline-flex">
              <HugeiconsIcon icon={UnsortedIcon} strokeWidth={2} className="size-3.25" />
            </span>
          </span>
        </div>
      )}
    </div>
  );
}

function ItemRow({ release }: { readonly release: Date }) {
  return (
    <div className="table-row">
      <div className="table-cell px-2 py-1.5 align-middle">
        <span className={CHECKBOX} />
      </div>
      <div className="table-cell truncate px-2 py-1.5 align-middle">
        <div className="flex items-center gap-3 pe-4">
          <div className="size-8 shrink-0 overflow-hidden rounded-md">
            <img
              src={ORDER.image}
              alt={ITEM.title}
              className="h-full w-full object-cover object-top"
            />
          </div>
          <div className="min-w-0 space-y-px">
            <span className="block truncate font-medium text-foreground">{ITEM.title}</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">MFC #{ITEM.mfcId}</span>
              <span
                className="block min-w-0 truncate text-xs leading-4"
                style={{ color: "var(--category-prepainted)" }}
              >
                {ITEM.category}
              </span>
            </div>
          </div>
        </div>
      </div>
      <div className="table-cell truncate px-2 py-1.5 align-middle">
        <div className={CELL_BUTTON}>
          <span className="text-sm tabular-nums">{day(release)}</span>
        </div>
      </div>
      <div className="table-cell truncate px-2 py-1.5 pe-6 text-right align-middle tabular-nums">
        <div className={cn(CELL_BUTTON, "justify-end font-medium text-foreground")}>
          {ITEM.count}
        </div>
      </div>
      <div className="table-cell truncate px-2 py-1.5 pe-6 text-right align-middle tabular-nums">
        <div className={cn(CELL_BUTTON, "justify-end font-medium text-foreground")}>
          {usd.format(ITEM.price)}
        </div>
      </div>
      <div className="table-cell truncate px-2 py-1.5 align-middle">
        <div className={CELL_BUTTON}>
          <span className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-success" />
            <span>{ITEM.status}</span>
          </span>
        </div>
      </div>
      <div className="table-cell px-2 py-1.5 align-middle">
        <div className="flex items-center justify-end">
          <span className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}>
            <HugeiconsIcon icon={MoreHorizontalIcon} />
          </span>
        </div>
      </div>
    </div>
  );
}

function Items({ release }: { readonly release: Date }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-medium text-foreground">Items ({ORDER.itemCount})</h2>
        <div className="ml-auto flex items-center gap-2">
          <span className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            <HugeiconsIcon icon={DragDropVerticalIcon} data-icon="inline-start" strokeWidth={2} />
            Columns
          </span>
          <span className={buttonVariants({ size: "sm" })}>
            <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" strokeWidth={2} />
            Add
          </span>
        </div>
      </div>
      <div className="w-full overflow-hidden pb-2.5">
        <div className="table w-[859px] min-w-full table-fixed border-separate border-spacing-0 text-left align-middle text-sm font-normal text-foreground">
          <div className="table-header-group">
            <div className="table-row">
              {COLUMNS.map((column) => (
                <HeaderCell key={column.id} column={column} />
              ))}
            </div>
          </div>
          <div className="table-row-group">
            <ItemRow release={release} />
          </div>
        </div>
      </div>
    </section>
  );
}

export const images: readonly string[] = [ORDER.image];

/** The page the app shows at /orders/kurisu, under the app frame. */
export function Screen({ now }: { readonly now: Date }) {
  const { release, steps, created, updated } = orderDates(now);
  return (
    <div className="mx-auto flex min-h-full max-w-352 flex-col gap-8">
      <span className="relative -mb-1 flex w-fit items-center gap-1.5 self-start rounded-md py-2.5 font-sans text-xs font-medium text-muted-foreground">
        <HugeiconsIcon icon={BackIcon} className="size-3.5 shrink-0" />
        Back
      </span>
      <Hero release={release} />
      <div className="grid grid-cols-[3fr_2fr] gap-x-12 gap-y-8">
        <Progress steps={steps} />
        <CostBreakdown />
      </div>
      <Items release={release} />
      <div className="flex flex-col gap-4 pb-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>Created {timestamp(created)}</span>
          <span>Updated {timestamp(updated)}</span>
        </div>
      </div>
    </div>
  );
}
