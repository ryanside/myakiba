import type { ReactNode } from "react";
import { useMemo } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { CryingIcon } from "@hugeicons/core-free-icons";
import type { CalendarView } from "@myakiba/contracts/calendar/schema";
import type { Currency } from "@myakiba/contracts/shared/types";
import { CalendarItemRow } from "@/components/calendar/calendar-item-row";
import { CalendarOrderRow } from "@/components/calendar/calendar-order-row";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { CalendarResponse } from "@/queries/calendar";

const DATE_GROUP_LABEL_FORMATTER = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
});

const CALENDAR_RELEASE_SKELETON_ROWS = [
  { id: "first", titleWidth: "w-36", detailWidth: "w-16" },
  { id: "second", titleWidth: "w-28", detailWidth: "w-20" },
] as const;

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
      <div className="animate-data-in flex flex-col items-center justify-center gap-1.5 py-10 text-center [--data-in-delay:60ms]">
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
  readonly view: CalendarView;
  readonly selectedDays: ReadonlySet<number>;
  readonly currency: Currency;
  readonly locale: string;
}

export function CalendarReleasePanel({
  data,
  isPending,
  view,
  selectedDays,
  currency,
  locale,
}: CalendarReleasePanelProps): ReactNode {
  if (isPending || !data) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" aria-busy="true">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <CalendarReleaseListSkeleton view={view} />
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

function CalendarReleaseListSkeleton({ view }: { readonly view: CalendarView }): ReactNode {
  return (
    <div aria-hidden="true" className="flex flex-col gap-1.5">
      <div className="sticky top-0 z-10 flex items-center gap-2 bg-background pb-1">
        <span className="flex h-4 shrink-0 items-center">
          <Skeleton className="h-3 w-20" />
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>
      <div>
        {CALENDAR_RELEASE_SKELETON_ROWS.map((row) =>
          view === "items" ? (
            <CalendarItemRowSkeleton key={row.id} {...row} />
          ) : (
            <CalendarOrderRowSkeleton key={row.id} {...row} />
          ),
        )}
      </div>
    </div>
  );
}

interface CalendarRowSkeletonProps {
  readonly titleWidth: string;
  readonly detailWidth: string;
}

function CalendarItemRowSkeleton({ titleWidth, detailWidth }: CalendarRowSkeletonProps): ReactNode {
  return (
    <div className="flex min-w-0 items-center gap-2.5 overflow-hidden rounded-md p-1.5">
      <Skeleton className="size-9 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex h-4.5 items-center">
          <Skeleton className={cn("h-3.5 max-w-full", titleWidth)} />
        </div>
        <div className="mt-0.5 flex h-4 items-center gap-1.5">
          <Skeleton className={cn("h-3 max-w-full", detailWidth)} />
          <Skeleton className="h-3 w-12 shrink-0" />
        </div>
      </div>
    </div>
  );
}

function CalendarOrderRowSkeleton({
  titleWidth,
  detailWidth,
}: CalendarRowSkeletonProps): ReactNode {
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2.5 overflow-hidden rounded-md p-1.5">
      <Skeleton className="size-10 shrink-0 rounded-md" />
      <div className="min-w-0">
        <div className="flex h-4.5 items-center">
          <Skeleton className={cn("h-3.5 max-w-full", titleWidth)} />
        </div>
        <div className="mt-0.5 flex h-4 items-center gap-2.5">
          <Skeleton className={cn("h-3 max-w-full", detailWidth)} />
          <Skeleton className="h-3 w-10 shrink-0" />
        </div>
      </div>
      <div className="flex items-center gap-2 justify-self-end">
        <Skeleton className="h-4.5 w-14 rounded-sm" />
        <Skeleton className="h-4 w-16" />
      </div>
    </div>
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
