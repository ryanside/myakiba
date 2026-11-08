import { Fragment } from "react";
import type { ComponentProps, CSSProperties, ReactNode } from "react";
import { useDataGrid } from "@/components/reui/data-grid/data-grid";
import { flexRender } from "@tanstack/react-table";
import type { Cell, Column, Header, HeaderGroup, Row } from "@tanstack/react-table";
import { cva } from "class-variance-authority";

import { ROW_HOVER_CLASS_NAME } from "@/components/media-tile";
import { getAriaSort } from "@/lib/aria-sort";
import { cn } from "@/lib/utils";

const headerCellSpacingVariants = cva("", {
  variants: {
    size: {
      dense: "px-2 h-8",
      default: "px-3",
    },
  },
  defaultVariants: {
    size: "default",
  },
});

const bodyCellSpacingVariants = cva("", {
  variants: {
    size: {
      dense: "px-2 py-1.5",
      default: "px-3 py-2.5",
    },
  },
  defaultVariants: {
    size: "default",
  },
});

function getPinningStyles<TData>(column: Column<TData>): CSSProperties {
  const isPinned = column.getIsPinned();

  return {
    left: isPinned === "left" ? `${column.getStart("left")}px` : undefined,
    right: isPinned === "right" ? `${column.getAfter("right")}px` : undefined,
    position: isPinned ? "sticky" : "relative",
    width: column.getSize(),
    zIndex: isPinned ? 1 : 0,
  };
}

function getLastColAttribute(
  isLastLeftPinned: boolean,
  isFirstRightPinned: boolean,
): "left" | "right" | undefined {
  if (isLastLeftPinned) return "left";
  if (isFirstRightPinned) return "right";
  return undefined;
}

function DataGridTableBase({ children }: { children: ReactNode }) {
  const { props, table } = useDataGrid();

  return (
    <table
      {...props.tableAria}
      data-slot="data-grid-table"
      className={cn(
        "text-foreground text-sm w-full min-w-full caption-bottom text-left align-middle font-normal rtl:text-right",
        props.tableLayout?.width === "auto" ? "table-auto" : "table-fixed",
        !props.tableLayout?.columnsResizable && "",
        !props.tableLayout?.columnsDraggable && "border-separate border-spacing-0",
        props.tableClassNames?.base,
      )}
      style={props.tableLayout?.columnsResizable ? { width: table.getTotalSize() } : undefined}
    >
      {children}
    </table>
  );
}

function DataGridTableHead({ children }: { children: ReactNode }) {
  const { props } = useDataGrid();

  return <thead className={props.tableClassNames?.header}>{children}</thead>;
}

function DataGridTableHeadRow<TData>({
  children,
  headerGroup,
}: {
  children: ReactNode;
  headerGroup: HeaderGroup<TData>;
}) {
  const { props } = useDataGrid();

  return (
    <tr
      key={headerGroup.id}
      data-row="head"
      className={cn(
        props.tableLayout?.headerBorder && "[&>th]:border-b [&>th]:border-border/70",
        props.tableLayout?.cellBorder && "*:last:border-e-0",
        props.tableClassNames?.headerRow,
      )}
    >
      {children}
    </tr>
  );
}

function DataGridTableHeadRowCell<TData>({
  children,
  header,
  dndRef,
  dndStyle,
}: {
  children: ReactNode;
  header: Header<TData, unknown>;
  dndRef?: React.Ref<HTMLTableCellElement>;
  dndStyle?: CSSProperties;
}) {
  const { props } = useDataGrid();

  const { column } = header;
  const isPinned = column.getIsPinned();
  const isLastLeftPinned = isPinned === "left" && column.getIsLastColumn("left");
  const isFirstRightPinned = isPinned === "right" && column.getIsFirstColumn("right");
  const headerCellSpacing = headerCellSpacingVariants({
    size: props.tableLayout?.dense ? "dense" : "default",
  });

  return (
    <th
      key={header.id}
      ref={dndRef}
      style={{
        ...((props.tableLayout?.width === "fixed" || props.tableLayout?.columnsResizable) && {
          width: header.getSize(),
        }),
        ...(props.tableLayout?.columnsPinnable && column.getCanPin() && getPinningStyles(column)),
        ...dndStyle,
      }}
      aria-sort={getAriaSort(column)}
      data-col={column.id}
      data-pinned={(props.tableLayout?.columnsPinnable && isPinned) || undefined}
      data-last-col={getLastColAttribute(isLastLeftPinned, isFirstRightPinned)}
      className={cn(
        "text-secondary-foreground/80 h-9 relative text-left align-middle font-normal rtl:text-right [&:has([role=checkbox])]:pe-0",
        headerCellSpacing,
        props.tableLayout?.cellBorder && "border-e",
        props.tableLayout?.columnsResizable && column.getCanResize() && "truncate",
        props.tableLayout?.columnsPinnable &&
          column.getCanPin() &&
          "[&[data-pinned][data-last-col]]:border-border data-pinned:bg-muted/90 data-pinned:backdrop-blur-xs [&:not([data-pinned]):has(+[data-pinned])_[data-slot=column-resize-handle]:last-child]:opacity-0 [&[data-last-col=left]_[data-slot=column-resize-handle]:last-child]:opacity-0 [&[data-pinned=left][data-last-col=left]]:border-e! [&[data-pinned=right]:last-child_[data-slot=column-resize-handle]:last-child]:opacity-0 [&[data-pinned=right][data-last-col=right]]:border-s!",
        header.column.columnDef.meta?.headerClassName,
        column.getIndex() === 0 || column.getIndex() === header.headerGroup.headers.length - 1
          ? props.tableClassNames?.edgeCell
          : "",
      )}
    >
      {children}
    </th>
  );
}

