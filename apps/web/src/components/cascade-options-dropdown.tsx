import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CascadeOptions } from "@myakiba/types/orders";

interface CascadeOptionsDropdownProps {
  readonly cascadeOptions: CascadeOptions;
  readonly cascadeDisplayText: string;
  readonly cascadeOptionsList: readonly CascadeOptions[number][];
  readonly handleSelectAll: () => void;
  readonly handleSelectNone: () => void;
  readonly handleCascadeOptionChange: (option: CascadeOptions[number], checked: boolean) => void;
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
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            className="max-w-66 truncate justify-between hover:bg-background active:bg-background data-open:bg-background"
          >
            {cascadeDisplayText}
            <HugeiconsIcon icon={ArrowDown01Icon} className="h-4 w-4 z-10" />
          </Button>
        }
      />
      <DropdownMenuContent className="w-(--anchor-width)">
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
            checked={cascadeOptions.includes(option)}
            onCheckedChange={(checked) => handleCascadeOptionChange(option, checked)}
          >
            {option}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
