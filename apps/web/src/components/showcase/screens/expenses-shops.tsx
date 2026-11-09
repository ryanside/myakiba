import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { buttonVariants } from "@/components/ui/button";
import { ExpandIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { DATA_LAYER, Panel, usd } from "./expenses-panel";

type ShopRow = {
  readonly shop: string;
  readonly spend: number;
  readonly share: number;
  readonly items: number;
  readonly average: number;
};

type CategoryRow = {
  readonly category: string;
  readonly color: string;
  readonly count: number;
  readonly spend: number;
};

const ITEM_COUNT = 237;

const SHOPS: readonly ShopRow[] = [
  { shop: "AmiAmi", spend: 823_686, share: 45.2, items: 88, average: 9360 },
  { shop: "HobbyLink Japan", spend: 203_214, share: 11.1, items: 27, average: 7526 },
  { shop: "Plaza Japan", spend: 165_895, share: 9.1, items: 15, average: 11_060 },
  { shop: "Solaris Japan", spend: 145_021, share: 8, items: 17, average: 8531 },
  { shop: "Good Smile Online Shop", spend: 126_666, share: 6.9, items: 14, average: 9048 },
  { shop: "Nin-Nin-Game", spend: 100_385, share: 5.5, items: 11, average: 9126 },
];

const CATEGORIES: readonly CategoryRow[] = [
  { category: "Prepainted", color: "var(--category-prepainted)", count: 145, spend: 1_549_076 },
  { category: "Plushes", color: "var(--category-plushes)", count: 23, spend: 62_704 },
  { category: "Books", color: "var(--category-books)", count: 20, spend: 56_403 },
  { category: "Trading", color: "var(--category-trading)", count: 19, spend: 18_302 },
  { category: "Action/Dolls", color: "var(--category-action-dolls)", count: 9, spend: 63_776 },
  { category: "Model Kits", color: "var(--category-model-kits)", count: 8, spend: 36_332 },
  { category: "Misc", color: "var(--category-misc)", count: 6, spend: 10_320 },
  { category: "Hanged up", color: "var(--category-hanged-up)", count: 3, spend: 9465 },
  { category: "Linens", color: "var(--category-linens)", count: 3, spend: 13_980 },
  { category: "Music", color: "var(--category-music)", count: 1, spend: 2394 },
];

/** The rows the legend shows above the window's bottom edge; the rest are scrolled out of view. */
const LEGEND_ROWS = CATEGORIES.slice(0, 8);

const COLUMNS = [
  { label: "", size: 40, numeric: false },
  { label: "#", size: 40, numeric: false },
  { label: "Shop", size: 150, numeric: false },
  { label: "Spend", size: 96, numeric: true },
  { label: "Share", size: 72, numeric: true },
  { label: "Items", size: 64, numeric: true },
  { label: "Average Item Cost", size: 120, numeric: true },
] as const;

const TOTAL_SIZE = COLUMNS.reduce((sum, column) => sum + column.size, 0);

function ShopsPanel() {
  return (
    <Panel
      title="Shops"
      className="min-w-0"
      action={
        <div className="relative w-64 min-w-0">
          <HugeiconsIcon
            icon={Search01Icon}
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <div className="flex h-8 w-full min-w-0 items-center rounded-full border border-transparent bg-muted py-1 ps-9 pe-3.5 text-sm text-muted-foreground">
            Search shops...
          </div>
        </div>
      }
    >
      <div className="overflow-hidden">
        <table className="w-full min-w-150 table-fixed border-collapse text-xs">
          <thead>
            <tr>
              {COLUMNS.map((column) => (
                <th
                  key={column.label}
                  className={cn(
                    "border-b border-border/70 p-1.5 text-left font-medium text-muted-foreground",
                    column.numeric && "text-right",
                  )}
                  style={{ width: `${(column.size / TOTAL_SIZE) * 100}%` }}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SHOPS.map((row, index) => (
              <tr key={row.shop} className={DATA_LAYER}>
                <td className="p-1.5">
                  <span className={buttonVariants({ variant: "ghost", size: "icon-sm" })}>
                    <HugeiconsIcon icon={ExpandIcon} className="text-muted-foreground" />
                  </span>
                </td>
                <td className="p-1.5 text-muted-foreground">{index + 1}</td>
                <td className="p-1.5">{row.shop}</td>
                <td className="p-1.5 text-right tabular-nums">{usd(row.spend)}</td>
                <td className="p-1.5 text-right tabular-nums">{`${row.share.toFixed(1)}%`}</td>
                <td className="p-1.5 text-right tabular-nums">{row.items}</td>
                <td className="p-1.5 text-right tabular-nums">{usd(row.average)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function CategoryPanel() {
  return (
    <Panel title="Spend by category" className="min-h-80" panelClassName="flex flex-col gap-3">
      <div className="flex flex-1 flex-col gap-3">
        <div className={cn("flex h-2.5 w-full overflow-hidden rounded-sm", DATA_LAYER)}>
          {CATEGORIES.map((row) => (
            <div
              key={row.category}
              className="first:rounded-l-sm last:rounded-r-sm"
              style={{
                width: `${Math.max(3, (row.count / ITEM_COUNT) * 100)}%`,
                backgroundColor: row.color,
              }}
            />
          ))}
        </div>
        <div>
          <div className="-mx-3 flex max-h-50 flex-col overflow-hidden pb-4 [mask-image:linear-gradient(to_bottom,#000_0,#000_88%,transparent_100%)]">
            {LEGEND_ROWS.map((row) => (
              <div key={row.category} className="flex items-center gap-2.5 px-3 py-1">
                <div
                  className="h-4 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: row.color }}
                />
                <span className="truncate text-sm">{row.category}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {row.count}
                </span>
                <span className="ml-auto shrink-0 text-sm font-medium tabular-nums">
                  {usd(row.spend)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}

/** The shop table and the category breakdown under the KPI strip. */
export function ShopsAndCategories() {
  return (
    <div className="grid grid-cols-3 items-start gap-x-10 gap-y-6">
      <div className="col-span-2 min-w-0">
        <ShopsPanel />
      </div>
      <CategoryPanel />
    </div>
  );
}
