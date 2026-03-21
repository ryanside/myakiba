import { HugeiconsIcon } from "@hugeicons/react";
import { DragDropVerticalIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { useId, useState, type ReactElement } from "react";
import type { Table } from "@tanstack/react-table";
import { cn } from "@/lib/utils";
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
import { Scroller } from "./scroller";

interface DataGridColumnComboboxProps<TData> {
  table: Table<TData>;
  trigger?: ReactElement;
}

export function DataGridColumnCombobox<TData>({
  table,
  trigger,
}: DataGridColumnComboboxProps<TData>): React.ReactElement {
  const listboxId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const columns = table
    .getAllColumns()
    .filter((column) => typeof column.accessorFn !== "undefined" && column.getCanHide());

  const defaultTrigger = (
    <Button
      variant="outline"
      role="combobox"
      aria-controls={listboxId}
      aria-expanded={isOpen}
      aria-haspopup="listbox"
      className="justify-between"
    >
      <HugeiconsIcon icon={DragDropVerticalIcon} className="h-4 w-4" />
      <span className="hidden md:block">Columns</span>
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
              <Scroller className="max-h-96">
                {columns.map((column) => {
                  const isVisible = column.getIsVisible();
                  const columnName = column.columnDef.meta?.headerTitle || column.id;

                  return (
                    <CommandItem
                      key={column.id}
                      value={column.id}
                      onSelect={() => {
                        column.toggleVisibility(!isVisible);
                      }}
                      className="capitalize"
                    >
                      <HugeiconsIcon
                        icon={Tick02Icon}
                        className={cn(
                          "mr-2 h-4 w-4 text-primary",
                          isVisible ? "opacity-100" : "opacity-0",
                        )}
                      />
                      {columnName}
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
