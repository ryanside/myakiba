import { Calendar01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { buttonVariants } from "@/components/ui/button";
import { DisclosureIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { CumulativeChart } from "./expenses-chart";
import { DATA_LAYER, Panel, usd } from "./expenses-panel";
import { ShopsAndCategories } from "./expenses-shops";

/** Pictures the screen shows. */
export const images: readonly string[] = [];

const TABS = ["Collection", "Orders", "Shipping"] as const;
const ACTIVE_TAB = "Collection" satisfies (typeof TABS)[number];

const DATE_PRESETS = ["3M", "6M", "12M", "24M", "All time"] as const;
const ACTIVE_PRESET = "All time" satisfies (typeof DATE_PRESETS)[number];

const SPEND = 1_822_752;

const SPLITS = [
  { label: "Order-linked", spend: 1_153_276, items: 130 },
  { label: "Standalone", spend: 669_476, items: 107 },
] as const;

const KPIS = [
  { title: "Collection Items", value: "237" },
  { title: "Average Item Cost", value: usd(7691) },
  { title: "Shops", value: "20" },
] as const;

function Tabs() {
  return (
    <div className="inline-flex h-8 w-fit items-center justify-center rounded-full bg-muted p-[3px] text-muted-foreground">
      {TABS.map((tab) => (
        <span
          key={tab}
          className={cn(
            "relative inline-flex h-full flex-1 items-center justify-center gap-1.5 rounded-full border border-transparent px-3 py-0.5 text-sm font-medium whitespace-nowrap text-muted-foreground",
            tab === ACTIVE_TAB && "bg-background text-foreground shadow-sm dark:bg-input",
          )}
        >
          {tab}
        </span>
      ))}
    </div>
  );
}

function DateField({ placeholder }: { readonly placeholder: string }) {
  return (
    <div className="flex w-36 shrink-0 flex-col">
      <span
        className={cn(
          buttonVariants({ variant: "outline" }),
          "w-full min-w-0 justify-start overflow-hidden text-left font-normal text-muted-foreground",
        )}
      >
        <HugeiconsIcon icon={Calendar01Icon} data-icon="inline-start" className="shrink-0" />
        <span className="min-w-0 flex-1 truncate">{placeholder}</span>
      </span>
    </div>
  );
}

function Filters() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex w-fit flex-row items-center gap-0.5 rounded-full bg-muted p-0.5">
        {DATE_PRESETS.map((preset) => (
          <span
            key={preset}
            className={cn(
              "inline-flex h-7 min-w-7 shrink-0 items-center justify-center gap-1 rounded-full px-3 text-sm font-medium whitespace-nowrap text-muted-foreground",
              preset === ACTIVE_PRESET && "bg-background text-foreground shadow-xs dark:bg-input",
            )}
          >
            {preset}
          </span>
        ))}
      </div>
      <DateField placeholder="Start date" />
      <DateField placeholder="End date" />
      <div className="flex w-36 shrink-0 flex-col">
        <span className={cn(buttonVariants({ variant: "outline" }), "w-full justify-between")}>
          Shops
          <HugeiconsIcon icon={DisclosureIcon} data-icon="inline-end" />
        </span>
      </div>
    </div>
  );
}

function Summary() {
  return (
    <Panel title="Summary" className="h-[340px]">
      <div className="flex h-full flex-col gap-8">
        <div className="flex flex-col gap-1">
          <p className="eyebrow">Collection Spend</p>
          <p className={cn("display text-3xl font-medium tabular-nums", DATA_LAYER)}>
            {usd(SPEND)}
          </p>
        </div>
        <div className="flex flex-col gap-5">
          {SPLITS.map((split) => {
            const share = (split.spend / SPEND) * 100;
            return (
              <div key={split.label} className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-4 text-sm">
                  <span>{split.label}</span>
                  <span className={cn("font-medium tabular-nums", DATA_LAYER)}>
                    {usd(split.spend)}
                  </span>
                </div>
                <div
                  className={cn(
                    "relative flex h-1 w-full items-center overflow-x-hidden rounded-full bg-muted",
                    DATA_LAYER,
                  )}
                >
                  <div className="h-full bg-primary" style={{ width: `${share}%` }} />
                </div>
                <p
                  className={cn(
                    "flex justify-between gap-4 text-xs text-muted-foreground tabular-nums",
                    DATA_LAYER,
                  )}
                >
                  <span>{split.items} items</span>
                  <span>{share.toFixed(1)}% of spend</span>
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}

function ChartPanel({ now }: { readonly now: Date }) {
  return (
    <Panel
      title="Collection spending"
      className="h-[340px]"
      panelClassName="flex min-h-0 flex-1 flex-col gap-1"
      action={
        <span className="flex h-8 w-44 items-center justify-between gap-1.5 rounded-full border border-input bg-transparent py-2 pr-2.5 pl-3 text-sm whitespace-nowrap dark:bg-input/30">
          <span className="flex flex-1 items-center gap-1.5 text-left">Cumulative</span>
          <HugeiconsIcon
            icon={DisclosureIcon}
            strokeWidth={2}
            className="size-4 shrink-0 text-muted-foreground"
          />
        </span>
      }
    >
      <CumulativeChart now={now} />
    </Panel>
  );
}

function KpiStrip() {
  return (
    <div className="relative -mx-3 flex flex-col">
      <div className="relative flex grow gap-10 overflow-hidden rounded-2xl p-3 pt-0">
        {KPIS.map((kpi) => (
          <div key={kpi.title} className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p className="text-xs text-muted-foreground">{kpi.title}</p>
            <p className={cn("text-base font-medium tabular-nums", DATA_LAYER)}>
              <span>{kpi.value}</span>
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The page the app shows at /expenses, under the app frame. */
export function Screen({ now }: { readonly now: Date }) {
  return (
    <div className="mx-auto flex max-w-[88rem] flex-col gap-8">
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <div className="flex items-center gap-1.5">
            <h1 className="page-title min-w-0 break-words">Expenses</h1>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-4">
        <div className="flex flex-row items-center justify-between gap-3">
          <Tabs />
          <Filters />
        </div>
        <div className="flex-1 text-sm">
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-3 items-stretch gap-x-10 gap-y-6">
              <Summary />
              <div className="col-span-2 min-w-0">
                <ChartPanel now={now} />
              </div>
            </div>
            <KpiStrip />
            <ShopsAndCategories />
          </div>
        </div>
      </div>
    </div>
  );
}
