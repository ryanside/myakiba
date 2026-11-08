import { Fragment } from "react";
import type { CSSProperties, ReactNode } from "react";
import { flexRender } from "@tanstack/react-table";
import type { Row, RowData, Table as TanStackTable } from "@tanstack/react-table";
import { ROW_HOVER_CLASS_NAME } from "@/components/media-tile";
import { Skeleton } from "@/components/ui/skeleton";
import { getAriaSort } from "@/lib/aria-sort";
import { cn } from "@/lib/utils";

const DEFAULT_SKELETON_ROW_COUNT = 10;
const TEXT_SKELETON_WIDTHS = ["w-28", "w-20", "w-36", "w-24", "w-32"] as const;

export function CellSkeleton({ className }: { readonly className?: string }): ReactNode {
  return <Skeleton className={cn("inline-block h-3 max-w-full align-middle", className)} />;
}

export const DATA_TABLE_SKELETON = {
  rank: <CellSkeleton className="w-4" />,
  count: <CellSkeleton className="w-5" />,
  percent: <CellSkeleton className="w-8" />,
  money: <CellSkeleton className="w-12" />,
} as const;

export const DATA_TABLE_NUMBER_META = {
  headerClassName: "text-right",
  cellClassName: "text-right tabular-nums",
} as const;

/**
 * `sized` fixes each column to its `size` as a share of all the sizes, so the columns hold still
 * while rows load. A `w-*` class in a column's `headerClassName` overrides the share.
 */
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
      <table
        className={cn(
          "w-full border-collapse text-xs",
          variant === "sized" && "table-fixed",
          tableClassName,
        )}
      >
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
              className={cn(
                "border-b border-border/70 p-1.5 text-left font-medium text-muted-foreground",
                variant === "sized" && "w-(--column-share)",
                header.column.columnDef.meta?.headerClassName,
              )}
              style={
                variant === "sized"
                  ? ({
                      "--column-share": `${(header.getSize() / table.getTotalSize()) * 100}%`,
                    } as CSSProperties)
                  : undefined
              }
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
          <tr key={rowIndex}>
            {columns.map((column) => (
              <td key={column.id} className={cn("p-1.5", column.columnDef.meta?.cellClassName)}>
                {column.columnDef.meta?.skeleton ?? (
                  <CellSkeleton
                    className={TEXT_SKELETON_WIDTHS[rowIndex % TEXT_SKELETON_WIDTHS.length]}
                  />
                )}
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
                "animate-data-in",
                ROW_HOVER_CLASS_NAME,
                isInteractive &&
                  "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                getRowClassName?.(row),
              )}
            >
              {row.getVisibleCells().map((cell) => (
                <td
                  key={cell.id}
                  className={cn(
                    "p-1.5",
                    cell.column.columnDef.meta?.cellClassName,
                    getCellClassName?.(row, cell.column.id),
                  )}
                >
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
