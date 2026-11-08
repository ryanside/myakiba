"use client";

import { createContext, useContext, useMemo } from "react";
import type { ComponentProps, MouseEvent, ReactNode } from "react";
import type { ColumnFiltersState, RowData, SortingState, Table } from "@tanstack/react-table";

import { cn } from "@/lib/utils";

declare module "@tanstack/react-table" {
  interface ColumnMeta<TData extends RowData, TValue> {
    headerTitle?: string;
    headerClassName?: string;
    cellClassName?: string;
    skeleton?: ReactNode;
    expandedContent?: (row: TData) => ReactNode;
  }
}

export type DataGridApiFetchParams = {
  pageIndex: number;
  pageSize: number;
  sorting?: SortingState;
  filters?: ColumnFiltersState;
  searchQuery?: string;
};

export type DataGridApiResponse<T> = {
  data: T[];
  empty: boolean;
  pagination: {
    total: number;
    page: number;
  };
};

export interface DataGridContextProps<TData extends object> {
  props: DataGridProps<TData>;
  table: Table<TData>;
  recordCount: number;
  isLoading: boolean;
}

export type DataGridRequestParams = {
  pageIndex: number;
  pageSize: number;
  sorting?: SortingState;
  columnFilters?: ColumnFiltersState;
};

export interface DataGridProps<TData extends object> {
  className?: string;
  table?: Table<TData>;
  recordCount: number;
  children?: ReactNode;
  onRowClick?: (row: TData) => void;
  /** A pointer shortcut only: unlike `onRowClick`, the row stays out of the tab order. */
  onRowPointerClick?: (row: TData, event: MouseEvent<HTMLTableRowElement>) => void;
  isLoading?: boolean;
  loadingMode?: "skeleton" | "spinner";
  skeletonRowCount?: number;
  loadingMessage?: ReactNode | string;
  emptyMessage?: ReactNode | string;
  /** A row that has no cells to show, such as one with no record behind it, spans the table. */
  fullWidthRow?: (row: TData) => ReactNode;
  /** The table's accessible name, and what describes it. */
  tableAria?: Pick<ComponentProps<"table">, "aria-label" | "aria-describedby">;
  tableLayout?: {
    dense?: boolean;
    cellBorder?: boolean;
    /**
     * Rules under an expanded row's cells. When off, a spacer row sits between header and body.
     * Body rows never get a rule: rows are separated by space and the hover tint.
     */
    rowBorder?: boolean;
    rowRounded?: boolean;
    stripped?: boolean;
    headerBackground?: boolean;
    headerBorder?: boolean;
    width?: "auto" | "fixed";
    columnsVisibility?: boolean;
    columnsResizable?: boolean;
    columnsPinnable?: boolean;
    columnsMovable?: boolean;
    columnsDraggable?: boolean;
    rowsDraggable?: boolean;
  };
  tableClassNames?: {
    base?: string;
    header?: string;
    headerRow?: string;
    body?: string;
    bodyRow?: string;
    footer?: string;
    edgeCell?: string;
  };
}

const DataGridContext = createContext<
  // oxlint-disable-next-line typescript/no-explicit-any -- A React context cannot carry the grid's row type parameter (until 2027-04-16, approved by root, pending operator review)
  DataGridContextProps<any> | undefined
>(undefined);

function useDataGrid() {
  const context = useContext(DataGridContext);
  if (!context) {
    throw new Error("useDataGrid must be used within a DataGridProvider");
  }
  return context;
}

function DataGridProvider<TData extends object>({
  children,
  table,
  ...props
}: DataGridProps<TData> & { table: Table<TData> }) {
  const contextValue = useMemo(
    () => ({
      props,
      table,
      recordCount: props.recordCount,
      isLoading: props.isLoading || false,
    }),
    [props, table],
  );

  return <DataGridContext.Provider value={contextValue}>{children}</DataGridContext.Provider>;
}

function DataGrid<TData extends object>({ children, table, ...props }: DataGridProps<TData>) {
  const defaultProps: Partial<DataGridProps<TData>> = {
    loadingMode: "skeleton",
    tableLayout: {
      dense: false,
      cellBorder: false,
      rowBorder: true,
      rowRounded: false,
      stripped: false,
      headerBorder: true,
      width: "fixed",
      columnsVisibility: false,
      columnsResizable: false,
      columnsPinnable: false,
      columnsMovable: false,
      columnsDraggable: false,
      rowsDraggable: false,
    },
    tableClassNames: {
      base: "",
      header: "",
      headerRow: "",
      body: "",
      bodyRow: "",
      footer: "",
      edgeCell: "",
    },
  };

  const mergedProps: DataGridProps<TData> = {
    ...defaultProps,
    ...props,
    tableLayout: {
      ...defaultProps.tableLayout,
      ...props.tableLayout,
    },
    tableClassNames: {
      ...defaultProps.tableClassNames,
      ...props.tableClassNames,
    },
  };

  // Ensure table is provided
  if (!table) {
    throw new Error('DataGrid requires a "table" prop');
  }

  return (
    <DataGridProvider table={table} {...mergedProps}>
      {children}
    </DataGridProvider>
  );
}

function DataGridContainer({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      data-slot="data-grid"
      className={cn("w-full min-w-0 max-w-full overflow-x-auto overflow-y-hidden", className)}
    >
      {children}
    </div>
  );
}

const NUMERIC_COLUMN_META = {
  headerClassName:
    "pe-6 [&>div:not([data-slot=column-resize-handle])]:justify-end [&_button]:-me-3 [&_button]:ms-0 [&_button]:flex-row-reverse",
  cellClassName: "pe-6 text-right tabular-nums [&_button]:justify-end [&_input]:text-right",
} as const;

export { useDataGrid, DataGridProvider, DataGrid, DataGridContainer, NUMERIC_COLUMN_META };
