import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { parseLocalDate, formatDate } from "@myakiba/utils";
import { format } from "date-fns";
import * as Portal from "@radix-ui/react-portal";

interface PopoverDatePickerCellProps {
  value: string | null;
  onSubmit: (newValue: string | null) => Promise<void>;
}

export function PopoverDatePickerCell({
  value,
  onSubmit,
}: PopoverDatePickerCellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dateValue = value ? parseLocalDate(value) : undefined;
  const handleSelect = async (date: Date | undefined): Promise<void> => {
    if (!date) return;

    const formattedDate = format(date, "yyyy-MM-dd");
    await onSubmit(formattedDate);
    setIsOpen(false);
  };

  const handleClear = async (): Promise<void> => {
    await onSubmit(null);
    setIsOpen(false);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          data-empty={!dateValue}
          className="text-foreground pl-0"
        >
          {value ? formatDate(value) : "n/a"}
        </Button>
      </PopoverTrigger>
      {isOpen && (
        <Portal.Root>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={dateValue}
              onSelect={handleSelect}
              defaultMonth={dateValue ?? new Date()}
              captionLayout="dropdown"
            />
            <div className="border-t p-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={handleClear}
              >
                Clear
              </Button>
            </div>
          </PopoverContent>
        </Portal.Root>
      )}
    </Popover>
  );
}
