import { HugeiconsIcon } from "@hugeicons/react";
import { NavigateIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { cents, money, SectionShell } from "./analytics-parts";

type LeaderRow = { readonly name: string; readonly count: number; readonly spent: number };

type Leaderboard = {
  readonly title: string;
  readonly unique: number;
  readonly color: string;
  readonly byCount: readonly LeaderRow[];
  readonly bySpend: readonly LeaderRow[];
};

const LEADERBOARDS: readonly Leaderboard[] = [
  {
    title: "Artists",
    unique: 127,
    color: "var(--chart-1)",
    byCount: [
      { name: "Nendoron", count: 20, spent: 801.15 },
      { name: "Asai (APSY) Masaki", count: 10, spent: 784.47 },
      { name: "Design Coco", count: 6, spent: 1004.09 },
      { name: "Pinpoint", count: 5, spent: 1005.99 },
      { name: "Luu", count: 5, spent: 761.45 },
    ],
    bySpend: [
      { name: "Pinpoint", count: 5, spent: 1005.99 },
      { name: "Design Coco", count: 6, spent: 1004.09 },
      { name: "Nendoron", count: 20, spent: 801.15 },
      { name: "Asai (APSY) Masaki", count: 10, spent: 784.47 },
      { name: "Luu", count: 5, spent: 761.45 },
    ],
  },
  {
    title: "Characters",
    unique: 85,
    color: "var(--chart-2)",
    byCount: [
      { name: "Hatsune Miku", count: 41, spent: 3343.7 },
      { name: "Rem", count: 9, spent: 848.14 },
      { name: "Megumin", count: 9, spent: 689.1 },
      { name: "Megurine Luka", count: 8, spent: 671.51 },
      { name: "Ram", count: 7, spent: 441.31 },
    ],
    bySpend: [
      { name: "Hatsune Miku", count: 41, spent: 3343.7 },
      { name: "Rem", count: 9, spent: 848.14 },
      { name: "Megumin", count: 9, spent: 689.1 },
      { name: "Megurine Luka", count: 8, spent: 671.51 },
      { name: "Altria Pendragon", count: 5, spent: 630.59 },
    ],
  },
  {
    title: "Origins",
    unique: 46,
    color: "var(--chart-3)",
    byCount: [
      { name: "Vocaloid", count: 65, spent: 4597.81 },
      { name: "Re:Zero kara Hajimeru Isekai Seikatsu", count: 22, spent: 1710.91 },
      { name: "Mahou Shoujo Madoka☆Magica", count: 18, spent: 1114.88 },
    ],
    bySpend: [
      { name: "Vocaloid", count: 65, spent: 4597.81 },
      { name: "Re:Zero kara Hajimeru Isekai Seikatsu", count: 22, spent: 1710.91 },
      { name: "Kono Subarashii Sekai ni Shukufuku o!", count: 16, spent: 1321.81 },
    ],
  },
];

type RankedBy = "count" | "spent";

// A row that has finished the app's fade-in still paints in its own opacity group,
// which changes how the bars' rounded ends are clipped.
const SETTLED_ROW = "opacity-[0.99999]";

const HEAD_CELL = "border-b border-border/70 p-1.5 font-medium text-muted-foreground";

const VALUE = {
  count: (row: LeaderRow) => row.count,
  spent: (row: LeaderRow) => cents(row.spent),
} as const satisfies Record<RankedBy, (row: LeaderRow) => number>;

const FIGURE = {
  count: (row: LeaderRow) => String(row.count),
  spent: (row: LeaderRow) => money(row.spent),
} as const satisfies Record<RankedBy, (row: LeaderRow) => string>;

function BarFigure({
  value,
  max,
  shown,
  widest,
}: {
  readonly value: number;
  readonly max: number;
  readonly shown: string;
  readonly widest: string;
}) {
  return (
    <span className="flex items-center justify-end gap-1.5">
      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-foreground/10">
        <span
          className="block h-full rounded-full bg-foreground/70"
          style={{ width: `${(value / max) * 100}%` }}
        />
      </span>
      <span
        data-widest={widest}
        className="inline-grid justify-items-end before:invisible before:col-start-1 before:row-start-1 before:content-[attr(data-widest)]"
      >
        <span className="col-start-1 row-start-1">{shown}</span>
      </span>
    </span>
  );
}

function NumberCell({
  row,
  column,
  rankedBy,
  max,
  widest,
}: {
  readonly row: LeaderRow;
  readonly column: RankedBy;
  readonly rankedBy: RankedBy;
  readonly max: number;
  readonly widest: string;
}) {
  const shown = FIGURE[column](row);
  return (
    <td
      className={cn(
        "p-1.5 text-right tabular-nums",
        column !== rankedBy && "text-muted-foreground",
      )}
    >
      {column === rankedBy ? (
        <BarFigure value={VALUE[column](row)} max={max} shown={shown} widest={widest} />
      ) : (
        shown
      )}
    </td>
  );
}

function LeaderboardTable({
  heading,
  rows,
  rankedBy,
}: {
  readonly heading: string;
  readonly rows: readonly LeaderRow[];
  readonly rankedBy: RankedBy;
}) {
  const max = Math.max(0, ...rows.map(VALUE[rankedBy]));
  const widest = rows
    .map(FIGURE[rankedBy])
    .reduce((wide, figure) => (figure.length > wide.length ? figure : wide), "");
  return (
    <div className="space-y-1">
      <h4 className="text-xs font-medium text-muted-foreground">{heading}</h4>
      <table className="w-full border-collapse text-xs table-fixed">
        <thead>
          <tr>
            <th className={cn(HEAD_CELL, "text-left w-8")}>#</th>
            <th className={cn(HEAD_CELL, "text-left")}>Name</th>
            <th className={cn(HEAD_CELL, "text-right", rankedBy === "count" ? "w-36" : "w-16")}>
              Count
            </th>
            <th className={cn(HEAD_CELL, "text-right", rankedBy === "spent" ? "w-44" : "w-24")}>
              Spent
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.name} className={SETTLED_ROW}>
              <td className="p-1.5 text-muted-foreground">{index + 1}</td>
              <td className="p-1.5">
                <span className="block truncate">{row.name}</span>
              </td>
              <NumberCell row={row} column="count" rankedBy={rankedBy} max={max} widest={widest} />
              <NumberCell row={row} column="spent" rankedBy={rankedBy} max={max} widest={widest} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LeaderboardSection({
  board,
  last,
}: {
  readonly board: Leaderboard;
  readonly last: boolean;
}) {
  return (
    <SectionShell color={board.color} className={cn("space-y-3", last && "h-[265px]")}>
      <div className="relative flex items-baseline lowercase justify-between">
        <h3 className="text-sm font-medium font-orbitron">{board.title}</h3>
        <span className="inline-flex items-baseline gap-1 text-xs text-muted-foreground font-orbitron">
          <span className="font-medium text-foreground tabular-nums">{board.unique}</span>
          <span>unique {board.title}</span>
        </span>
      </div>
      <div className="relative grid grid-cols-2 gap-4">
        <LeaderboardTable heading="Top by Count" rows={board.byCount} rankedBy="count" />
        <LeaderboardTable heading="Top by Spend" rows={board.bySpend} rankedBy="spent" />
      </div>
      {last ? null : (
        <span className="relative flex items-center gap-1.5 w-fit py-2.5 -mb-1 text-xs font-medium text-muted-foreground font-orbitron lowercase ml-auto">
          View all {board.title}
          <HugeiconsIcon icon={NavigateIcon} className="size-3.5 shrink-0" />
        </span>
      )}
    </SectionShell>
  );
}

export const images: readonly string[] = [];

export function Screen({ now: _now }: { readonly now: Date }) {
  return (
    <div className="flex flex-col gap-4 mx-auto max-w-[88rem]">
      <h1 className="mb-2 text-2xl font-orbitron font-medium">analytics ⭑.ᐟ</h1>
      <div className="flex flex-col gap-12">
        {LEADERBOARDS.map((board, index) => (
          <LeaderboardSection
            key={board.title}
            board={board}
            last={index === LEADERBOARDS.length - 1}
          />
        ))}
      </div>
    </div>
  );
}
