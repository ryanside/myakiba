import type { ReactNode } from "react";
import { ArrowUp, ArrowDown, ArrowUpDown, X } from "lucide-react";
import type { Table } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DataGridSortComboboxProps<TData> {
  table: Table<TData>;
  onSortChange: (columnId: string | null, direction: "asc" | "desc" | null) => void;
  trigger?: ReactNode;
}

export function DataGridSortCombobox<TData>({
  table,
  onSortChange,
  trigger,
}: DataGridSortComboboxProps<TData>): React.ReactElement {

  const columns = table
    .getAllColumns()
    .filter(
      (column) =>
        column.getCanSort() && typeof column.accessorFn !== "undefined"
    );

  const currentSort = table.getState().sorting[0];
  const currentColumnName = currentSort
    ? columns.find((col) => col.id === currentSort.id)?.columnDef.meta
        ?.headerTitle || currentSort.id
    : null;

  const handleSort = (columnId: string | null): void => {
    if (columnId === null) {
      // Clear sorting
      onSortChange(null, null);
      return;
    }

    const isCurrentColumn = currentSort?.id === columnId;
    const isAsc = isCurrentColumn && !currentSort?.desc;
    const isDesc = isCurrentColumn && currentSort?.desc;

    // Toggle logic: none -> asc -> desc -> none
    if (!isCurrentColumn) {
      // Not currently sorted, set to ascending
      onSortChange(columnId, "asc");
    } else if (isAsc) {
      // Currently ascending, toggle to descending
      onSortChange(columnId, "desc");
    } else if (isDesc) {
      // Currently descending, clear sort
      onSortChange(null, null);
    }
  };

  const getSortIcon = (columnId: string): React.ReactElement | null => {
    if (currentSort?.id !== columnId) return null;

    return currentSort.desc ? (
      <ArrowDown className="h-4 w-4 ml-auto text-primary" />
    ) : (
      <ArrowUp className="h-4 w-4 ml-auto text-primary" />
    );
  };

  const getSortButtonIcon = (): React.ReactElement => {
    if (!currentSort || currentColumnName === "createdAt") return <ArrowUpDown className="h-4 w-4" />;
    return currentSort.desc ? (
      <ArrowDown className="h-4 w-4" />
    ) : (
      <ArrowUp className="h-4 w-4" />
    );
  };

  const defaultTrigger = (
    <Button
      variant="outline"
      role="combobox"
      className="justify-between"
    >
      {getSortButtonIcon()}
      <span className="hidden md:block">
        {currentColumnName && currentColumnName !== "createdAt"
          ? `${currentColumnName}`
          : "Sort By"}
      </span>
    </Button>
  );

  return (
    <Popover>
      <PopoverTrigger asChild>{trigger || defaultTrigger}</PopoverTrigger>
      <PopoverContent className="w-[200px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search columns..." />
          <CommandList>
            <CommandEmpty>No column found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="clear-sort"
                onSelect={() => handleSort(null)}
                className="text-muted-foreground"
              >
                <X className="mr-2 h-4 w-4" />
                Clear sorting
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup>
              {columns.map((column) => {
                const columnName =
                  column.columnDef.meta?.headerTitle || column.id;

                return (
                  <CommandItem
                    key={column.id}
                    value={column.id}
                    onSelect={() => handleSort(column.id)}
                    className="capitalize"
                  >
                    {columnName}
                    {getSortIcon(column.id)}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

