import type { ReactNode } from "react";
import { useMemo } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { CryingIcon } from "@hugeicons/core-free-icons";
import type { Currency } from "@myakiba/contracts/shared/types";
import { CalendarItemRow } from "@/components/calendar/calendar-item-row";
import { CalendarOrderRow } from "@/components/calendar/calendar-order-row";
import Loader from "@/components/loader";
import { cn } from "@/lib/utils";
import type { CalendarResponse } from "@/queries/calendar";

const DATE_GROUP_LABEL_FORMATTER = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
});

interface CalendarReleaseListProps<TItem> {
  readonly items: readonly TItem[];
  readonly getDate: (item: TItem) => string | null;
  readonly getKey: (item: TItem) => string;
  readonly renderRow: (item: TItem) => ReactNode;
  readonly emptyLabel: string;
  readonly selectedDays?: ReadonlySet<number>;
}

function CalendarReleaseList<TItem>({
  items,
  getDate,
  getKey,
  renderRow,
  emptyLabel,
  selectedDays,
}: CalendarReleaseListProps<TItem>): ReactNode {
  const isFilteringByDay = selectedDays != null && selectedDays.size > 0;
  const groups = useMemo(() => {
    const map = new Map<string, TItem[]>();
    for (const item of items) {
      const date = getDate(item);
      if (!date) continue;
      const existing = map.get(date);
      if (existing) {
        existing.push(item);
      } else {
        map.set(date, [item]);
      }
    }
    return [...map.entries()].toSorted(([a], [b]) => new Date(a).getTime() - new Date(b).getTime());
  }, [items, getDate]);

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-1.5 py-10 text-center">
        <HugeiconsIcon icon={CryingIcon} className="size-5 text-muted-foreground/50" />
        <p className="text-xs text-muted-foreground">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <ol className="animate-data-in flex flex-col gap-5 [--data-in-delay:60ms]">
      {groups.map(([date, dayItems]) => {
        const dayNumber = Number(date.slice(8, 10));
        const isSelected = isFilteringByDay && selectedDays.has(dayNumber);

        return (
          <li key={date} className="flex flex-col gap-1.5">
            <div className="sticky top-0 z-10 flex items-center gap-2 bg-background pb-1">
              <span
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 text-xs font-medium tabular-nums",
                  isSelected
                    ? "rounded-md bg-primary/10 px-2 py-0.5 text-primary ring-1 ring-inset ring-primary/30"
                    : "text-muted-foreground",
                )}
              >
                {isSelected && (
                  <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-primary" />
                )}
                {DATE_GROUP_LABEL_FORMATTER.format(new Date(`${date}T00:00:00`))}
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <ul>
              {dayItems.map((item) => (
                <li key={getKey(item)}>{renderRow(item)}</li>
              ))}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}

interface CalendarReleasePanelProps {
  readonly data: CalendarResponse | undefined;
  readonly isPending: boolean;
  readonly selectedDays: ReadonlySet<number>;
  readonly currency: Currency;
  readonly locale: string;
}

export function CalendarReleasePanel({
  data,
  isPending,
  selectedDays,
  currency,
  locale,
}: CalendarReleasePanelProps): ReactNode {
  if (isPending || !data) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex min-h-0 w-full flex-1 items-start justify-center overflow-y-auto pt-16">
          <Loader className="h-auto w-auto" />
        </div>
      </div>
    );
  }

  if (data.view === "items") {
    return (
      <FilteredReleaseList
        rows={data.items}
        selectedDays={selectedDays}
        getDate={(item) => item.releaseDate}
        getKey={(item) => `${item.collectionId}:${item.releaseDate}`}
        renderRow={(item) => <CalendarItemRow item={item} currency={currency} />}
        emptyMonthLabel="Nothing releasing this month"
        emptyFilteredLabel="No releases on the selected days"
      />
    );
  }

  return (
    <FilteredReleaseList
      rows={data.orders}
      selectedDays={selectedDays}
      getDate={(order) => order.releaseDate}
      getKey={(order) => order.orderId}
      renderRow={(order) => <CalendarOrderRow order={order} currency={currency} locale={locale} />}
      emptyMonthLabel="No orders releasing this month"
      emptyFilteredLabel="No orders on the selected days"
    />
  );
}

interface FilteredReleaseListProps<TItem> {
  readonly rows: readonly TItem[];
  readonly selectedDays: ReadonlySet<number>;
  readonly getDate: (row: TItem) => string | null;
  readonly getKey: (row: TItem) => string;
  readonly renderRow: (row: TItem) => ReactNode;
  readonly emptyMonthLabel: string;
  readonly emptyFilteredLabel: string;
}

function FilteredReleaseList<TItem>({
  rows,
  selectedDays,
  getDate,
  getKey,
  renderRow,
  emptyMonthLabel,
  emptyFilteredLabel,
}: FilteredReleaseListProps<TItem>): ReactNode {
  const sortedRows = useMemo(() => {
    const valid = rows.filter((row): row is TItem => getDate(row) != null);
    return valid.toSorted((a, b) => {
      const dateA = getDate(a);
      const dateB = getDate(b);
      if (!dateA || !dateB) return 0;
      return new Date(dateA).getTime() - new Date(dateB).getTime();
    });
  }, [rows, getDate]);

  const filteredRows = useMemo(() => {
    if (selectedDays.size === 0) return sortedRows;
    return sortedRows.filter((row) => {
      const date = getDate(row);
      if (!date) return false;
      const day = Number(date.slice(8, 10));
      return Number.isFinite(day) && selectedDays.has(day);
    });
  }, [sortedRows, selectedDays, getDate]);

  const hasMonthData = sortedRows.length > 0;
  const isFilteringEmpty = hasMonthData && filteredRows.length === 0;
  const emptyLabel = isFilteringEmpty ? emptyFilteredLabel : emptyMonthLabel;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <CalendarReleaseList
          items={filteredRows}
          getDate={getDate}
          getKey={getKey}
          renderRow={renderRow}
          emptyLabel={emptyLabel}
          selectedDays={selectedDays}
        />
      </div>
    </div>
  );
}
