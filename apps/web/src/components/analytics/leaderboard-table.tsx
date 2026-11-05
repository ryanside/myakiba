import { useMemo } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import type { ColumnDef } from "@tanstack/react-table";
import { cn } from "@/lib/utils";
import { DataTable } from "@/components/data-table/data-table";

export interface RowNavigation {
  to: string;
  search?: Record<string, string | number | string[] | number[]>;
}

type CellValue = string | number | null;
type RowIdKey<TRow> = {
  [Key in keyof TRow]-?: TRow[Key] extends string | number ? Key : never;
}[keyof TRow];

const COLUMN_LABELS = new Map<string, string>([
  ["name", "Name"],
  ["itemCount", "Count"],
  ["totalSpent", "Spent"],
  ["shop", "Shop"],
  ["scale", "Scale"],
]);

const NUMERIC_COLUMNS: ReadonlySet<string> = new Set(["itemCount", "totalSpent"]);

// [plain, with a bar] widths for each number column.
const COLUMN_WIDTHS = {
  // Bars only fit once the table has a full-width column, from lg; below that the figures stand alone.
  itemCount: ["w-16", "w-16 lg:w-36"],
  totalSpent: ["w-24", "w-24 lg:w-44"],
} as const satisfies Readonly<Record<string, readonly [string, string]>>;

function columnWidth(column: string, withBar: boolean): string | undefined {
  if (column !== "itemCount" && column !== "totalSpent") return undefined;
  return COLUMN_WIDTHS[column][withBar ? 1 : 0];
}

const ROW_NUMBER_COLUMN_ID = "__rowNumber";

// The overview previews each ranking; "View all" opens the full table.
const PREVIEW_ROWS = 5;

function leaderboardColumns<TRow extends Record<string, CellValue>>(
  columns: readonly string[],
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
    ...columns.map((column): ColumnDef<TRow, CellValue> => ({
      id: column,
      accessorFn: (row) => row[column] ?? null,
      header: COLUMN_LABELS.get(column) ?? column,
      // Fixed widths keep every section's columns on the same lines.
      meta: NUMERIC_COLUMNS.has(column)
        ? {
            headerClassName: cn("text-right", columnWidth(column, column === barColumn)),
            cellClassName: "text-right tabular-nums",
          }
        : undefined,
      cell: ({ getValue }) => {
        const value = getValue();
        const shown = (formatCell ? formatCell(column, value) : value) ?? "—";
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
            <span className={cn("inline-block", column === "totalSpent" ? "min-w-18" : "min-w-6")}>
              {shown}
            </span>
          </span>
        );
      },
    })),
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
  readonly columns: readonly string[];
  readonly formatCell?: (column: string, value: CellValue) => CellValue;
  readonly rowIdKey: RowIdKey<TRow>;
  readonly getRowNavigation?: (row: TRow) => RowNavigation | undefined;
  readonly isLoading?: boolean;
  /** The column the rows are ranked by; its values get a proportional bar. */
  readonly rankedBy: "itemCount" | "totalSpent";
}): ReactNode {
  const navigate = useNavigate();
  const tableData = useMemo(() => rows.slice(0, PREVIEW_ROWS), [rows]);
  const barMax = useMemo(
    () => Math.max(0, ...rows.map((row) => Number(row[rankedBy] ?? 0))),
    [rankedBy, rows],
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
      empty={<p className="text-muted-foreground text-xs italic">No data</p>}
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
