import type { ReactNode } from "react";
import { useMemo } from "react";
import { Badge } from "@/components/reui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export const CALENDAR_DAY_SECTION_ATTR = "data-calendar-day-section";

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
}

export function CalendarReleaseList<TItem>({
  items,
  getDate,
  getKey,
  renderRow,
  emptyLabel,
}: CalendarReleaseListProps<TItem>): ReactNode {
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
      <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }

  return (
    <ol className="flex flex-col gap-6">
      {groups.map(([date, dayItems]) => (
        <li
          key={date}
          tabIndex={-1}
          {...{ [CALENDAR_DAY_SECTION_ATTR]: date }}
          className="flex scroll-mt-4 flex-col gap-1.5 focus:outline-none focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-[0.6875rem] font-medium uppercase tracking-wider text-muted-foreground">
              {DATE_GROUP_LABEL_FORMATTER.format(new Date(`${date}T00:00:00`))}
            </span>
            <Badge variant="secondary" size="xs" aria-label={`${dayItems.length} releases`}>
              {dayItems.length}
            </Badge>
            <div className="h-px flex-1 bg-border/60" />
          </div>
          <ul className="divide-y divide-border/40">
            {dayItems.map((item) => (
              <li key={getKey(item)}>{renderRow(item)}</li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

export function CalendarReleaseListSkeleton(): ReactNode {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      {[0, 1, 2].map((groupIdx) => (
        <div key={groupIdx} className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-4 min-w-4 rounded-sm" />
            <div className="h-px flex-1 bg-border/60" />
          </div>
          <div className="flex flex-col">
            {[0, 1].map((rowIdx) => (
              <div key={rowIdx} className="flex items-center gap-3 px-1.5 py-2">
                <Skeleton className="size-9 rounded-md" />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <Skeleton className="h-3.5 w-1/2" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
