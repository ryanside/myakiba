import { useMemo } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import * as z from "zod";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table/data-table";

export interface RowNavigation {
  to: string;
  search?: Record<string, string | number | string[] | number[]>;
}

type CellValue = string | number | null;

const COLUMN_LABELS = new Map<string, string>([
  ["name", "name"],
  ["itemCount", "count"],
  ["totalSpent", "spent"],
  ["shop", "shop"],
  ["scale", "scale"],
]);

const ROW_NUMBER_COLUMN_ID = "__rowNumber";
const rowIdPartSchema = z.string().min(1);

export function LeaderboardTable<TRow extends Record<string, CellValue>>({
  rows,
  columns,
  formatCell,
  getRowNavigation,
  isLoading = false,
}: {
  readonly rows: readonly TRow[];
  readonly columns: readonly string[];
  readonly formatCell?: (column: string, value: CellValue) => CellValue;
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
      ...columns.map(
        (column): ColumnDef<TRow, CellValue> => ({
          id: column,
          accessorFn: (row) => row[column] ?? null,
          header: COLUMN_LABELS.get(column) ?? column,
          cell: ({ getValue }) => {
            const value = getValue();

            return (formatCell ? formatCell(column, value) : value) ?? "—";
          },
        }),
      ),
    ],
    [columns, formatCell],
  );
  const table = useReactTable({
    data: tableData,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row, index) => {
      const entryId = rowIdPartSchema.safeParse(row.entryId);
      if (entryId.success) {
        return `entry-${entryId.data}`;
      }

      const shop = rowIdPartSchema.safeParse(row.shop);
      if (shop.success) {
        return `shop-${shop.data}`;
      }

      const scale = rowIdPartSchema.safeParse(row.scale);
      if (scale.success) {
        return `scale-${scale.data}`;
      }

      const name = rowIdPartSchema.safeParse(row.name);
      if (name.success) {
        return `name-${name.data}-${index}`;
      }

      return `row-${index}`;
    },
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
      getRowClassName={(row) => (!getRowNavigation?.(row.original) ? "cursor-default" : undefined)}
      getCellClassName={(_, columnId) =>
        columnId === ROW_NUMBER_COLUMN_ID ? "text-muted-foreground" : undefined
      }
    />
  );
}
