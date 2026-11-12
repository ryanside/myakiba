import type { ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
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
import { addDays, addMonths, format, max, min, setDate, startOfMonth, subDays } from "date-fns";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { buttonVariants } from "@/components/ui/button";
import { toggleVariants } from "@/components/ui/toggle";
import { UnsortedIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";

type Category = "Books" | "Misc" | "Prepainted";

interface CollectionRow {
  readonly title: string;
  readonly mfcId: number | null;
  readonly category: Category;
  readonly image: string | null;
  readonly score: string | null;
  readonly price: number;
  readonly shop: string;
  readonly collected: (now: Date) => Date;
}

/** A day in the month `offset` months from now. */
const dayOf = (now: Date, offset: number, day: number): Date =>
  setDate(addMonths(startOfMonth(now), offset), day);

/** A day this month, `days` before today but never before the month began. */
const recent = (now: Date, days: number): Date => max([startOfMonth(now), subDays(now, days)]);

/** When a parcel shipped last month arrived: `days` after it shipped, never after yesterday. */
const arrived = (now: Date, shippedDay: number, days: number): Date =>
  min([addDays(dayOf(now, -1, shippedDay), days), recent(now, 1)]);

const KPIS = [
  { title: "Total Items", value: "237" },
  { title: "Item Spend", value: "$18,227.52" },
  { title: "Added This Month", value: "5" },
  { title: "Average Cost", value: "$76.91" },
] as const;

const QUICK_FILTERS = ["All", "Figures", "Goods", "Media"] as const;

const VIEW_MODES: readonly IconSvgElement[] = [
  LeftToRightListDashIcon,
  Menu01Icon,
  GridViewIcon,
  Image01Icon,
];

const CATEGORY_COLORS = {
  Books: "var(--category-books)",
  Misc: "var(--category-misc)",
  Prepainted: "var(--category-prepainted)",
} as const satisfies Record<Category, string>;

const ROWS: readonly CollectionRow[] = [
  {
    title: "Persona 3 fan book",
    mfcId: null,
    category: "Books",
    image: null,
    score: null,
    price: 1074,
    shop: "BOOTH",
    collected: (now) => recent(now, 2),
  },
  {
    title: "Blue Archive fan book",
    mfcId: null,
    category: "Books",
    image: null,
    score: null,
    price: 1342,
    shop: "BOOTH",
    collected: (now) => recent(now, 2),
  },
  {
    title: "Frieren fan book",
    mfcId: null,
    category: "Books",
    image: null,
    score: null,
    price: 1208,
    shop: "BOOTH",
    collected: (now) => recent(now, 2),
  },
  {
    title: "Mahou Shoujo Madoka☆Magica - Ultimate Madoka - 1/8 (Good Smile Company)",
    mfcId: 98_665,
    category: "Prepainted",
    image: "/example-item6.webp",
    score: "8.5",
    price: 11_275,
    shop: "AmiAmi",
    collected: (now) => arrived(now, 17, 17),
  },
  {
    title: "Miku birthday clear file",
    mfcId: null,
    category: "Misc",
    image: null,
    score: "7.5",
    price: 1930,
    shop: "Otaku Republic",
    collected: (now) => dayOf(now, -1, 9),
  },
  {
    title: "Miku birthday postcard set",
    mfcId: null,
    category: "Misc",
    image: null,
    score: "9.0",
    price: 1650,
    shop: "Otaku Republic",
    collected: (now) => dayOf(now, -1, 9),
  },
  {
    title: "Miku birthday acrylic stand",
    mfcId: null,
    category: "Misc",
    image: null,
    score: null,
    price: 1870,
    shop: "Otaku Republic",
    collected: (now) => dayOf(now, -1, 9),
  },
  {
    title: "Miku birthday can badge set",
    mfcId: null,
    category: "Misc",
    image: null,
    score: null,
    price: 2390,
    shop: "Otaku Republic",
    collected: (now) => dayOf(now, -1, 9),
  },
  {
    title:
      "Soejima Shigenori - Persona 3 - Persona 4 - Art Book - Shigenori Soejima Art Works 2004-2010 (Enterbrain)",
    mfcId: 43_590,
    category: "Books",
    image: "/example-item1.webp",
    score: null,
    price: 2819,
    shop: "Mandarake",
    collected: (now) => dayOf(now, -2, 9),
  },
  {
    title: "Fern acrylic stand (animate cafe)",
    mfcId: null,
    category: "Misc",
    image: null,
    score: "10.0",
    price: 1240,
    shop: "Animate",
    collected: (now) => dayOf(now, -1, 8),
  },
  {
    title: "Frieren acrylic stand (animate cafe)",
    mfcId: null,
    category: "Misc",
    image: null,
    score: null,
    price: 1240,
    shop: "Animate",
    collected: (now) => dayOf(now, -1, 8),
  },
];

/** Pictures the screen shows. */
export const images: readonly string[] = ROWS.flatMap((row) => (row.image ? [row.image] : []));

const HEADER_CELL =
  "relative z-0 h-8 border-b border-border/70 px-2 align-middle font-normal text-secondary-foreground/80";
const NUMERIC_HEADER_CELL = cn(HEADER_CELL, "truncate pe-6");
const BODY_CELL = "relative z-0 px-2 py-1.5 align-middle";
const NUMERIC_BODY_CELL = cn(BODY_CELL, "truncate pe-6 text-right tabular-nums");
const CELL_BUTTON = cn(
  buttonVariants({ variant: "ghost" }),
  "-mx-2 h-8 w-[calc(100%+1rem)] rounded-lg px-2 justify-start text-foreground",
);

function Checkbox(): ReactNode {
  return (
    <span className="relative mb-0.5 flex size-4 shrink-0 items-center justify-center rounded-xs border border-input dark:bg-input/30" />
  );
}

function OutlineButton({
  icon,
  children,
}: {
  readonly icon: IconSvgElement;
  readonly children: string;
}): ReactNode {
  return (
    <span className={cn(buttonVariants({ variant: "outline" }), "justify-between")}>
      <HugeiconsIcon icon={icon} data-icon="inline-start" />
      <span>{children}</span>
    </span>
  );
}

function ColumnHeader({
  title,
  numeric = false,
}: {
  readonly title: string;
  readonly numeric?: boolean;
}): ReactNode {
  return (
    <div
      className={cn("flex h-full items-center justify-between gap-1.5", numeric && "justify-end")}
    >
      <span
        className={cn(
          buttonVariants({ variant: "ghost", size: "xs" }),
          "-ms-2 gap-1.5 rounded-lg px-2 text-sm font-normal text-secondary-foreground/80 has-data-[icon=inline-end]:pr-2",
          numeric && "-me-3 ms-0 flex-row-reverse",
        )}
      >
        {title}
        <span data-icon="inline-end" className="mt-px inline-flex">
          <HugeiconsIcon icon={UnsortedIcon} strokeWidth={2} className="size-3.25" />
        </span>
      </span>
    </div>
  );
}

function EmptyValue(): ReactNode {
  return <span className="text-muted-foreground/60 dark:text-muted-foreground/40">—</span>;
}

function Thumbnail({ row }: { readonly row: CollectionRow }): ReactNode {
  if (row.image === null) {
    return (
      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
        <HugeiconsIcon icon={PackageIcon} className="size-4" />
      </div>
    );
  }
  return (
    <div className="size-8 shrink-0 overflow-hidden rounded-md">
      <img src={row.image} alt={row.title} className="h-full w-full object-cover object-top" />
    </div>
  );
}

function Row({ row, now }: { readonly row: CollectionRow; readonly now: Date }): ReactNode {
  return (
    <tr className="will-change-transform">
      <td className={BODY_CELL}>
        <Checkbox />
      </td>
      <td className={cn(BODY_CELL, "truncate")}>
        <div className="flex items-center gap-3 pe-4">
          <Thumbnail row={row} />
          <div className="min-w-0 space-y-px">
            <span className="block truncate font-medium text-foreground">{row.title}</span>
            <div className="flex items-center gap-2 font-normal">
              <span className="text-xs text-muted-foreground">
                {row.mfcId === null ? "Custom" : `MFC #${row.mfcId}`}
              </span>
              <span
                className="block min-w-0 truncate text-xs leading-4"
                style={{ color: CATEGORY_COLORS[row.category] }}
              >
                {row.category}
              </span>
            </div>
          </div>
        </div>
      </td>
      <td className={NUMERIC_BODY_CELL}>
        <span className={cn(CELL_BUTTON, "justify-end")}>{row.score ?? <EmptyValue />}</span>
      </td>
      <td className={NUMERIC_BODY_CELL}>
        <span className={cn(CELL_BUTTON, "justify-end")}>
          {formatCurrencyFromMinorUnits(row.price, "USD", "en-US")}
        </span>
      </td>
      <td className={cn(BODY_CELL, "truncate")}>
        <span className={cn(CELL_BUTTON, "truncate text-left text-sm font-normal")}>
          {row.shop}
        </span>
      </td>
      <td className={cn(BODY_CELL, "truncate")}>
        <span className={CELL_BUTTON}>{format(row.collected(now), "MM/dd/yyyy")}</span>
      </td>
      <td className={BODY_CELL} aria-label="Row actions">
        <div className="flex items-center justify-end gap-0.5">
          <span className="size-7 shrink-0" />
          <span className={buttonVariants({ variant: "ghost", size: "icon-sm" })}>
            <HugeiconsIcon icon={MoreHorizontalIcon} />
          </span>
        </div>
      </td>
    </tr>
  );
}

/** The page the app shows at /collection, under the app frame. */
export function Screen({ now }: { readonly now: Date }) {
  return (
    <div className="mx-auto flex max-w-352 flex-col gap-8">
      <div className="flex min-h-9 items-center">
        <h1 className="page-title">Collection</h1>
      </div>
      <div className="grid grid-cols-4 gap-x-10 gap-y-5">
        {KPIS.map((kpi) => (
          <div key={kpi.title} className="flex min-w-0 flex-col gap-0.5">
            <p className="eyebrow">{kpi.title}</p>
            <div className="flex items-baseline gap-2">
              <p className="display text-2xl leading-8 font-medium text-foreground tabular-nums will-change-transform">
                {kpi.value}
              </p>
            </div>
          </div>
        ))}
      </div>
      <div className="flex w-fit items-center gap-1.5">
        {QUICK_FILTERS.map((label) => (
          <span
            key={label}
            data-pressed={label === "All" ? "" : null}
            className={cn("shrink-0", toggleVariants({ variant: "pill", size: "sm" }))}
          >
            {label}
          </span>
        ))}
      </div>
      <div className="flex w-full items-center gap-2">
        <div className="flex flex-1 items-center gap-2">
          <div className="flex min-w-0 items-center justify-start gap-2">
            <div className="relative w-50">
              <HugeiconsIcon
                icon={Search01Icon}
                className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <div className="flex h-8 w-full min-w-0 items-center rounded-full border border-transparent bg-muted py-1 ps-9 pe-3.5 text-sm text-muted-foreground">
                Search
              </div>
            </div>
            <OutlineButton icon={FilterIcon}>Filters</OutlineButton>
            <OutlineButton icon={UnsortedIcon}>Sort</OutlineButton>
          </div>
          <OutlineButton icon={DragDropVerticalIcon}>Columns</OutlineButton>
        </div>
        <div className="flex w-fit items-center gap-0.5 rounded-full bg-muted p-0.5">
          {VIEW_MODES.map((icon, index) => (
            <span
              key={index}
              data-pressed={index === 0 ? "" : null}
              className={cn("shrink-0", toggleVariants({ variant: "segmented", size: "sm" }))}
            >
              <HugeiconsIcon icon={icon} strokeWidth={2} />
            </span>
          ))}
        </div>
        <span className={cn(buttonVariants(), "ml-auto")}>
          <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" strokeWidth={2} />
          <span>Add</span>
        </span>
      </div>
      <table className="w-full will-change-transform table-fixed border-separate border-spacing-0 text-left align-middle text-sm font-normal text-foreground">
        <thead>
          <tr>
            <th className={cn(HEADER_CELL, "pe-0")} style={{ width: 32 }}>
              <Checkbox />
            </th>
            <th className={cn(HEADER_CELL, "truncate")} style={{ width: 420 }}>
              <ColumnHeader title="Item" />
            </th>
            <th className={NUMERIC_HEADER_CELL} style={{ width: 88 }}>
              <ColumnHeader title="Score" numeric />
            </th>
            <th className={NUMERIC_HEADER_CELL} style={{ width: 100 }}>
              <ColumnHeader title="Price" numeric />
            </th>
            <th className={cn(HEADER_CELL, "truncate")} style={{ width: 168 }}>
              <ColumnHeader title="Shop" />
            </th>
            <th className={cn(HEADER_CELL, "truncate")} style={{ width: 108 }}>
              <ColumnHeader title="Collected" />
            </th>
            <th className={HEADER_CELL} style={{ width: 72 }}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <Row key={row.title} row={row} now={now} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
