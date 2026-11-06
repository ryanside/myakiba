import { HugeiconsIcon } from "@hugeicons/react";
import { useId, useState } from "react";
import type { ReactElement } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SortAscendingIcon, SortDescendingIcon, UnsortedIcon } from "@/lib/icons";

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
  onSortChange: (columnId: string | null, direction: "asc" | "desc" | null) => void;
  trigger?: ReactElement;
}

export function SortCombobox({
  columns,
  currentSort,
  onSortChange,
  trigger,
}: SortComboboxProps): React.ReactElement {
  const listboxId = useId();
  const [isOpen, setIsOpen] = useState(false);

  const handleSort = (columnId: string | null): void => {
    if (columnId === null) {
      onSortChange(null, null);
      return;
    }

    if (!currentSort || currentSort.columnId !== columnId) {
      onSortChange(columnId, "asc");
    } else if (currentSort.direction === "asc") {
      onSortChange(columnId, "desc");
    } else {
      onSortChange(null, null);
    }
  };

  const getSortIcon = (columnId: string): React.ReactElement | null => {
    if (currentSort?.columnId !== columnId) return null;

    return currentSort.direction === "desc" ? (
      <HugeiconsIcon icon={SortDescendingIcon} className="ml-auto size-4 text-primary" />
    ) : (
      <HugeiconsIcon icon={SortAscendingIcon} className="ml-auto size-4 text-primary" />
    );
  };

  const getSortButtonIcon = (): React.ReactElement => {
    if (!currentSort) {
      return <HugeiconsIcon icon={UnsortedIcon} data-icon="inline-start" />;
    }
    return currentSort.direction === "desc" ? (
      <HugeiconsIcon icon={SortDescendingIcon} data-icon="inline-start" />
    ) : (
      <HugeiconsIcon icon={SortAscendingIcon} data-icon="inline-start" />
    );
  };

  const currentColumnName = currentSort
    ? columns.find((col) => col.id === currentSort.columnId)?.label || currentSort.columnId
    : null;

  const defaultTrigger = (
    <Button
      variant="outline"
      role="combobox"
      aria-controls={listboxId}
      aria-expanded={isOpen}
      className="justify-between"
    >
      {getSortButtonIcon()}
      <span className="max-md:sr-only">{currentColumnName || "Sort"}</span>
    </Button>
  );

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger render={trigger ?? defaultTrigger} />
      <PopoverContent className="w-[200px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search columns..." />
          <CommandList id={listboxId}>
            <CommandEmpty>No column found.</CommandEmpty>
            <CommandGroup>
              {columns.map((column) => {
                return (
                  <CommandItem
                    key={column.id}
                    value={column.id}
                    onSelect={() => handleSort(column.id)}
                    className="capitalize *:last:hidden"
                  >
                    {column.label}
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
