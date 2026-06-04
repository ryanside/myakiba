import { HugeiconsIcon } from "@hugeicons/react";
import { Calendar01Icon } from "@hugeicons/core-free-icons";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { parseDateOnly } from "@myakiba/utils/date-only";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface DatePickerProps {
  id?: string;
  name?: string;
  value?: string | null;
  onChange?: (value: string | null) => void;
  onBlur?: () => void;
  placeholder?: string;
  className?: string;
}

export function DatePicker({
  id,
  name,
  value,
  onChange,
  onBlur,
  placeholder = "Pick a date",
  className,
}: DatePickerProps) {
  const dateValue = value ? parseDateOnly(value) : undefined;

  const handleSelect = (date: Date | undefined): void => {
    if (!onChange) return;

    if (date) {
      // Format date as YYYY-MM-DD to match the input[type="date"] format
      const formattedDate = format(date, "yyyy-MM-dd");
      onChange(formattedDate);
    } else {
      onChange(null);
    }
  };

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            id={id}
            name={name}
            variant="outline"
            data-empty={!dateValue}
            onBlur={onBlur}
            className={cn(
              "data-[empty=true]:text-muted-foreground w-full min-w-0 justify-start gap-2 overflow-hidden text-left font-normal",
              className,
            )}
            title={dateValue ? format(dateValue, "PPP") : undefined}
          >
            <HugeiconsIcon icon={Calendar01Icon} className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">
              {dateValue ? format(dateValue, "PPP") : placeholder}
            </span>
          </Button>
        }
      />
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          defaultMonth={dateValue}
          selected={dateValue}
          onSelect={handleSelect}
          captionLayout="dropdown"
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
