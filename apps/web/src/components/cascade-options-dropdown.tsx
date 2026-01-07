import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";
import type { CascadeOptions } from "@/lib/orders/types";

interface CascadeOptionsDropdownProps {
  cascadeOptions: CascadeOptions;
  cascadeDisplayText: string;
  cascadeOptionsList: readonly string[];
  handleSelectAll: () => void;
  handleSelectNone: () => void;
  handleCascadeOptionChange: (
    option: CascadeOptions[number],
    checked: boolean
  ) => void;
}

export function CascadeOptionsDropdown({
  cascadeOptions,
  cascadeDisplayText,
  cascadeOptionsList,
  handleSelectAll,
  handleSelectNone,
  handleCascadeOptionChange,
}: CascadeOptionsDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="max-w-66 truncate justify-between hover:bg-background active:bg-background data-[state=open]:bg-background"
        >
          {cascadeDisplayText}
          <ChevronDown className="h-4 w-4 z-10" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)]">
        <div className="flex gap-2 py-1">
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 h-8 text-xs"
            onClick={handleSelectAll}
            type="button"
          >
            Select All
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 h-8 text-xs"
            onClick={handleSelectNone}
            type="button"
          >
            Select None
          </Button>
        </div>
        <DropdownMenuSeparator />
        {cascadeOptionsList.map((option) => (
          <DropdownMenuCheckboxItem
            key={option}
            onSelect={(e) => {
              e.preventDefault();
            }}
            checked={cascadeOptions.includes(
              option as CascadeOptions[number]
            )}
            onCheckedChange={(checked) =>
              handleCascadeOptionChange(
                option as CascadeOptions[number],
                checked
              )
            }
          >
            {option}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

