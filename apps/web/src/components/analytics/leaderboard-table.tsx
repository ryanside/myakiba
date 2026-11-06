import { useMemo } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import type { ColumnDef } from "@tanstack/react-table";
import { ANALYTICS_LEADERBOARD_SIZE } from "@myakiba/contracts/analytics/schema";
import { cn } from "@/lib/utils";
import { DataTable, DATA_TABLE_NUMBER_META } from "@/components/data-table/data-table";

export interface RowNavigation {
  to: string;
  search?: Record<string, string | number | string[] | number[]>;
}

type CellValue = string | number | null;
type RowIdKey<TRow> = {
  [Key in keyof TRow]-?: TRow[Key] extends string | number ? Key : never;
}[keyof TRow];

type ColumnSpec = {
  readonly label: string;
  /** Number columns: [plain, with a bar] header widths and the figure's minimum width. */
  readonly number?: {
    readonly widths: readonly [string, string];
    readonly figureWidth: string;
  };
};

const COLUMN_SPECS = {
  name: { label: "Name" },
  shop: { label: "Shop" },
  scale: { label: "Scale" },
  // Bars only fit once the table has a full-width column, from lg; below that the figures stand alone.
  itemCount: {
    label: "Count",
    number: { widths: ["w-16", "w-16 lg:w-36"], figureWidth: "min-w-6" },
  },
  totalSpent: {
    label: "Spent",
    number: { widths: ["w-24", "w-24 lg:w-44"], figureWidth: "min-w-18" },
  },
} as const satisfies Readonly<Record<string, ColumnSpec>>;

export type LeaderboardColumn = keyof typeof COLUMN_SPECS;

const ROW_NUMBER_COLUMN_ID = "__rowNumber";

function leaderboardColumns<TRow extends Record<string, CellValue>>(
  columns: readonly LeaderboardColumn[],
  formatCell: ((column: string, value: CellValue) => CellValue) | undefined,
  barColumn: string,
  barMax: number,
): ColumnDef<TRow, CellValue>[] {
  return [
    {
      id: ROW_NUMBER_COLUMN_ID,
      header: "#",
      cell: ({ row }) => row.index + 1,
      meta: { headerClassName: "w-8" },
    },
    ...columns.map((column): ColumnDef<TRow, CellValue> => {
      const spec: ColumnSpec = COLUMN_SPECS[column];
      return {
        id: column,
        accessorFn: (row) => row[column] ?? null,
        header: spec.label,
        // Fixed widths keep every section's columns on the same lines.
        meta: spec.number
          ? {
              headerClassName: cn(
                DATA_TABLE_NUMBER_META.headerClassName,
                spec.number.widths[column === barColumn ? 1 : 0],
              ),
              cellClassName: DATA_TABLE_NUMBER_META.cellClassName,
            }
          : undefined,
        cell: ({ getValue }) => {
          const value = getValue();
          const shown = (formatCell ? formatCell(column, value) : value) ?? "—";
          if (!spec.number) {
            return (
              <span className="block truncate" title={String(shown)}>
                {shown}
              </span>
            );
          }
          if (column !== barColumn || barMax <= 0) return shown;

          return (
            <span className="inline-flex items-center justify-end gap-2">
              <span
                aria-hidden
                className="h-1.5 w-20 overflow-hidden rounded-full bg-foreground/10 max-lg:hidden"
              >
                <span
                  className="block h-full rounded-full bg-foreground/70"
                  style={{ width: `${(Number(value ?? 0) / barMax) * 100}%` }}
                />
              </span>
              {/* A fixed figure width keeps every bar starting on the same line. */}
              <span className={cn("inline-block", spec.number.figureWidth)}>{shown}</span>
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
  formatCell,
  rowIdKey,
  getRowNavigation,
  isLoading = false,
  rankedBy,
}: {
  readonly rows: readonly TRow[];
  readonly columns: readonly LeaderboardColumn[];
  readonly formatCell?: (column: string, value: CellValue) => CellValue;
  readonly rowIdKey: RowIdKey<TRow>;
  readonly getRowNavigation?: (row: TRow) => RowNavigation | undefined;
  readonly isLoading?: boolean;
  /** The column the rows are ranked by; its values get a proportional bar. */
  readonly rankedBy: "itemCount" | "totalSpent";
}): ReactNode {
  const navigate = useNavigate();
  // useReactTable takes a mutable array, so this copy only drops `readonly`.
  const tableData = useMemo(() => [...rows], [rows]);
  const barMax = useMemo(
    () => Math.max(0, ...tableData.map((row) => Number(row[rankedBy] ?? 0))),
    [rankedBy, tableData],
  );
  const tableColumns = useMemo(
    () => leaderboardColumns<TRow>(columns, formatCell, rankedBy, barMax),
    [barMax, columns, formatCell, rankedBy],
  );
  const table = useReactTable({
    data: tableData,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
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
