import { addMonths, format, max, setDate, startOfMonth, subDays } from "date-fns";
import { PackageIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";

type OrderDates = {
  readonly release: Date | null;
  readonly ordered: Date | null;
  readonly paid: Date | null;
  readonly shipped: Date | null;
  readonly collected: Date | null;
};

type KanbanOrder = {
  readonly title: string;
  readonly shop: string;
  readonly total: number;
  readonly image: string | null;
  /** Null for an order the bottom edge cuts before its dates. */
  readonly dates: OrderDates | null;
};

type KanbanColumn = {
  readonly title: string;
  readonly color: string;
  readonly count: number;
  readonly orders: readonly KanbanOrder[];
};

const DATE_LABELS = [
  ["release", "Release"],
  ["ordered", "Ordered"],
  ["paid", "Paid"],
  ["shipped", "Shipped"],
  ["collected", "Collected"],
] as const satisfies readonly (readonly [keyof OrderDates, string])[];

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function columnsAt(now: Date): readonly KanbanColumn[] {
  /** A day in the month `offset` months from now. */
  const on = (offset: number, day: number) => setDate(addMonths(startOfMonth(now), offset), day);
  /** A day this month, `days` before today but never before the month began. */
  const recent = (days: number) => max([startOfMonth(now), subDays(now, days)]);
  const none = { release: null, ordered: null, paid: null, shipped: null, collected: null };

  return [
    {
      title: "Ordered",
      color: "bg-info",
      count: 14,
      orders: [
        {
          title: "Miku V3 1/4 B-style",
          shop: "AmiAmi",
          total: 180,
          image: "/example-item2.webp",
          dates: { ...none, release: on(0, 26), ordered: on(-9, 14) },
        },
        {
          title: "Hatsune Miku - 1/7 - Shaohua Ver. (Myethos)",
          shop: "BigInJapan",
          total: 189.99,
          image: "/example-item4.webp",
          dates: null,
        },
      ],
    },
    {
      title: "Paid",
      color: "bg-warning",
      count: 4,
      orders: [
        {
          title: "Saya 1/7 (Wing)",
          shop: "AmiAmi",
          total: 142.8,
          image: "/example-item7.webp",
          dates: { ...none, release: on(0, 1), ordered: on(-2, 25), paid: on(-2, 25) },
        },
        {
          title: "Teto plushie",
          shop: "AmiAmi",
          total: 29.33,
          image: "/example-item3.webp",
          dates: null,
        },
      ],
    },
    {
      title: "Shipped",
      color: "bg-violet-500",
      count: 1,
      orders: [
        {
          title: "Prize figure lot",
          shop: "Buyee",
          total: 81.21,
          image: null,
          dates: { ...none, ordered: on(-1, 8), paid: on(-1, 9), shipped: recent(2) },
        },
      ],
    },
    {
      title: "Owned",
      color: "bg-success",
      count: 14,
      orders: [
        {
          title: "Soejima art book (used)",
          shop: "Mandarake",
          total: 51.88,
          image: "/example-item1.webp",
          dates: {
            release: new Date(2010, 7, 1),
            ordered: on(-3, 27),
            paid: on(-3, 27),
            shipped: on(-2, 1),
            collected: on(-2, 9),
          },
        },
        {
          title: "Yae Miko - 1/7 - Great Guuji of the Grand Narukami Shrine (APEX)",
          shop: "Solaris Japan",
          total: 223.64,
          image: null,
          dates: null,
        },
      ],
    },
  ];
}

function Thumbnail({ order }: { readonly order: KanbanOrder }) {
  const className = "size-12 shrink-0 overflow-hidden rounded-inner";
  if (order.image === null) {
    return (
      <div className={cn(className, "flex items-center justify-center bg-muted")}>
        <HugeiconsIcon icon={PackageIcon} className="size-4 text-muted-foreground" />
      </div>
    );
  }
  return (
    <div className={className}>
      <img
        alt={order.title}
        src={order.image}
        className="h-full w-full object-cover object-top outline outline-black/10 dark:outline-white/10"
      />
    </div>
  );
}

function DateRows({ dates }: { readonly dates: OrderDates }) {
  return (
    <div className="-mx-1.5 flex flex-col">
      {DATE_LABELS.map(([field, label]) => {
        const date = dates[field];
        return (
          <div key={field}>
            <span className="inline-flex h-auto w-full shrink-0 items-center justify-between gap-2 rounded border border-transparent px-1.5 py-1 text-left text-sm font-normal whitespace-nowrap text-foreground">
              <span className="shrink-0 text-xs font-medium text-muted-foreground">{label}</span>
              <span
                className={cn(
                  "text-xs tabular-nums",
                  date === null ? "text-muted-foreground" : "text-foreground",
                )}
              >
                {date === null ? "—" : format(date, "MM/dd/yyyy")}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function OrderCard({ order }: { readonly order: KanbanOrder }) {
  return (
    <div className="relative rounded-(--radius-outer) border border-(--tile-edge) bg-card p-3 shadow-[0_1px_1px_oklch(0_0_0/0.03)] [--inset:calc(--spacing(3)+1px)] [--radius-outer:var(--radius-xl)] dark:shadow-none">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2.5">
          <Thumbnail order={order} />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="line-clamp-1 text-sm leading-tight font-medium">{order.title}</span>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="truncate">{order.shop}</span>
              <span className="ml-auto shrink-0 font-medium text-foreground tabular-nums">
                {usd.format(order.total)}
              </span>
            </div>
          </div>
        </div>
        {order.dates === null ? null : <DateRows dates={order.dates} />}
      </div>
    </div>
  );
}

export function OrderKanban({ now }: { readonly now: Date }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2.5">
        <h2 className="text-[1.0625rem] font-medium tracking-tight">In progress</h2>
        <p className="text-sm text-muted-foreground">Recent and upcoming</p>
      </div>
      <div className="grid grid-cols-4 gap-3">
        {columnsAt(now).map((column) => (
          <div key={column.title} className="flex flex-col">
            <header className="flex flex-row items-center gap-2 px-0.5 pb-2">
              <div className={cn("size-2 rounded-full", column.color)} />
              <h2 className="text-sm font-medium">{column.title}</h2>
              <span className="relative ml-auto inline-flex h-5 w-fit min-w-5 shrink-0 items-center justify-center gap-1 rounded-sm border border-border bg-transparent px-1.5 py-0.25 text-xs leading-none font-medium whitespace-nowrap tabular-nums dark:bg-input/32">
                {column.count}
              </span>
            </header>
            <div className="flex flex-col gap-2 p-0.5">
              {column.orders.map((order) => (
                <OrderCard key={order.title} order={order} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
