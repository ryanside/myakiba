import { useMemo } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import type { ColumnDef } from "@tanstack/react-table";
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
  ["name", "name"],
  ["itemCount", "count"],
  ["totalSpent", "spent"],
  ["shop", "shop"],
  ["scale", "scale"],
]);

const ROW_NUMBER_COLUMN_ID = "__rowNumber";

export function LeaderboardTable<TRow extends Record<string, CellValue>>({
  rows,
  columns,
  formatCell,
  rowIdKey,
  getRowNavigation,
  isLoading = false,
}: {
  readonly rows: readonly TRow[];
  readonly columns: readonly string[];
  readonly formatCell?: (column: string, value: CellValue) => CellValue;
  readonly rowIdKey: RowIdKey<TRow>;
  readonly getRowNavigation?: (row: TRow) => RowNavigation | undefined;
  readonly isLoading?: boolean;
}): ReactNode {
  const navigate = useNavigate();
  const tableData = useMemo(() => [...rows], [rows]);
  const tableColumns = useMemo<ColumnDef<TRow, CellValue>[]>(
    () => [
      {
        id: ROW_NUMBER_COLUMN_ID,
        header: "#",
        cell: ({ row }) => row.index + 1,
      },
      ...columns.map((column): ColumnDef<TRow, CellValue> => ({
        id: column,
        accessorFn: (row) => row[column] ?? null,
        header: COLUMN_LABELS.get(column) ?? column,
        cell: ({ getValue }) => {
          const value = getValue();

          return (formatCell ? formatCell(column, value) : value) ?? "—";
        },
      })),
    ],
    [columns, formatCell],
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
