import type { ReactNode } from "react";
import {
  Add01Icon,
  DragDropVerticalIcon,
  FilterIcon,
  GridViewIcon,
  Image01Icon,
  LeftToRightListDashIcon,
  Menu01Icon,
  MoreHorizontalIcon,
  PackageIcon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { addMonths, format, getDaysInMonth, setDate, startOfMonth } from "date-fns";
import { buttonVariants } from "@/components/ui/button";
import { ExpandIcon, UnsortedIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";

type Status = "Ordered" | "Paid" | "Shipped" | "Owned";

/** A release day in the month `monthsFromNow` away, or a fixed date, or none. */
type Release =
  | { readonly monthsFromNow: number; readonly day: number }
  | { readonly fixed: string }
  | null;

type OrderRow = {
  readonly title: string;
  readonly image: string | null;
  readonly shop: string;
  readonly release: Release;
  readonly items: number;
  readonly total: number;
  readonly status: Status;
};

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

const KPIS = [
  { title: "Total Orders", value: "134" },
  { title: "Order Spend", value: usd.format(16_033.51) },
  { title: "Active Orders", value: "28" },
  { title: "Unpaid Costs", value: usd.format(2556.7) },
] as const satisfies readonly { readonly title: string; readonly value: string }[];

const QUICK_FILTERS = ["All", "Ordered", "Paid", "Shipped", "Owned"] as const;

const VIEWS = [
  LeftToRightListDashIcon,
  Menu01Icon,
  GridViewIcon,
  Image01Icon,
] as const satisfies readonly IconSvgElement[];

const ORDERS = [
  {
    title: "Teto plushie",
    image: "/example-item3.webp",
    shop: "AmiAmi",
    release: { monthsFromNow: 0, day: 21 },
    items: 1,
    total: 29.33,
    status: "Paid",
  },
  {
    title: "BOOTH doujin haul",
    image: null,
    shop: "BOOTH",
    release: null,
    items: 3,
    total: 62.88,
    status: "Owned",
  },
  {
    title: "Hatsune Miku - 1/7 - Shaohua Ver. (Myethos)",
    image: "/example-item4.webp",
    shop: "BigInJapan",
    release: { monthsFromNow: 0, day: 14 },
    items: 1,
    total: 189.99,
    status: "Ordered",
  },
  {
    title: "Vocaloid CDs",
    image: null,
    shop: "CDJapan",
    release: { monthsFromNow: 0, day: 18 },
    items: 2,
    total: 40.61,
    status: "Ordered",
  },
  {
    title: "Ultimate Madoka 1/8",
    image: "/example-item6.webp",
    shop: "AmiAmi",
    release: { fixed: "12/25/2012" },
    items: 1,
    total: 159.86,
    status: "Owned",
  },
  {
    title: "Prize figure lot",
    image: null,
    shop: "Buyee",
    release: null,
    items: 1,
    total: 81.21,
    status: "Shipped",
  },
  {
    title: "Miku V3 1/4 B-style",
    image: "/example-item2.webp",
    shop: "AmiAmi",
    release: { monthsFromNow: 0, day: 26 },
    items: 1,
    total: 180,
    status: "Ordered",
  },
  {
    title: "Otaku Republic birthday set",
    image: null,
    shop: "Otaku Republic",
    release: { monthsFromNow: -2, day: 15 },
    items: 4,
    total: 122.66,
    status: "Owned",
  },
  {
    title: "Saya 1/7 (Wing)",
    image: "/example-item7.webp",
    shop: "AmiAmi",
    release: { monthsFromNow: 0, day: 1 },
    items: 1,
    total: 142.8,
    status: "Paid",
  },
  {
    title: "Soejima art book (used)",
    image: "/example-item1.webp",
    shop: "Mandarake",
    release: { fixed: "08/01/2010" },
    items: 1,
    total: 51.88,
    status: "Owned",
  },
  {
    title: "Animate acrylic stands",
    image: null,
    shop: "Animate",
    release: { monthsFromNow: -2, day: 20 },
    items: 2,
    total: 42.72,
    status: "Owned",
  },
  {
    title: "Makise Kurisu 1/7",
    image: "/example-item5.webp",
    shop: "AmiAmi",
    release: { monthsFromNow: -1, day: 13 },
    items: 1,
    total: 249.1,
    status: "Owned",
  },
] as const satisfies readonly OrderRow[];

const STATUS_DOT = {
  Ordered: "bg-info",
  Paid: "bg-warning",
  Shipped: "bg-violet-500",
  Owned: "bg-success",
} as const satisfies Record<Status, string>;

/** The labelled columns and the width the app's grid gives each, before the table stretches them. */
const SORTABLE_COLUMNS = [
  { label: "Order", width: "w-[264px]", numeric: false },
  { label: "Shop", width: "w-[152px]", numeric: false },
  { label: "Release", width: "w-[95px]", numeric: false },
  { label: "Items", width: "w-[88px]", numeric: true },
  { label: "Total", width: "w-[128px]", numeric: true },
  { label: "Status", width: "w-[136px]", numeric: false },
] as const satisfies readonly {
  readonly label: string;
  readonly width: string;
  readonly numeric: boolean;
}[];

export const images: readonly string[] = ORDERS.flatMap((order) =>
  order.image === null ? [] : [order.image],
);

function releaseLabel(release: Release, now: Date): string | null {
  if (release === null) return null;
  if ("fixed" in release) return release.fixed;
  const month = addMonths(startOfMonth(now), release.monthsFromNow);
  return format(setDate(month, Math.min(release.day, getDaysInMonth(month))), "MM/dd/yyyy");
}

const CELL_BUTTON =
  "-mx-2 inline-flex h-8 w-[calc(100%+1rem)] shrink-0 items-center gap-1.5 rounded-lg border border-transparent px-2 text-sm whitespace-nowrap text-foreground";

function Checkbox() {
  return (
    <span className="mb-0.5 flex size-4 shrink-0 rounded-xs border border-input dark:bg-input/30" />
  );
}

function Kpi({ title, value }: { readonly title: string; readonly value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <p className="eyebrow">{title}</p>
      <div className="flex items-baseline gap-2">
        <p className="display text-2xl leading-8 font-medium text-foreground tabular-nums">
          {value}
        </p>
      </div>
    </div>
  );
}

function Toolbar() {
  const outline = cn(buttonVariants({ variant: "outline" }));
  return (
    <div className="flex w-full items-center gap-2">
      <div className="flex flex-1 items-center gap-2">
        <div className="relative w-50">
          <HugeiconsIcon
            icon={Search01Icon}
            className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <div className="flex h-8 items-center rounded-full border border-transparent bg-muted ps-9 pe-3.5 text-sm text-muted-foreground">
            Search
          </div>
        </div>
        <ToolbarButton className={outline} icon={FilterIcon} label="Filters" />
        <ToolbarButton className={outline} icon={UnsortedIcon} label="Sort" />
        <ToolbarButton className={outline} icon={DragDropVerticalIcon} label="Columns" />
      </div>
      <div className="flex items-center gap-0.5 rounded-full bg-muted p-0.5">
        {VIEWS.map((icon, index) => (
          <span
            key={index}
            className={cn(
              "inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2.5",
              index === 0
                ? "bg-background text-foreground shadow-xs dark:bg-input"
                : "text-muted-foreground",
            )}
          >
            <HugeiconsIcon icon={icon} strokeWidth={2} className="size-4" />
          </span>
        ))}
      </div>
      <ToolbarButton
        className={cn(buttonVariants())}
        icon={Add01Icon}
        label="Add"
        strokeWidth={2}
      />
    </div>
  );
}

function ToolbarButton({
  className,
  icon,
  label,
  strokeWidth = 1.5,
}: {
  readonly className: string;
  readonly icon: IconSvgElement;
  readonly label: string;
  readonly strokeWidth?: number;
}) {
  return (
    <span className={className}>
      <HugeiconsIcon icon={icon} strokeWidth={strokeWidth} data-icon="inline-start" />
      {label}
    </span>
  );
}

const HEADER_CELL =
  "h-8 border-b border-border/70 px-2 text-left align-middle font-normal text-secondary-foreground/80";

function SortableHeader({ column }: { readonly column: (typeof SORTABLE_COLUMNS)[number] }) {
  return (
    <th
      aria-label={column.label}
      className={cn(HEADER_CELL, column.width, column.numeric && "pe-6")}
    >
      <div className={cn("flex h-full items-center", column.numeric && "justify-end")}>
        <span
          className={cn(
            "inline-flex h-6 items-center gap-1.5 rounded-lg border border-transparent px-2 whitespace-nowrap",
            column.numeric ? "-me-3 flex-row-reverse" : "-ms-2",
          )}
        >
          {column.label}
          <HugeiconsIcon icon={UnsortedIcon} strokeWidth={2} className="mt-px size-3.25" />
        </span>
      </div>
    </th>
  );
}

function Thumbnail({ order }: { readonly order: OrderRow }) {
  if (order.image === null) {
    return (
      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
        <HugeiconsIcon icon={PackageIcon} className="size-4" />
      </div>
    );
  }
  return (
    <div className="size-8 shrink-0 overflow-hidden rounded-md">
      <img alt={order.title} src={order.image} className="h-full w-full object-cover object-top" />
    </div>
  );
}

function Cell({
  className,
  children,
}: {
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return <td className={cn("px-2 py-1.5 align-middle", className)}>{children}</td>;
}

function OrderTableRow({ order, now }: { readonly order: OrderRow; readonly now: Date }) {
  const release = releaseLabel(order.release, now);
  return (
    <tr>
      <Cell>
        <Checkbox />
      </Cell>
      <Cell>
        <span className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}>
          <HugeiconsIcon icon={ExpandIcon} className="text-muted-foreground" />
        </span>
      </Cell>
      <Cell>
        <div className="flex items-center gap-3 pe-4">
          <Thumbnail order={order} />
          <div className="min-w-0 flex-1">
            <div className="relative inline-block w-full min-w-0">
              <span className={cn(CELL_BUTTON, "justify-start truncate text-left font-medium")}>
                <span className="truncate">{order.title}</span>
              </span>
            </div>
          </div>
          <span className="size-4.5 shrink-0" />
        </div>
      </Cell>
      <Cell>
        <div className="relative inline-block w-full min-w-0">
          <span className={cn(CELL_BUTTON, "justify-start truncate text-left")}>
            <span className="truncate">{order.shop}</span>
          </span>
        </div>
      </Cell>
      <Cell>
        <span className={cn(CELL_BUTTON, "justify-start font-medium")}>
          {release ?? (
            <span className="text-muted-foreground/60 dark:text-muted-foreground/40">—</span>
          )}
        </span>
      </Cell>
      <Cell className="pe-6 text-right tabular-nums">
        <span className={cn(buttonVariants({ variant: "ghost" }), "pr-0")}>{order.items}</span>
      </Cell>
      <Cell className="pe-6 text-right tabular-nums">
        <span className={cn(CELL_BUTTON, "justify-end font-medium")}>
          {usd.format(order.total)}
        </span>
      </Cell>
      <Cell>
        <div className="-mx-2 flex h-8 w-full items-center rounded-lg border border-transparent px-2 text-sm whitespace-nowrap">
          <span className="flex items-center gap-2">
            <span className={cn("size-1.5 rounded-full", STATUS_DOT[order.status])} />
            <span>{order.status}</span>
          </span>
        </div>
      </Cell>
      <Cell>
        <div className="flex justify-end">
          <span className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}>
            <HugeiconsIcon icon={MoreHorizontalIcon} />
          </span>
        </div>
      </Cell>
    </tr>
  );
}

/** The page the app shows at /orders, under the app frame. */
export function Screen({ now }: { readonly now: Date }) {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex min-h-9 items-center">
        <h1 className="page-title">Orders</h1>
      </div>
      <div className="grid grid-cols-4 gap-x-10 gap-y-5">
        {KPIS.map((kpi) => (
          <Kpi key={kpi.title} title={kpi.title} value={kpi.value} />
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        {QUICK_FILTERS.map((filter) => (
          <span
            key={filter}
            className={cn(
              "inline-flex h-7 min-w-7 items-center justify-center gap-1 rounded-full px-2.5 text-[0.8125rem] font-medium whitespace-nowrap",
              filter === "All" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
            )}
          >
            {filter}
          </span>
        ))}
      </div>
      <Toolbar />
      <div className="w-full min-w-0 overflow-hidden">
        <table className="w-[987px] min-w-full table-fixed border-separate border-spacing-0 text-sm text-foreground">
          <thead>
            <tr>
              <th className={cn(HEADER_CELL, "w-[28px] pe-0")}>
                <Checkbox />
              </th>
              <th aria-label="Expand" className={cn(HEADER_CELL, "w-[24px]")} />
              {SORTABLE_COLUMNS.map((column) => (
                <SortableHeader key={column.label} column={column} />
              ))}
              <th aria-label="Actions" className={cn(HEADER_CELL, "w-[72px]")} />
            </tr>
          </thead>
          <tbody>
            {ORDERS.map((order) => (
              <OrderTableRow key={order.title} order={order} now={now} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
