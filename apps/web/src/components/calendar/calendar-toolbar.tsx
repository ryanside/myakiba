import type { ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import type { CalendarView } from "@myakiba/contracts/calendar/schema";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

interface CalendarToolbarProps {
  readonly view: CalendarView;
  readonly month: number;
  readonly year: number;
  readonly yearOptions: readonly number[];
  readonly onShiftMonth: (delta: number) => void;
  readonly onChangeMonth: (month: number) => void;
  readonly onChangeYear: (year: number) => void;
  readonly onChangeView: (view: string) => void;
}

export function CalendarToolbar({
  view,
  month,
  year,
  yearOptions,
  onShiftMonth,
  onChangeMonth,
  onChangeYear,
  onChangeView,
}: CalendarToolbarProps): ReactNode {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex items-center" role="group" aria-label="Select month">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => onShiftMonth(-1)}
          aria-label="Previous month"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} className="size-4" />
        </Button>
        <NativeSelect
          size="sm"
          aria-label="Month"
          value={month}
          onChange={(event) => onChangeMonth(Number(event.target.value))}
        >
          {MONTH_NAMES.map((name, idx) => (
            <NativeSelectOption key={name} value={idx + 1}>
              {name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect
          size="sm"
          aria-label="Year"
          value={year}
          onChange={(event) => onChangeYear(Number(event.target.value))}
          className="ml-1"
        >
          {yearOptions.map((y) => (
            <NativeSelectOption key={y} value={y}>
              {y}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => onShiftMonth(1)}
          aria-label="Next month"
        >
          <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="size-4" />
        </Button>
      </div>

      <Tabs value={view} onValueChange={onChangeView} className="ml-auto shrink-0">
        <TabsList variant="line">
          <TabsTrigger value="items">Items</TabsTrigger>
          <TabsTrigger value="orders">Orders</TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}
