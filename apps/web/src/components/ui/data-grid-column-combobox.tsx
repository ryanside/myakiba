import { type ReactNode, useState } from "react";
import { Check, Settings2 } from "lucide-react";
import { type Table } from "@tanstack/react-table";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DataGridColumnComboboxProps<TData> {
  table: Table<TData>;
  trigger?: ReactNode;
}

export function DataGridColumnCombobox<TData>({
  table,
  trigger,
}: DataGridColumnComboboxProps<TData>): React.ReactElement {
  const [open, setOpen] = useState(false);

  const columns = table
    .getAllColumns()
    .filter(
      (column) =>
        typeof column.accessorFn !== "undefined" && column.getCanHide()
    );

  const defaultTrigger = (
    <Button
      variant="outline"
      role="combobox"
      aria-expanded={open}
      className="justify-between"
    >
      <Settings2 className="h-4 w-4" />
      <span className="hidden md:block">Columns</span>
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
              {columns.map((column) => {
                const isVisible = column.getIsVisible();
                const columnName =
                  column.columnDef.meta?.headerTitle || column.id;

                return (
                  <CommandItem
                    key={column.id}
                    value={column.id}
                    onSelect={() => {
                      column.toggleVisibility(!isVisible);
                    }}
                    className="capitalize"
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        isVisible ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {columnName}
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

