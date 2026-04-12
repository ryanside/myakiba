import { useMemo, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import { cn } from "@/lib/utils";

export interface RowNavigation {
  to: string;
  search?: Record<string, string[] | number[]>;
}

type CellValue = string | number | null;

const COLUMN_LABELS: Record<string, string> = {
  name: "name",
  itemCount: "count",
  totalSpent: "spent",
  shop: "shop",
  scale: "scale",
};

const ROW_NUMBER_COLUMN_ID = "__rowNumber";

export function LeaderboardTable<TRow extends Record<string, CellValue>>({
  rows,
  columns,
  formatCell,
  getRowNavigation,
}: {
  readonly rows: readonly TRow[];
  readonly columns: readonly string[];
  readonly formatCell?: (column: string, value: CellValue) => CellValue;
  readonly getRowNavigation?: (row: TRow) => RowNavigation | undefined;
}): ReactNode {
  const navigate = useNavigate();
  const tableData = useMemo(() => Array.from(rows), [rows]);
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
          header: COLUMN_LABELS[column] ?? column,
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
      if (typeof row.entryId === "string" && row.entryId.length > 0) {
        return `entry-${row.entryId}`;
      }

      if (typeof row.shop === "string" && row.shop.length > 0) {
        return `shop-${row.shop}`;
      }

      if (typeof row.scale === "string" && row.scale.length > 0) {
        return `scale-${row.scale}`;
      }

      if (typeof row.name === "string" && row.name.length > 0) {
        return `name-${row.name}-${index}`;
      }

      return `row-${index}`;
    },
  });

  if (rows.length === 0) {
    return <p className="text-muted-foreground text-xs italic">No data</p>;
  }

  return (
    <table className="w-full text-xs border-collapse">
      <thead>
        {table.getHeaderGroups().map((headerGroup) => (
          <tr key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <th
                key={header.id}
                className="text-left p-1.5 border-b font-medium text-muted-foreground"
              >
                {header.isPlaceholder
                  ? null
                  : flexRender(header.column.columnDef.header, header.getContext())}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map((row) => {
          const rowNav = getRowNavigation?.(row.original);

          return (
            <tr
              key={row.id}
              className={cn(
                "border-b border-border/50 hover:bg-muted/40",
                rowNav && "cursor-pointer",
              )}
              onClick={() => {
                if (rowNav) {
                  navigate({ to: rowNav.to, search: rowNav.search });
                }
              }}
            >
              {row.getVisibleCells().map((cell) => (
                <td
                  key={cell.id}
                  className={cn(
                    "p-1.5",
                    cell.column.id === ROW_NUMBER_COLUMN_ID && "text-muted-foreground",
                  )}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
