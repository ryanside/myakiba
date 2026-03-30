import type { ReactElement } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { parseDateOnly } from "@myakiba/utils/date-only";
import { formatDateOnlyForDisplay } from "@/lib/date-display";
import type { DateFormat } from "@myakiba/contracts/shared/types";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface PopoverDatePickerCellProps {
  value: string | null;
  dateFormat?: DateFormat;
  onSubmit: (newValue: string | null) => Promise<void>;
  disabled?: boolean;
  trigger?: ReactElement;
  triggerClassName?: string;
}

export function PopoverDatePickerCell({
  value,
  dateFormat = "MM/DD/YYYY",
  onSubmit,
  disabled = false,
  trigger,
  triggerClassName,
}: PopoverDatePickerCellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dateValue = value ? parseDateOnly(value) : undefined;
  const handleSelect = async (date: Date | undefined): Promise<void> => {
    if (date) {
      const formattedDate = format(date, "yyyy-MM-dd");
      await onSubmit(formattedDate);
    } else {
      await onSubmit(null);
    }
    setIsOpen(false);
  };

  const defaultTrigger = (
    <Button
      variant="ghost"
      data-empty={!dateValue}
      className={cn("text-foreground pl-0", triggerClassName)}
      disabled={disabled}
    >
      {value ? formatDateOnlyForDisplay(value, dateFormat) : "n/a"}
    </Button>
  );

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger render={trigger ?? defaultTrigger} />
      {isOpen && (
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={dateValue}
            onSelect={handleSelect}
            defaultMonth={dateValue ?? new Date()}
            captionLayout="dropdown"
          />
        </PopoverContent>
      )}
    </Popover>
  );
}
