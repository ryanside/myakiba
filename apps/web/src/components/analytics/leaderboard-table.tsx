import { useMemo } from "react";
import type { ReactNode } from "react";
import { ArrowDown02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useNavigate } from "@tanstack/react-router";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import type { ColumnDef } from "@tanstack/react-table";
import { ANALYTICS_LEADERBOARD_SIZE } from "@myakiba/contracts/analytics/schema";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import { cn } from "@/lib/utils";
import {
  CellSkeleton,
  DataTable,
  DATA_TABLE_NUMBER_META,
  DATA_TABLE_SKELETON,
} from "@/components/data-table/data-table";

export interface RowNavigation {
  to: string;
  search?: Record<string, string | number | string[] | number[]>;
}

type CellValue = string | number | null;
type RankedBy = "itemCount" | "totalSpent";
type Preferences = Pick<ReturnType<typeof useUserPreferences>, "currency" | "locale">;
type RowIdKey<TRow> = {
  [Key in keyof TRow]-?: TRow[Key] extends string | number ? Key : never;
}[keyof TRow];

type ColumnSpec = {
  readonly label: string;
  /** The loading bar; text columns without one get DataTable's lines of text. */
  readonly skeleton?: ReactNode;
  /** Money columns hold minor units and show in the user's currency. */
  readonly format?: "money";
  /** Number columns: [plain, with a bar] header widths. */
  readonly number?: { readonly widths: readonly [string, string] };
};

const COLUMN_SPECS = {
  name: { label: "Name" },
  shop: { label: "Shop" },
  scale: { label: "Scale", skeleton: <CellSkeleton className="w-8" /> },
  // Bars only fit once the table has a full-width column, from lg; below that the figures stand alone.
  itemCount: {
    label: "Count",
    skeleton: DATA_TABLE_SKELETON.count,
    number: { widths: ["w-16", "w-16 lg:w-36"] },
  },
  totalSpent: {
    label: "Spent",
    format: "money",
    skeleton: DATA_TABLE_SKELETON.money,
    number: { widths: ["w-24", "w-24 lg:w-44"] },
  },
} as const satisfies Readonly<Record<string, ColumnSpec>>;

export type LeaderboardColumn = keyof typeof COLUMN_SPECS;

const ROW_NUMBER_COLUMN_ID = "__rowNumber";

function formatCell(
  spec: ColumnSpec,
  value: CellValue,
  { currency, locale }: Preferences,
): string | number {
  return (
    (spec.format === "money" && value !== null
      ? formatCurrencyFromMinorUnits(Number(value), currency, locale)
      : value) ?? "—"
  );
}

function leaderboardColumns<TRow extends Record<string, CellValue>>({
  columns,
  barColumn,
  barMax,
  widestBarFigure,
  currency,
  locale,
}: Preferences & {
  readonly columns: readonly LeaderboardColumn[];
  readonly barColumn: RankedBy;
  readonly barMax: number;
  readonly widestBarFigure: string;
}): ColumnDef<TRow, CellValue>[] {
  return [
    {
      id: ROW_NUMBER_COLUMN_ID,
      header: "#",
      cell: ({ row }) => row.index + 1,
      meta: { headerClassName: "w-8", skeleton: DATA_TABLE_SKELETON.rank },
    },
    ...columns.map((column): ColumnDef<TRow, CellValue> => {
      const spec: ColumnSpec = COLUMN_SPECS[column];
      return {
        id: column,
        accessorFn: (row) => row[column] ?? null,
        header: ({ column: tableColumn }) =>
          tableColumn.getIsSorted() === "desc" ? (
            <span className="flex items-center justify-end gap-1.5">
              {spec.label}
              <HugeiconsIcon icon={ArrowDown02Icon} strokeWidth={2} className="size-3.5 shrink-0" />
            </span>
          ) : (
            spec.label
          ),
        // Fixed widths keep every section's columns on the same lines.
        meta: spec.number
          ? {
              headerClassName: cn(
                DATA_TABLE_NUMBER_META.headerClassName,
                spec.number.widths[column === barColumn ? 1 : 0],
              ),
              cellClassName: cn(
                DATA_TABLE_NUMBER_META.cellClassName,
                column !== barColumn && "text-muted-foreground",
              ),
              skeleton: spec.skeleton,
            }
          : { skeleton: spec.skeleton },
        cell: ({ getValue }) => {
          const value = getValue();
          const shown = formatCell(spec, value, { currency, locale });
          if (!spec.number) {
            return (
              <span className="block truncate" title={String(shown)}>
                {shown}
              </span>
            );
          }
          if (column !== barColumn || barMax <= 0) return shown;

          return (
            <span className="flex items-center justify-end gap-1.5">
              <span
                aria-hidden
                className="h-1.5 w-20 overflow-hidden rounded-full bg-foreground/10 max-lg:hidden"
              >
                <span
                  className="block h-full rounded-full bg-foreground/70"
                  style={{ width: `${(Number(value ?? 0) / barMax) * 100}%` }}
                />
              </span>
              {/* Each figure reserves the widest figure's width, so the bars line up and sit against their figures. */}
              <span
                data-widest={widestBarFigure}
                className="inline-grid justify-items-end before:invisible before:col-start-1 before:row-start-1 before:content-[attr(data-widest)]"
              >
                <span className="col-start-1 row-start-1">{shown}</span>
              </span>
            </span>
          );
        },
      };
    }),
  ];
}