function DataGridTableHeadRowCellResize<TData>({ header }: { header: Header<TData, unknown> }) {
  const { column } = header;

  return (
    <div
      {...{
        "data-slot": "column-resize-handle",
        onDoubleClick: () => column.resetSize(),
        onMouseDown: header.getResizeHandler(),
        onTouchStart: header.getResizeHandler(),
        className:
          "absolute top-0 h-full w-4 cursor-col-resize user-select-none touch-none -end-2 z-10 flex justify-center before:absolute before:w-px before:inset-y-0 before:bg-border before:-translate-x-px before:opacity-0 hover:before:opacity-100",
      }}
    />
  );
}

function DataGridTableRowSpacer() {
  return <tbody aria-hidden="true" className="h-2" />;
}

function DataGridTableBody({ children }: { children: ReactNode }) {
  const { props } = useDataGrid();

  return (
    <tbody
      className={cn(
        "[&_tr:last-child]:border-0",
        props.tableLayout?.rowRounded && "[&_td:first-child]:rounded-l-lg",
        props.tableLayout?.rowRounded && "[&_td:last-child]:rounded-r-lg",
        props.tableClassNames?.body,
      )}
    >
      {children}
    </tbody>
  );
}

function DataGridTableBodyRowSkeleton({ children }: { children: ReactNode }) {
  const { table, props } = useDataGrid();

  return (
    <tr
      className={cn(
        props.onRowClick && "cursor-pointer",
        props.tableLayout?.cellBorder && "*:last:border-e-0",
        props.tableLayout?.stripped && "odd:bg-muted/90 odd:hover:bg-muted hover:bg-transparent",
        table.options.enableRowSelection && "*:first:relative",
        props.tableClassNames?.bodyRow,
      )}
    >
      {children}
    </tr>
  );
}

function DataGridTableBodyRowSkeletonCell<TData>({
  children,
  column,
}: {
  children: ReactNode;
  column: Column<TData>;
}) {
  const { props, table } = useDataGrid();
  const bodyCellSpacing = bodyCellSpacingVariants({
    size: props.tableLayout?.dense ? "dense" : "default",
  });

  return (
    <td
      style={props.tableLayout?.columnsResizable ? { width: column.getSize() } : undefined}
      className={cn(
        "align-middle",
        bodyCellSpacing,
        props.tableLayout?.cellBorder && "border-e",
        props.tableLayout?.columnsResizable && column.getCanResize() && "truncate",
        column.columnDef.meta?.cellClassName,
        props.tableLayout?.columnsPinnable &&
          column.getCanPin() &&
          '[&[data-pinned][data-last-col]]:border-border data-pinned:bg-background/90 data-pinned:backdrop-blur-xs" [&[data-pinned=left][data-last-col=left]]:border-e! [&[data-pinned=right][data-last-col=right]]:border-s!',
        column.getIndex() === 0 || column.getIndex() === table.getVisibleFlatColumns().length - 1
          ? props.tableClassNames?.edgeCell
          : "",
      )}
    >
      {children}
    </td>
  );
}

