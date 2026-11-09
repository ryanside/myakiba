import { OrderKanban } from "./dashboard-kanban";
import { CollectionBreakdown, OrdersBarChart, ReleaseCalendar } from "./dashboard-panels";

/** Pictures the screen shows. */
export const images: readonly string[] = [
  "/example-item1.webp",
  "/example-item2.webp",
  "/example-item3.webp",
  "/example-item4.webp",
  "/example-item7.webp",
];

const KPIS = [
  { title: "Total Items", value: "237", detail: null },
  { title: "Total Spent", value: "$22,728.27", detail: null },
  { title: "Active Orders", value: "28", detail: "23 unpaid" },
  { title: "Unpaid Costs", value: "$2,556.70", detail: null },
] as const satisfies readonly {
  readonly title: string;
  readonly value: string;
  readonly detail: string | null;
}[];

function Header() {
  return (
    <div className="flex flex-row flex-wrap items-center gap-4">
      <h1 className="page-title">
        Welcome back, akiba{" "}
        <span className="text-[0.8em] font-normal text-muted-foreground">(˶˃ ᵕ ˂˶)</span>
      </h1>
      <div className="ml-auto inline-flex h-8 w-fit shrink-0 items-center justify-center rounded-full bg-muted p-[3px] text-muted-foreground">
        <span className="relative inline-flex h-full flex-1 items-center justify-center gap-1.5 rounded-full border border-transparent bg-background px-3 py-0.5 text-sm font-medium whitespace-nowrap text-foreground shadow-sm dark:bg-input">
          Overview
        </span>
        <span className="relative inline-flex h-full flex-1 items-center justify-center gap-1.5 rounded-full border border-transparent px-3 py-0.5 text-sm font-medium whitespace-nowrap text-muted-foreground">
          Monthly
        </span>
      </div>
    </div>
  );
}

function Kpis() {
  return (
    <div className="grid grid-cols-4 gap-x-10 gap-y-5">
      {KPIS.map((kpi) => (
        <div key={kpi.title} className="flex min-w-0 flex-col gap-0.5">
          <p className="eyebrow">{kpi.title}</p>
          <div className="flex items-baseline gap-2">
            <p className="display text-2xl leading-8 font-medium text-foreground tabular-nums">
              {kpi.value}
            </p>
            {kpi.detail === null ? null : (
              <p className="text-[0.8125rem] text-muted-foreground tabular-nums">{kpi.detail}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/** The page the app shows at /dashboard, under the app frame. */
export function Screen({ now }: { readonly now: Date }) {
  return (
    <div className="mx-auto flex max-w-[88rem] flex-col gap-8">
      <Header />
      <div className="flex flex-col gap-8 text-base">
        <Kpis />
        <div className="mt-2 grid grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1fr)] gap-x-10 gap-y-6">
          <CollectionBreakdown />
          <OrdersBarChart now={now} />
          <ReleaseCalendar now={now} />
        </div>
        <OrderKanban now={now} />
      </div>
    </div>
  );
}
