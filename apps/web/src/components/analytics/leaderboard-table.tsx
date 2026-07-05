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

  return (
    <DataTable.Root
      table={table}
      isLoading={isLoading}
      empty={<p className="text-muted-foreground text-xs italic">No data</p>}
    >
      <DataTable.LoadingSurface>
        <DataTable.Table>
          <DataTable.Header />
          <DataTable.Body
            onRowClick={(row) => {
              const originalRow = row.original as TRow;
              const rowNav = getRowNavigation?.(originalRow);

              if (rowNav) {
                navigate({ to: rowNav.to, search: rowNav.search });
              }
            }}
            getRowClassName={(row) =>
              !getRowNavigation?.(row.original as TRow) ? "cursor-default" : undefined
            }
            getCellClassName={(_, columnId) =>
              columnId === ROW_NUMBER_COLUMN_ID ? "text-muted-foreground" : undefined
            }
          />
        </DataTable.Table>
      </DataTable.LoadingSurface>
    </DataTable.Root>
  );
}
