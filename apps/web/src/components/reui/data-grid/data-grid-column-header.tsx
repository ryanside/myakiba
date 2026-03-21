"use client";

import { memo, useMemo } from "react";
import { useDataGrid } from "@/components/reui/data-grid/data-grid";
import type { Column } from "@tanstack/react-table";
import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowDown02Icon,
  ArrowUp02Icon,
  UnfoldMoreIcon,
  Tick02Icon,
  ArrowLeft03Icon,
  ArrowRight03Icon,
  ArrowLeft02Icon,
  ArrowRight02Icon,
  DragDropVerticalIcon,
  PinOffIcon,
} from "@hugeicons/core-free-icons";

interface DataGridColumnHeaderProps<TData, TValue> extends HTMLAttributes<HTMLDivElement> {
  column: Column<TData, TValue>;
  title?: string;
  icon?: ReactNode;
  pinnable?: boolean;
  filter?: ReactNode;
  visibility?: boolean;
}

function DataGridColumnHeaderInner<TData, TValue>({
  column,
  title = "",
  icon,
  className,
  filter,
  visibility = false,
}: DataGridColumnHeaderProps<TData, TValue>) {
  const { isLoading, table, props, recordCount } = useDataGrid();

  const columnOrder = table.getState().columnOrder;
  const columnVisibilityKey = JSON.stringify(table.getState().columnVisibility);
  const isSorted = column.getIsSorted();
  const isPinned = column.getIsPinned();
  const canSort = column.getCanSort();
  const canPin = column.getCanPin();
  const canResize = column.getCanResize();

  const columnIndex = columnOrder.indexOf(column.id);
  const canMoveLeft = columnIndex > 0;
  const canMoveRight = columnIndex < columnOrder.length - 1;

  const handleSort = () => {
    if (isSorted === "asc") {
      column.toggleSorting(true);
    } else if (isSorted === "desc") {
      column.clearSorting();
    } else {
      column.toggleSorting(false);
    }
  };

  const headerLabelClassName = cn(
    "text-secondary-foreground/80 inline-flex h-full items-center gap-1.5 font-normal [&_svg]:opacity-60 text-[0.8125rem] leading-[calc(1.125/0.8125)] [&_svg]:size-3.5",
    className,
  );

  const headerButtonClassName = cn(
    "text-secondary-foreground/80 hover:bg-secondary data-open:bg-secondary hover:text-foreground data-open:text-foreground -ms-2 px-2 font-normal h-6 rounded-lg",
    className,
  );

  const sortIcon =
    canSort &&
    (isSorted === "desc" ? (
      <HugeiconsIcon icon={ArrowDown02Icon} strokeWidth={2} className="size-3.25" />
    ) : isSorted === "asc" ? (
      <HugeiconsIcon icon={ArrowUp02Icon} strokeWidth={2} className="size-3.25" />
    ) : (
      <HugeiconsIcon icon={UnfoldMoreIcon} strokeWidth={2} className="mt-px size-3.25" />
    ));

  const hasControls =
    props.tableLayout?.columnsMovable ||
    (props.tableLayout?.columnsVisibility && visibility) ||
    (props.tableLayout?.columnsPinnable && canPin) ||
    filter;

  const menuItems = useMemo(() => {
    const items: ReactNode[] = [];
    let hasPreviousSection = false;

    // Filter section
    if (filter) {
      items.push(
        <DropdownMenuGroup key="group-filter">
          <DropdownMenuLabel key="filter">{filter}</DropdownMenuLabel>
        </DropdownMenuGroup>,
      );
      hasPreviousSection = true;
    }

    // Sort section
    if (canSort) {
      if (hasPreviousSection) {
        items.push(<DropdownMenuSeparator key="sep-sort" />);
      }
      items.push(
        <DropdownMenuItem
          key="sort-asc"
          onClick={() => {
            if (isSorted === "asc") {
              column.clearSorting();
            } else {
              column.toggleSorting(false);
            }
          }}
          disabled={!canSort}
        >
          <HugeiconsIcon icon={ArrowUp02Icon} strokeWidth={2} className="size-3.5!" />
          <span className="grow">Asc</span>
          {isSorted === "asc" && (
            <HugeiconsIcon
              icon={Tick02Icon}
              strokeWidth={2}
              className="text-primary size-4 opacity-100!"
            />
          )}
        </DropdownMenuItem>,
        <DropdownMenuItem
          key="sort-desc"
          onClick={() => {
            if (isSorted === "desc") {
              column.clearSorting();
            } else {
              column.toggleSorting(true);
            }
          }}
          disabled={!canSort}
        >
          <HugeiconsIcon icon={ArrowDown02Icon} strokeWidth={2} className="size-3.5!" />
          <span className="grow">Desc</span>
          {isSorted === "desc" && (
            <HugeiconsIcon
              icon={Tick02Icon}
              strokeWidth={2}
              className="text-primary size-4 opacity-100!"
            />
          )}
        </DropdownMenuItem>,
      );
      hasPreviousSection = true;
    }

    // Pin section
    if (props.tableLayout?.columnsPinnable && canPin) {
      if (hasPreviousSection) {
        items.push(<DropdownMenuSeparator key="sep-pin" />);
      }
      items.push(
        <DropdownMenuItem
          key="pin-left"
          onClick={() => column.pin(isPinned === "left" ? false : "left")}
        >
          <HugeiconsIcon
            icon={ArrowLeft03Icon}
            strokeWidth={2}
            className="size-3.5!"
            aria-hidden="true"
          />
          <span className="grow">Pin to left</span>
          {isPinned === "left" && (
            <HugeiconsIcon
              icon={Tick02Icon}
              strokeWidth={2}
              className="text-primary size-4 opacity-100!"
            />
          )}
        </DropdownMenuItem>,
        <DropdownMenuItem
          key="pin-right"
          onClick={() => column.pin(isPinned === "right" ? false : "right")}
        >
          <HugeiconsIcon
            icon={ArrowRight03Icon}
            strokeWidth={2}
            className="size-3.5!"
            aria-hidden="true"
          />
          <span className="grow">Pin to right</span>
          {isPinned === "right" && (
            <HugeiconsIcon
              icon={Tick02Icon}
              strokeWidth={2}
              className="text-primary size-4 opacity-100!"
            />
          )}
        </DropdownMenuItem>,
      );
      hasPreviousSection = true;
    }

    // Move section
    if (props.tableLayout?.columnsMovable) {
      if (hasPreviousSection) {
        items.push(<DropdownMenuSeparator key="sep-move" />);
      }
      items.push(
        <DropdownMenuItem
          key="move-left"
          onClick={() => {
            if (columnIndex > 0) {
              const newOrder = [...columnOrder];
              const [movedColumn] = newOrder.splice(columnIndex, 1);
              newOrder.splice(columnIndex - 1, 0, movedColumn);
              table.setColumnOrder(newOrder);
            }
          }}
          disabled={!canMoveLeft || isPinned !== false}
        >
          <HugeiconsIcon
            icon={ArrowLeft02Icon}
            strokeWidth={2}
            className="size-3.5!"
            aria-hidden="true"
          />
          <span>Move to Left</span>
        </DropdownMenuItem>,
        <DropdownMenuItem
          key="move-right"
          onClick={() => {
            if (columnIndex < columnOrder.length - 1) {
              const newOrder = [...columnOrder];
              const [movedColumn] = newOrder.splice(columnIndex, 1);
              newOrder.splice(columnIndex + 1, 0, movedColumn);
              table.setColumnOrder(newOrder);
            }
          }}
          disabled={!canMoveRight || isPinned !== false}
        >
          <HugeiconsIcon
            icon={ArrowRight02Icon}
            strokeWidth={2}
            className="size-3.5!"
            aria-hidden="true"
          />
          <span>Move to Right</span>
        </DropdownMenuItem>,
      );
      hasPreviousSection = true;
    }

    // Visibility section
    if (props.tableLayout?.columnsVisibility && visibility) {
      if (hasPreviousSection) {
        items.push(<DropdownMenuSeparator key="sep-visibility" />);
      }
      items.push(
        <DropdownMenuSub key="visibility">
          <DropdownMenuSubTrigger>
            <HugeiconsIcon icon={DragDropVerticalIcon} strokeWidth={2} className="size-3.5!" />
            <span>Columns</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent side="right">
            {table
              .getAllColumns()
              .filter((col) => typeof col.accessorFn !== "undefined" && col.getCanHide())
              .map((col) => (
                <DropdownMenuCheckboxItem
                  key={col.id}
                  checked={col.getIsVisible()}
                  onSelect={(event) => event.preventDefault()}
                  onCheckedChange={(value) => col.toggleVisibility(!!value)}
                  className="capitalize"
                >
                  {col.columnDef.meta?.headerTitle || col.id}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>,
      );
    }

    return items;
  }, [
    filter,
    canSort,
    isSorted,
    column,
    props.tableLayout?.columnsPinnable,
    props.tableLayout?.columnsMovable,
    props.tableLayout?.columnsVisibility,
    canPin,
    isPinned,
    canMoveLeft,
    canMoveRight,
    visibility,
    table,
    columnIndex,
    columnOrder,
    columnVisibilityKey, // Needed to update checkbox states when visibility changes
  ]);

  if (hasControls) {
    return (
      <div className="flex h-full items-center justify-between gap-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                className={headerButtonClassName}
                disabled={isLoading || recordCount === 0}
              >
                {icon && icon}
                {title}
                {sortIcon}
              </Button>
            }
          />
          <DropdownMenuContent className="w-40" align="start">
            {menuItems}
          </DropdownMenuContent>
        </DropdownMenu>
        {props.tableLayout?.columnsPinnable && canPin && isPinned && (
          <Button
            size="icon-sm"
            variant="ghost"
            className="-me-1 size-7 rounded-md"
            onClick={() => column.pin(false)}
            aria-label={`Unpin ${title} column`}
            title={`Unpin ${title} column`}
          >
            <HugeiconsIcon
              icon={PinOffIcon}
              strokeWidth={2}
              className="size-3.5! opacity-50!"
              aria-hidden="true"
            />
          </Button>
        )}
      </div>
    );
  }

  if (canSort || (props.tableLayout?.columnsResizable && canResize)) {
    return (
      <div className="flex h-full items-center">
        <Button
          variant="ghost"
          className={headerButtonClassName}
          disabled={isLoading || recordCount === 0}
          onClick={handleSort}
        >
          {icon && icon}
          {title}
          {sortIcon}
        </Button>
      </div>
    );
  }

  return (
    <div className={headerLabelClassName}>
      {icon && icon}
      {title}
    </div>
  );
}

const DataGridColumnHeader = memo(DataGridColumnHeaderInner) as typeof DataGridColumnHeaderInner;

export { DataGridColumnHeader, type DataGridColumnHeaderProps };
