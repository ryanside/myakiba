import type { ReactElement } from "react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { formatDateOnlyForDisplay } from "@/lib/date-display";
import { orderItemReleasesQueryOptions } from "@/hooks/use-orders";
import type { DateFormat } from "@myakiba/contracts/shared/types";
import type { OrderItemRelease } from "@/queries/orders";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface PopoverReleaseDateCellProps {
  readonly value: string | null;
  readonly dateFormat?: DateFormat;
  readonly onSubmit: (newValue: string | null) => Promise<void>;
  readonly disabled?: boolean;
  readonly trigger?: ReactElement;
  readonly triggerVariant?: "ghost" | "outline";
  readonly triggerClassName?: string;
  readonly placeholder?: string;
  readonly orderId?: string;
}

interface GroupedRelease {
  readonly date: string;
  readonly image: string | null;
}

function groupReleases(releases: readonly OrderItemRelease[]): readonly GroupedRelease[] {
  const grouped = new Map<string, { image: string | null }>();
  for (const r of releases) {
    if (!grouped.has(r.releaseDate)) {
      grouped.set(r.releaseDate, { image: r.itemImage });
    }
  }
  return Array.from(grouped.entries())
    .map(([date, { image }]) => ({ date, image }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

const CLEAR_VALUE = "__clear__";

function ReleaseSelect({
  orderId,
  value,
  dateFormat,
  onSelect,
}: {
  readonly orderId: string;
  readonly value: string | null;
  readonly dateFormat: DateFormat;
  readonly onSelect: (date: string | null) => void;
}) {
  const {
    data: releases,
    isLoading,
    isError,
    error,
  } = useQuery(orderItemReleasesQueryOptions(orderId));

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
        <p className="text-destructive flex h-7 items-center text-xs">{error.message}</p>
      </div>
    );
  }

  if (itemReleaseDates.length === 0) return null;

  const selectItems = itemReleaseDates.map((r) => ({
    label: formatDateOnlyForDisplay(r.date, dateFormat),
    value: r.date,
  }));

  const matchedValue = value && selectItems.some((i) => i.value === value) ? value : null;

  return (
    <div className="border-b p-2">
      <Select
        value={matchedValue}
        onValueChange={(val) => {
          if (val === CLEAR_VALUE) {
            onSelect(null);
          } else if (val) {
            onSelect(val);
          }
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
              <SelectItem key={release.date} value={release.date}>
                <div className="flex items-center gap-2">
                  {release.image && (
                    <img
                      src={release.image}
                      alt=""
                      className="size-5 shrink-0 rounded object-cover object-top"
                    />
                  )}
                  {formatDateOnlyForDisplay(release.date, dateFormat)}
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

  const handleReleaseSelect = async (dateOrNull: string | null): Promise<void> => {
    await onSubmit(dateOrNull);
    setIsOpen(false);
  };

  const displayValue =
    value && dateValue
      ? triggerVariant === "outline"
        ? format(dateValue, "PPP")
        : formatDateOnlyForDisplay(value, dateFormat)
      : null;

  const defaultTrigger = (
    <Button
      variant={triggerVariant}
      data-empty={!dateValue}
      className={cn(
        "w-full justify-start",
        triggerVariant === "ghost" && "text-foreground pl-0",
        triggerVariant === "outline" &&
          "data-[empty=true]:text-muted-foreground text-left font-normal",
        triggerClassName,
      )}
      disabled={disabled}
    >
      {triggerVariant === "outline" && (
        <HugeiconsIcon icon={Calendar01Icon} className="mr-2 h-4 w-4" />
      )}
      {displayValue ?? (placeholder ? <span>{placeholder}</span> : "n/a")}
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
              value={value}
              dateFormat={dateFormat}
              onSelect={handleReleaseSelect}
            />
          )}
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
