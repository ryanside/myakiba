import { Fragment } from "react";
import type { ReactNode } from "react";
import { flexRender } from "@tanstack/react-table";
import type { Column, Row, RowData, Table as TanStackTable } from "@tanstack/react-table";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const DEFAULT_SKELETON_ROW_COUNT = 10;

type DataTableVariant = "default" | "sized";

interface DataTableProps<TData extends RowData> {
  readonly table: TanStackTable<TData>;
  readonly isLoading?: boolean;
  readonly skeletonRowCount?: number;
  readonly empty: ReactNode;
  readonly variant?: DataTableVariant;
  readonly className?: string;
  readonly tableClassName?: string;
  readonly onRowClick?: (row: Row<TData>) => void;
  readonly renderExpandedRow?: (row: Row<TData>) => ReactNode;
  readonly getRowClassName?: (row: Row<TData>) => string | undefined;
  readonly getCellClassName?: (row: Row<TData>, columnId: string) => string | undefined;
}

export function DataTable<TData extends RowData>({
  table,
  isLoading = false,
  skeletonRowCount = DEFAULT_SKELETON_ROW_COUNT,
  empty,
  variant = "default",
  className,
  tableClassName,
  onRowClick,
  renderExpandedRow,
  getRowClassName,
  getCellClassName,
}: DataTableProps<TData>): ReactNode {
  return (
    <div
      aria-busy={isLoading}
      className={cn("transition-opacity duration-150", isLoading && "opacity-60", className)}
    >
      <table className={cn("w-full border-collapse text-xs", tableClassName)}>
        <TableHeader table={table} variant={variant} />
        <TableBody
          table={table}
          isLoading={isLoading}
          skeletonRowCount={skeletonRowCount}
          empty={empty}
          onRowClick={onRowClick}
          renderExpandedRow={renderExpandedRow}
          getRowClassName={getRowClassName}
          getCellClassName={getCellClassName}
        />
      </table>
    </div>
  );
}

function TableHeader<TData extends RowData>({
  table,
  variant,
}: {
  readonly table: TanStackTable<TData>;
  readonly variant: DataTableVariant;
}): ReactNode {
  return (
    <thead>
      {table.getHeaderGroups().map((headerGroup) => (
        <tr key={headerGroup.id}>
          {headerGroup.headers.map((header) => (
            <th
              key={header.id}
              aria-sort={getAriaSort(header.column)}
              className="border-b p-1.5 text-left font-medium text-muted-foreground"
              style={variant === "sized" ? { width: header.column.getSize() } : undefined}
            >
              {header.isPlaceholder
                ? null
                : flexRender(header.column.columnDef.header, header.getContext())}
            </th>
          ))}
        </tr>
      ))}
    </thead>
  );
}

function getAriaSort<TData extends RowData>(
  column: Column<TData>,
): "ascending" | "descending" | "none" | undefined {
  const sorted = column.getIsSorted();

  if (sorted === "asc") return "ascending";
  if (sorted === "desc") return "descending";
  return column.getCanSort() ? "none" : undefined;
}

function TableBody<TData extends RowData>({
  table,
  isLoading,
  skeletonRowCount,
  empty,
  onRowClick,
  renderExpandedRow,
  getRowClassName,
  getCellClassName,
}: Required<Pick<DataTableProps<TData>, "table" | "isLoading" | "skeletonRowCount" | "empty">> &
  Pick<
    DataTableProps<TData>,
    "onRowClick" | "renderExpandedRow" | "getRowClassName" | "getCellClassName"
  >): ReactNode {
  const rows = table.getRowModel().rows;
  const columns = table.getVisibleFlatColumns();

  if (isLoading && rows.length === 0) {
    return (
      <tbody>
        {Array.from({ length: skeletonRowCount }).map((_, rowIndex) => (
          <tr key={rowIndex} className="border-b border-border/50">
            {columns.map((column) => (
              <td key={column.id} className="p-1.5">
                <Skeleton className="h-4 w-full" />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    );
  }

  if (rows.length === 0) {
    return (
      <tbody>
        <tr>
          <td colSpan={columns.length}>{empty}</td>
        </tr>
      </tbody>
    );
  }

  return (
    <tbody>
      {rows.map((row) => {
        const isInteractive = Boolean(onRowClick);

        return (
          <Fragment key={row.id}>
            <tr
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={
                onRowClick
                  ? (event) => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key !== "Enter" && event.key !== " ") return;

                      event.preventDefault();
                      onRowClick(row);
                    }
                  : undefined
              }
              tabIndex={isInteractive ? 0 : undefined}
              className={cn(
                "animate-data-in border-b border-border/50 hover:bg-muted/40",
                isInteractive &&
                  "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                getRowClassName?.(row),
              )}
            >
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className={cn("p-1.5", getCellClassName?.(row, cell.column.id))}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
            {row.getIsExpanded() && renderExpandedRow ? (
              <tr className="animate-data-in">
                <td colSpan={row.getVisibleCells().length} className="p-0">
                  {renderExpandedRow(row)}
                </td>
              </tr>
            ) : null}
          </Fragment>
        );
      })}
    </tbody>
  );
}

export function DataTableEmpty({
  title,
  description,
}: {
  readonly title: string;
  readonly description?: string;
}): ReactNode {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
      <p className="text-sm">{title}</p>
      {description ? <p className="mt-1 text-xs">{description}</p> : null}
    </div>
  );
}
