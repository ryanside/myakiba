import type { ReactElement } from "react";
import { useId, useMemo, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Calendar01Icon } from "@hugeicons/core-free-icons";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { parseDateOnly } from "@myakiba/utils/date-only";
import { formatReleaseDate } from "@/lib/date-display";
import { releaseDateKey, releaseDateOnDay } from "@myakiba/contracts/shared/release-date";
import type { ReleaseDate } from "@myakiba/contracts/shared/release-date";
import { useRead } from "@/data/client";
import { orders } from "@/data/resources/orders";
import type { DateFormat } from "@myakiba/contracts/shared/types";
import type { OrderItemRelease } from "@/queries/orders";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { usePendingValue } from "@/hooks/use-pending-value";
import type { Saving } from "@/data/client";
import { CELL_TRIGGER_CLASS_NAME } from "./cell-trigger";
import { EmptyValue } from "./empty-value";
import { shownMessageOf } from "@/data/api";

interface PopoverReleaseDateCellProps {
  readonly id?: string;
  readonly value: ReleaseDate | null;
  readonly dateFormat?: DateFormat;
  readonly onSubmit: (newValue: ReleaseDate | null) => Saving;
  readonly disabled?: boolean;
  readonly trigger?: ReactElement;
  readonly triggerVariant?: "ghost" | "outline";
  readonly triggerClassName?: string;
  readonly placeholder?: string;
  readonly orderId?: string;
}

interface GroupedRelease {
  readonly key: string;
  readonly date: ReleaseDate;
  readonly image: string | null;
}

function groupReleases(releases: readonly OrderItemRelease[]): readonly GroupedRelease[] {
  const grouped = new Map<string, GroupedRelease>();
  for (const r of releases) {
    const key = releaseDateKey(r.releaseDate);
    if (!grouped.has(key)) grouped.set(key, { key, date: r.releaseDate, image: r.itemImage });
  }
  return [...grouped.values()];
}

const CLEAR_VALUE = "__clear__";

function ReleaseSelect({
  orderId,
  value,
  dateFormat,
  onSelect,
}: {
  readonly orderId: string;
  readonly value: ReleaseDate | null;
  readonly dateFormat: DateFormat;
  readonly onSelect: (date: ReleaseDate | null) => void;
}) {
  const { data: releases, isLoading, isError, error } = useRead(orders.itemReleases, orderId);

  const itemReleaseDates = useMemo(() => (releases ? groupReleases(releases) : []), [releases]);

  if (isLoading) {
    return (
      <div className="border-b p-2">
        <Skeleton className="h-7 w-full rounded-[min(var(--radius-md),10px)]" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="border-b p-2">
        <p className="text-destructive flex h-7 items-center text-xs">{shownMessageOf(error)}</p>
      </div>
    );
  }

  if (itemReleaseDates.length === 0) return null;

  const selectItems = itemReleaseDates.map((r) => ({
    label: formatReleaseDate(r.date, dateFormat),
    value: r.key,
  }));

  const valueKey = value ? releaseDateKey(value) : null;
  const matchedValue = selectItems.some((i) => i.value === valueKey) ? valueKey : null;

  return (
    <div className="border-b p-2">
      <Select
        value={matchedValue}
        onValueChange={(val) => {
          if (val === CLEAR_VALUE) {
            onSelect(null);
            return;
          }
          const picked = itemReleaseDates.find((release) => release.key === val);
          if (picked) onSelect(picked.date);
        }}
        items={selectItems}
      >
        <SelectTrigger size="sm" className="w-full">
          <SelectValue placeholder="From item release" />
        </SelectTrigger>
        <SelectContent align="start">
          <SelectGroup>
            {value && (
              <SelectItem value={CLEAR_VALUE} className="text-muted-foreground">
                Clear
              </SelectItem>
            )}
            {itemReleaseDates.map((release) => (
              <SelectItem key={release.key} value={release.key}>
                <div className="flex items-center gap-2">
                  {release.image && (
                    <img
                      src={release.image}
                      alt=""
                      className="size-5 shrink-0 rounded object-cover object-top"
                    />
                  )}
                  {formatReleaseDate(release.date, dateFormat)}
                </div>
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}

export function PopoverReleaseDateCell({
  id,
  value,
  dateFormat = "MM/DD/YYYY",
  onSubmit,
  disabled = false,
  trigger,
  triggerVariant = "ghost",
  triggerClassName,
  placeholder,
  orderId,
}: PopoverReleaseDateCellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const valueId = useId();
  const [displayValue, submit] = usePendingValue(value, onSubmit);
  const dateValue = displayValue ? parseDateOnly(displayValue.start) : undefined;

  const handleSelect = async (date: Date | undefined): Promise<void> => {
    setIsOpen(false);
    await submit(releaseDateOnDay(date ? format(date, "yyyy-MM-dd") : null));
  };

  const handleReleaseSelect = async (picked: ReleaseDate | null): Promise<void> => {
    setIsOpen(false);
    await submit(picked);
  };

  const getDisplayValue = (): string | null => {
    if (!(displayValue && dateValue)) return null;
    return formatReleaseDate(displayValue, triggerVariant === "outline" ? "long" : dateFormat);
  };
  const formattedDisplay = getDisplayValue();

  const defaultTrigger = (
    <Button
      id={id}
      variant={triggerVariant}
      data-empty={!dateValue}
      className={cn(
        "w-full justify-start",
        triggerVariant === "ghost" && [CELL_TRIGGER_CLASS_NAME, "text-foreground"],
        triggerVariant === "outline" &&
          "data-[empty=true]:text-muted-foreground text-left font-normal",
        triggerClassName,
      )}
      disabled={disabled}
      aria-describedby={id ? valueId : undefined}
    >
      {triggerVariant === "outline" && (
        <HugeiconsIcon icon={Calendar01Icon} data-icon="inline-start" />
      )}
      <span id={valueId}>{formattedDisplay ?? (placeholder || <EmptyValue />)}</span>
    </Button>
  );

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger render={trigger ?? defaultTrigger} />
      {isOpen && (
        <PopoverContent className="w-auto p-0" align="start">
          {orderId && (
            <ReleaseSelect
              orderId={orderId}
              value={displayValue}
              dateFormat={dateFormat}
              onSelect={handleReleaseSelect}
            />
          )}
          <Calendar
            mode="single"
            selected={displayValue?.precision === "day" ? dateValue : undefined}
            onSelect={handleSelect}
            defaultMonth={dateValue ?? new Date()}
            captionLayout="dropdown"
            autoFocus={!orderId}
          />
        </PopoverContent>
      )}
    </Popover>
  );
}