function DataGridTableBodyRow<TData>({
  children,
  row,
  dndRef,
  dndStyle,
}: {
  children: ReactNode;
  row: Row<TData>;
  dndRef?: React.Ref<HTMLTableRowElement>;
  dndStyle?: CSSProperties;
}) {
  const { props, table } = useDataGrid();
  const { onRowClick, onRowPointerClick } = props;
  const isInteractive = Boolean(onRowClick);

  return (
    <tr
      ref={dndRef}
      style={dndStyle ?? undefined}
      data-row={row.id}
      data-state={table.options.enableRowSelection && row.getIsSelected() ? "selected" : undefined}
      onClick={(event) => {
        onRowClick?.(row.original);
        onRowPointerClick?.(row.original, event);
      }}
      onKeyDown={
        onRowClick
          ? (event) => {
              if (event.target !== event.currentTarget) return;
              if (event.key !== "Enter" && event.key !== " ") return;

              event.preventDefault();
              onRowClick(row.original);
            }
          : undefined
      }
      tabIndex={isInteractive ? 0 : undefined}
      className={cn(
        "animate-data-in group/row data-[state=selected]:bg-muted/50",
        ROW_HOVER_CLASS_NAME,
        isInteractive &&
          "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        props.tableLayout?.cellBorder && "*:last:border-e-0",
        props.tableLayout?.stripped && "odd:bg-muted/90 odd:hover:bg-muted hover:bg-transparent",
        table.options.enableRowSelection && "*:first:relative",
        props.tableClassNames?.bodyRow,
      )}
    >
      {children}
    </tr>
  );
}

function DataGridTableBodyRowExpandded<TData>({ row }: { row: Row<TData> }) {
  const { props, table } = useDataGrid();

  return (
    <tr className={cn(props.tableLayout?.rowBorder && "[&:not(:last-child)>td]:border-b")}>
      <td colSpan={row.getVisibleCells().length}>
        {table
          .getAllColumns()
          .find((column) => column.columnDef.meta?.expandedContent)
          ?.columnDef.meta?.expandedContent?.(row.original)}
      </td>
    </tr>
  );
}

/** The tinted panel under an expanded row. A click or a key in it stays out of the row. */
function DataGridExpandedPanel({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      role="presentation"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      {...props}
      className={cn("space-y-2.5 bg-muted/30 p-4", className)}
    />
  );
}

function DataGridTableBodyRowFullWidth<TData>({
  row,
  children,
}: {
  row: Row<TData>;
  children: ReactNode;
}) {
  const { props } = useDataGrid();
  const bodyCellSpacing = bodyCellSpacingVariants({
    size: props.tableLayout?.dense ? "dense" : "default",
  });

  return (
    <DataGridTableBodyRow row={row}>
      <td colSpan={row.getVisibleCells().length} className={cn("align-middle", bodyCellSpacing)}>
        {children}
      </td>
    </DataGridTableBodyRow>
  );
}

function DataGridTableBodyRowCell<TData>({
  children,
  cell,
  dndRef,
  dndStyle,
}: {
  children: ReactNode;
  cell: Cell<TData, unknown>;
  dndRef?: React.Ref<HTMLTableCellElement>;
  dndStyle?: CSSProperties;
}) {
  const { props } = useDataGrid();

  const { column, row } = cell;
  const isPinned = column.getIsPinned();
  const isLastLeftPinned = isPinned === "left" && column.getIsLastColumn("left");
  const isFirstRightPinned = isPinned === "right" && column.getIsFirstColumn("right");
  const bodyCellSpacing = bodyCellSpacingVariants({
    size: props.tableLayout?.dense ? "dense" : "default",
  });

  return (
    <td
      key={cell.id}
      ref={dndRef}
      {...(props.tableLayout?.columnsDraggable && !isPinned ? { cell } : {})}
      style={{
        ...(props.tableLayout?.columnsResizable && {
          width: column.getSize(),
        }),
        ...(props.tableLayout?.columnsPinnable && column.getCanPin() && getPinningStyles(column)),
        ...dndStyle,
      }}
      data-col={column.id}
      data-pinned={(props.tableLayout?.columnsPinnable && isPinned) || undefined}
      data-last-col={getLastColAttribute(isLastLeftPinned, isFirstRightPinned)}
      className={cn(
        "align-middle",
        bodyCellSpacing,
        props.tableLayout?.cellBorder && "border-e",
        props.tableLayout?.columnsResizable && column.getCanResize() && "truncate",
        cell.column.columnDef.meta?.cellClassName,
        props.tableLayout?.columnsPinnable &&
          column.getCanPin() &&
          '[&[data-pinned][data-last-col]]:border-border data-pinned:bg-background/90 data-pinned:backdrop-blur-xs" [&[data-pinned=left][data-last-col=left]]:border-e! [&[data-pinned=right][data-last-col=right]]:border-s!',
        column.getIndex() === 0 || column.getIndex() === row.getVisibleCells().length - 1
          ? props.tableClassNames?.edgeCell
          : "",
      )}
    >
      {children}
    </td>
  );
}

