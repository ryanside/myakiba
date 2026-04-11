import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export interface RowNavigation {
  to: string;
  search?: Record<string, string[] | number[]>;
}

const COLUMN_LABELS: Record<string, string> = {
  name: "name",
  itemCount: "count",
  totalSpent: "spent",
  shop: "shop",
  scale: "scale",
};

export function LeaderboardTable({
  rows,
  columns,
  formatCell,
  getRowNavigation,
}: {
  readonly rows: readonly Record<string, string | number | null>[];
  readonly columns: readonly string[];
  readonly formatCell?: (column: string, value: string | number | null) => string | number | null;
  readonly getRowNavigation?: (
    row: Record<string, string | number | null>,
  ) => RowNavigation | undefined;
}): ReactNode {
  const navigate = useNavigate();

  if (rows.length === 0) {
    return <p className="text-muted-foreground text-xs italic">No data</p>;
  }

  return (
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr>
          <th className="text-left p-1.5 border-b font-medium text-muted-foreground">#</th>
          {columns.map((col) => (
            <th key={col} className="text-left p-1.5 border-b font-medium text-muted-foreground">
              {COLUMN_LABELS[col] ?? col}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, idx) => {
          const rowNav = getRowNavigation?.(row);
          return (
            <tr
              key={idx}
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
              <td className="p-1.5 text-muted-foreground">{idx + 1}</td>
              {columns.map((col) => (
                <td key={col} className="p-1.5">
                  {(formatCell ? formatCell(col, row[col]) : row[col]) ?? "—"}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
