import type { ColumnDef } from "@tanstack/react-table";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type SortingState,
  getSortedRowModel,
} from "@tanstack/react-table";
import { useNavigate } from "@tanstack/react-router";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn, getCategoryColor } from "@/lib/utils";
import { Progress } from "../ui/progress";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "../ui/button";
import { formatCurrency } from "@/lib/utils";
import { useMemo, useState, Fragment } from "react";

interface RowNavigation {
  to: string;
  search?: Record<string, string[] | number[]>;
}

interface Column {
  key: string;
  label: string;
  align?: "left" | "center" | "right";
  type?: "string" | "number" | "currency";
  cellText?: string;
  cellClassName?: string;
}

interface RankingCardProps {
  title: string;
  icon?: React.ReactNode;
  columns: Column[];
  data: Array<{ [key: string]: string | number }>;
  emptyMessage?: string;
  className?: string;
  progressKey?: string;
  progressMax?: number;
  currency?: string;
  getRowNavigation?: (row: Record<string, string | number>) => RowNavigation | undefined;
}

export function RankingCard({
  title,
  icon,
  columns,
  data,
  emptyMessage = "No data found",
  className,
  progressKey,
  progressMax,
  currency = "USD",
  getRowNavigation,
}: RankingCardProps) {
  const navigate = useNavigate();

  // prettier-ignore
  const tableColumns = useMemo<ColumnDef<Record<string, string | number>>[]>(() => {
    
    return columns.map((col) => ({
      id: col.key,
      accessorKey: col.key,
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="text-xs -ms-2 px-2 h-7 hover:bg-muted data-[state=open]:bg-muted data-[state=open]:text-white"
        >
          {col.label}
          {column.getIsSorted() === "desc" ? (
            <ArrowDown className="size-3" />
          ) : column.getIsSorted() === "asc" ? (
            <ArrowUp className="size-3" />
          ) : (
            <ArrowUpDown className="size-3" />
          )}
        </Button>
      ),
      cell: ({ row }) => {
        const value = row.original[col.key];
        return (
          <span
            className={cn(
              "block text-sm text-muted-foreground truncate",
              col.align === "center" && "text-center",
              col.align === "right" && "text-right",
              col.align === "left" && "text-left",
              col.cellClassName,
            )}
            style={{
              color: col.key === "category" ? getCategoryColor(value as string) : undefined,
            }}
          >
            {col.type === "currency"
              ? formatCurrency(value as number, currency)
              : value}{" "}
            {col.cellText && `${col.cellText}`}
          </span>
        );
      },
    }));
  }, [columns, currency]);

  const [sorting, setSorting] = useState<SortingState>([{ id: "count", desc: true }]);
  const table = useReactTable({
    data,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    state: { sorting },
  });

  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border border-border bg-card overflow-hidden",
        className
      )}
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2.5">
          {icon && (
            <span className="text-muted-foreground flex-shrink-0">{icon}</span>
          )}
          <h3 className="text-base font-medium text-foreground">{title}</h3>
        </div>
      </div>

      <div className="flex-1">
        <Table>
          <TableHeader className="bg-muted/30">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow
                key={headerGroup.id}
                className="border-b border-border hover:bg-transparent"
              >
                {headerGroup.headers.map((header, headerIndex) => (
                  <TableHead
                    key={header.id}
                    className={cn(
                      "h-auto py-3 px-5",
                      header.column.id === "rank" && "w-12",
                    )}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row, rowIndex) => {
                const rowNav = getRowNavigation?.(row.original);
                return (
                <Fragment key={row.id}>
                  <TableRow
                    className={cn(
                      "border-b border-border last:border-b-0 hover:bg-muted/30",
                      progressKey && progressMax && "border-none",
                      rowNav && "cursor-pointer"
                    )}
                    onClick={() => {
                      if (rowNav) {
                        navigate({ to: rowNav.to, search: rowNav.search });
                      }
                    }}
                  >
                    {row.getVisibleCells().map((cell, cellIndex) => (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          "py-3.5 px-5",
                        )}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                  {progressKey && progressMax && (
                    <TableRow className="border-b border-border last:border-b-0 hover:bg-transparent">
                      <TableCell colSpan={columns.length} className="p-0">
                        <Progress
                          value={Number(row.original[progressKey])}
                          max={progressMax}
                          className="h-0.5 bg-sidebar rounded-none"
                          indicatorClassName="bg-secondary"
                        />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
              })
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