function DataGridTableEmpty() {
  const { table, props } = useDataGrid();

  return (
    <tr>
      <td
        colSpan={table.getVisibleFlatColumns().length}
        className="text-muted-foreground text-sm py-6 text-center"
      >
        {props.emptyMessage || "No data available"}
      </td>
    </tr>
  );
}

function DataGridTableLoader() {
  const { props } = useDataGrid();

  return (
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
      <div className="text-muted-foreground bg-card rounded-lg text-sm flex items-center gap-2 border px-4 py-2 leading-none font-medium">
        <svg
          className="text-muted-foreground -ml-1 size-5 animate-spin"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="3"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
        {props.loadingMessage || "Loading..."}
      </div>
    </div>
  );
}

function DataGridTable<TData>() {
  const { table, isLoading, props } = useDataGrid();
  const pagination = table.getState().pagination;
  const skeletonRowCount = props.skeletonRowCount ?? pagination?.pageSize;

  return (
    <DataGridTableBase>
      <DataGridTableHead>
        {table.getHeaderGroups().map((headerGroup: HeaderGroup<TData>, groupIndex) => {
          return (
            <DataGridTableHeadRow headerGroup={headerGroup} key={groupIndex}>
              {headerGroup.headers.map((header, headerIndex) => {
                const { column } = header;

                return (
                  <DataGridTableHeadRowCell header={header} key={headerIndex}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                    {props.tableLayout?.columnsResizable && column.getCanResize() && (
                      <DataGridTableHeadRowCellResize header={header} />
                    )}
                  </DataGridTableHeadRowCell>
                );
              })}
            </DataGridTableHeadRow>
          );
        })}
      </DataGridTableHead>

      {(props.tableLayout?.stripped || !props.tableLayout?.rowBorder) && <DataGridTableRowSpacer />}

      <DataGridTableBody>
        {(() => {
          if (isLoading && props.loadingMode === "skeleton" && skeletonRowCount) {
            return Array.from({ length: skeletonRowCount }).map((_, rowIndex) => (
              <DataGridTableBodyRowSkeleton key={rowIndex}>
                {table.getVisibleFlatColumns().map((column, colIndex) => {
                  return (
                    <DataGridTableBodyRowSkeletonCell column={column} key={colIndex}>
                      {column.columnDef.meta?.skeleton}
                    </DataGridTableBodyRowSkeletonCell>
                  );
                })}
              </DataGridTableBodyRowSkeleton>
            ));
          }
          if (isLoading && props.loadingMode === "spinner") {
            return (
              <tr>
                <td colSpan={table.getVisibleFlatColumns().length} className="p-8">
                  <div className="flex items-center justify-center">
                    <svg
                      className="text-muted-foreground mr-3 -ml-1 size-5 animate-spin"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    {props.loadingMessage || "Loading..."}
                  </div>
                </td>
              </tr>
            );
          }
          if (!table.getRowModel().rows.length) {
            return <DataGridTableEmpty />;
          }
          return table.getRowModel().rows.map((row: Row<TData>) => {
            const fullWidth = props.fullWidthRow?.(row.original);
            return (
              <Fragment key={row.id}>
                {fullWidth ? (
                  <DataGridTableBodyRowFullWidth row={row}>
                    {fullWidth}
                  </DataGridTableBodyRowFullWidth>
                ) : (
                  <DataGridTableBodyRow row={row}>
                    {row.getVisibleCells().map((cell: Cell<TData, unknown>, colIndex) => {
                      return (
                        <DataGridTableBodyRowCell cell={cell} key={colIndex}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </DataGridTableBodyRowCell>
                      );
                    })}
                  </DataGridTableBodyRow>
                )}
                {row.getIsExpanded() && <DataGridTableBodyRowExpandded row={row} />}
              </Fragment>
            );
          });
        })()}
      </DataGridTableBody>
    </DataGridTableBase>
  );
}

export {
  DataGridExpandedPanel,
  DataGridTable,
  DataGridTableBase,
  DataGridTableBody,
  DataGridTableBodyRow,
  DataGridTableBodyRowCell,
  DataGridTableBodyRowExpandded,
  DataGridTableBodyRowSkeleton,
  DataGridTableBodyRowSkeletonCell,
  DataGridTableEmpty,
  DataGridTableHead,
  DataGridTableHeadRow,
  DataGridTableHeadRowCell,
  DataGridTableHeadRowCellResize,
  DataGridTableLoader,
  DataGridTableRowSpacer,
};
