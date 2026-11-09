import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { buttonVariants } from "@/components/ui/button";
import { BackIcon, ExpandIcon, UnsortedIcon } from "@/lib/icons";
import { money, SectionShell } from "./analytics-parts";

type OriginRow = { readonly name: string; readonly count: number; readonly spent: number };

const UNIQUE_ORIGINS = 46;
const TOTAL_ITEMS = 225;
const TOTAL_SPENT = 18_060.65;

const KPIS = [
  { label: "Unique", value: String(UNIQUE_ORIGINS) },
  { label: "Total Items", value: String(TOTAL_ITEMS) },
  { label: "Total Spent", value: money(TOTAL_SPENT) },
  { label: "Avg. Spent", value: money(TOTAL_SPENT / TOTAL_ITEMS) },
] as const;

// The app renders the colon as its own text node, which moves the value by a subpixel.
const COLON = ":";

const ORIGINS: readonly OriginRow[] = [
  { name: "Vocaloid", count: 65, spent: 4597.81 },
  { name: "Re:Zero kara Hajimeru Isekai Seikatsu", count: 22, spent: 1710.91 },
  { name: "Mahou Shoujo Madoka☆Magica", count: 18, spent: 1114.88 },
  { name: "Kono Subarashii Sekai ni Shukufuku o!", count: 16, spent: 1321.81 },
  { name: "Persona 5", count: 10, spent: 734.25 },
  { name: "Bocchi the Rock!", count: 7, spent: 395.7 },
  { name: "Spy × Family", count: 7, spent: 330.5 },
  { name: "Fate/Grand Order", count: 6, spent: 935.26 },
  { name: "Genshin Impact", count: 5, spent: 680.92 },
  { name: "Good Smile Racing", count: 4, spent: 450.83 },
  { name: "Kimetsu no Yaiba", count: 4, spent: 440.84 },
  { name: "Lycoris Recoil", count: 4, spent: 388.61 },
  { name: "Persona 3", count: 4, spent: 281.41 },
  { name: "Frame Arms Girl", count: 4, spent: 179.52 },
  { name: "Sousou no Frieren", count: 4, spent: 114.06 },
];

const COLUMNS = [
  { title: null, size: 40 },
  { title: "#", size: 40 },
  { title: "name", size: 150, sortable: true },
  { title: "count", size: 80, sortable: true },
  { title: "spent", size: 100, sortable: true },
] as const;

const TOTAL_SIZE = COLUMNS.reduce((sum, column) => sum + column.size, 0);

function HeaderCell({ column }: { readonly column: (typeof COLUMNS)[number] }) {
  return (
    <th
      className="border-b border-border/70 p-1.5 text-left font-medium text-muted-foreground"
      style={{ width: `${(column.size / TOTAL_SIZE) * 100}%` }}
    >
      {"sortable" in column ? (
        <span className="-my-1.5 inline-flex min-h-10 items-center gap-1.5 text-left">
          <span>{column.title}</span>
          <span className="inline-flex">
            <HugeiconsIcon icon={UnsortedIcon} strokeWidth={2} className="size-3.5" />
          </span>
        </span>
      ) : (
        column.title
      )}
    </th>
  );
}

function OriginsTable() {
  return (
    <table className="w-full border-collapse text-xs table-fixed">
      <thead>
        <tr>
          {COLUMNS.map((column) => (
            <HeaderCell key={column.size + (column.title ?? "")} column={column} />
          ))}
        </tr>
      </thead>
      <tbody>
        {ORIGINS.map((row, index) => (
          <tr key={row.name}>
            <td className="p-1.5">
              <span className={buttonVariants({ variant: "ghost", size: "icon-sm" })}>
                <HugeiconsIcon icon={ExpandIcon} className="text-muted-foreground" />
              </span>
            </td>
            <td className="p-1.5 text-muted-foreground tabular-nums">{index + 1}</td>
            <td className="p-1.5">{row.name}</td>
            <td className="p-1.5 tabular-nums">{row.count}</td>
            <td className="p-1.5 tabular-nums">{money(row.spent)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export const images: readonly string[] = [];

export function Screen({ now: _now }: { readonly now: Date }) {
  return (
    <div className="flex flex-col gap-6 mx-auto max-w-[88rem]">
      <div className="flex flex-col gap-4">
        <span className="relative flex items-center gap-1.5 w-fit py-2.5 -mb-1 text-xs text-muted-foreground decorative">
          <HugeiconsIcon icon={BackIcon} className="size-3.5 shrink-0" />
          Back
        </span>
        <h1 className="text-2xl font-orbitron font-medium lowercase">Origins ⭑.ᐟ</h1>
      </div>
      <div className="grid grid-cols-4 gap-x-6 gap-y-2">
        {KPIS.map((kpi) => (
          <p key={kpi.label} className="text-muted-foreground font-orbitron lowercase">
            {kpi.label}
            {COLON} <span className="font-medium text-foreground">{kpi.value}</span>
          </p>
        ))}
      </div>
      <SectionShell color="var(--chart-3)" className="h-[1101px] space-y-4">
        <div className="relative flex flex-row items-center justify-between gap-3">
          <h3 className="text-sm font-medium font-orbitron lowercase">All Origins</h3>
          <div className="relative w-64">
            <HugeiconsIcon
              icon={Search01Icon}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
            />
            <div className="flex h-8 w-full items-center rounded-xl border border-input bg-transparent pr-2.5 pl-8 py-1 text-sm text-muted-foreground dark:bg-input/30">
              Search origins...
            </div>
          </div>
        </div>
        <div className="relative">
          <OriginsTable />
        </div>
      </SectionShell>
    </div>
  );
}
