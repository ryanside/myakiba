import { createContext, Fragment, useContext } from "react";
import type { ReactNode } from "react";
import { flexRender } from "@tanstack/react-table";
import type { Row, RowData, Table as TanStackTable } from "@tanstack/react-table";
import { cn } from "@/lib/utils";

interface DataTableContextValue<TData extends RowData> {
  readonly table: TanStackTable<TData>;
  readonly isLoading: boolean;
  readonly empty: ReactNode;
}

const DataTableContext = createContext<DataTableContextValue<RowData> | null>(null);

function useDataTable<TData extends RowData>(): DataTableContextValue<TData> {
  const context = useContext(DataTableContext);

  if (!context) {
    throw new Error("DataTable components must be rendered inside DataTable.Root");
  }

  return context as DataTableContextValue<TData>;
}

function Root<TData extends RowData>({
  table,
  isLoading = false,
  empty,
  children,
}: {
  readonly table: TanStackTable<TData>;
  readonly isLoading?: boolean;
  readonly empty: ReactNode;
  readonly children: ReactNode;
}): ReactNode {
  const value: DataTableContextValue<TData> = {
    table,
    isLoading,
    empty,
  };

  return (
    <DataTableContext.Provider value={value as DataTableContextValue<RowData>}>
      {children}
    </DataTableContext.Provider>
  );
}

function Table({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}): ReactNode {
  return <table className={cn("w-full text-xs border-collapse", className)}>{children}</table>;
}

function Header<TData extends RowData>({
  useColumnSizing = false,
}: {
  readonly useColumnSizing?: boolean;
}): ReactNode {
  const { table } = useDataTable<TData>();

  return (
    <thead>
      {table.getHeaderGroups().map((headerGroup) => (
        <tr key={headerGroup.id}>
          {headerGroup.headers.map((header) => (
            <th
              key={header.id}
              className="text-left p-1.5 border-b font-medium text-muted-foreground"
              style={useColumnSizing ? { width: header.column.getSize() } : undefined}
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

function Body<TData extends RowData>({
  onRowClick,
  renderExpandedRow,
  getRowClassName,
  getCellClassName,
}: {
  readonly onRowClick?: (row: Row<TData>) => void;
  readonly renderExpandedRow?: (row: Row<TData>) => ReactNode;
  readonly getRowClassName?: (row: Row<TData>) => string | undefined;
  readonly getCellClassName?: (row: Row<TData>, columnId: string) => string | undefined;
}): ReactNode {
  const { table, empty } = useDataTable<TData>();
  const rows = table.getRowModel().rows;

  if (rows.length === 0) {
    return (
      <tbody>
        <tr>
          <td colSpan={table.getVisibleFlatColumns().length}>{empty}</td>
        </tr>
      </tbody>
    );
  }

  return (
    <tbody>
      {rows.map((row) => {
        const isInteractive = Boolean(onRowClick);
        const expandedContent = renderExpandedRow?.(row);

        return (
          <Fragment key={row.id}>
            <tr
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                "border-b border-border/50 hover:bg-muted/40",
                isInteractive && "cursor-pointer",
                getRowClassName?.(row),
              )}
            >
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className={cn("p-1.5", getCellClassName?.(row, cell.column.id))}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
            {row.getIsExpanded() && expandedContent ? (
              <tr className="animate-data-in">
                <td colSpan={row.getVisibleCells().length} className="p-0">
                  {expandedContent}
                </td>
              </tr>
            ) : null}
          </Fragment>
        );
      })}
    </tbody>
  );
}

function LoadingSurface({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}): ReactNode {
  const { isLoading } = useDataTable<RowData>();

  return (
    <div className={cn("transition-opacity duration-150", isLoading && "opacity-60", className)}>
      {children}
    </div>
  );
}

function Empty({
  title,
  description,
}: {
  readonly title: string;
  readonly description?: string;
}): ReactNode {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
      <p className="text-sm">{title}</p>
      {description ? <p className="text-xs mt-1">{description}</p> : null}
    </div>
  );
}

export const DataTable = {
  Root,
  Table,
  Header,
  Body,
  LoadingSurface,
  Empty,
};