export function LeaderboardTable<TRow extends Record<string, CellValue>>({
  rows,
  columns,
  rowIdKey,
  getRowNavigation,
  isLoading = false,
  rankedBy,
}: {
  readonly rows: readonly TRow[];
  readonly columns: readonly LeaderboardColumn[];
  readonly rowIdKey: RowIdKey<TRow>;
  readonly getRowNavigation?: (row: TRow) => RowNavigation | undefined;
  readonly isLoading?: boolean;
  /** The column the rows are ranked by; its values get a proportional bar. */
  readonly rankedBy: RankedBy;
}): ReactNode {
  const navigate = useNavigate();
  const { currency, locale } = useUserPreferences();
  // useReactTable takes a mutable array, so this copy only drops `readonly`.
  const tableData = useMemo(() => [...rows], [rows]);
  const barMax = useMemo(
    () => Math.max(0, ...tableData.map((row) => Number(row[rankedBy] ?? 0))),
    [rankedBy, tableData],
  );
  const widestBarFigure = useMemo(
    () =>
      tableData
        .map((row) =>
          String(formatCell(COLUMN_SPECS[rankedBy], row[rankedBy] ?? null, { currency, locale })),
        )
        .reduce((widest, figure) => (figure.length > widest.length ? figure : widest), ""),
    [currency, locale, rankedBy, tableData],
  );
  const tableColumns = useMemo(
    () =>
      leaderboardColumns<TRow>({
        columns,
        barColumn: rankedBy,
        barMax,
        widestBarFigure,
        currency,
        locale,
      }),
    [barMax, columns, currency, locale, rankedBy, widestBarFigure],
  );
  const table = useReactTable({
    data: tableData,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
    // The rows arrive ranked; declaring the order marks the ranked header without re-sorting.
    manualSorting: true,
    state: { sorting: [{ id: rankedBy, desc: true }] },
    getRowId: (row) => String(row[rowIdKey]),
  });

  return (
    <DataTable
      table={table}
      tableClassName="table-fixed"
      isLoading={isLoading}
      skeletonRowCount={ANALYTICS_LEADERBOARD_SIZE}
      empty={<p className="text-muted-foreground text-xs">No data</p>}
      onRowClick={(row) => {
        const rowNav = getRowNavigation?.(row.original);

        if (rowNav) {
          navigate({ to: rowNav.to, search: rowNav.search });
        }
      }}
      getRowClassName={(row) => (getRowNavigation?.(row.original) ? undefined : "cursor-default")}
      getCellClassName={(_, columnId) =>
        columnId === ROW_NUMBER_COLUMN_ID ? "text-muted-foreground" : undefined
      }
    />
  );
}
