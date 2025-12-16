import { type ReactNode, useState } from "react";
import { ArrowUp, ArrowDown, ArrowUpDown, X } from "lucide-react";
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
import { Scroller } from "./scroller";

export type SortableColumn = {
  id: string;
  label: string;
};

interface SortComboboxProps {
  columns: SortableColumn[];
  currentSort?: {
    columnId: string;
    direction: "asc" | "desc";
  } | null;
  onSortChange: (
    columnId: string | null,
    direction: "asc" | "desc" | null
  ) => void;
  trigger?: ReactNode;
}

export function SortCombobox({
  columns,
  currentSort,
  onSortChange,
  trigger,
}: SortComboboxProps): React.ReactElement {
  const [open, setOpen] = useState(false);

  const handleSort = (columnId: string | null): void => {
    if (columnId === null) {
      // Clear sorting
      onSortChange(null, null);
      return;
    }

    const isCurrentColumn = currentSort?.columnId === columnId;
    const isAsc = isCurrentColumn && currentSort?.direction === "asc";
    const isDesc = isCurrentColumn && currentSort?.direction === "desc";

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
    if (currentSort?.columnId !== columnId) return null;

    return currentSort.direction === "desc" ? (
      <ArrowDown className="h-4 w-4 ml-auto text-primary" />
    ) : (
      <ArrowUp className="h-4 w-4 ml-auto text-primary" />
    );
  };

  const getSortButtonIcon = (): React.ReactElement => {
    if (!currentSort || currentSort.columnId === "createdAt") {
      return <ArrowUpDown className="h-4 w-4" />;
    }
    return currentSort.direction === "desc" ? (
      <ArrowDown className="h-4 w-4" />
    ) : (
      <ArrowUp className="h-4 w-4" />
    );
  };

  const currentColumnName = currentSort
    ? columns.find((col) => col.id === currentSort.columnId)?.label ||
      currentSort.columnId
    : null;

  const defaultTrigger = (
    <Button
      variant="outline"
      role="combobox"
      aria-expanded={open}
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
    <Popover open={open} onOpenChange={setOpen}>
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
              <Scroller className="max-h-96">
                {columns.map((column) => {
                  return (
                    <CommandItem
                      key={column.id}
                      value={column.id}
                      onSelect={() => handleSort(column.id)}
                      className="capitalize"
                    >
                      {column.label}
                      {getSortIcon(column.id)}
                    </CommandItem>
                  );
                })}
              </Scroller>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

