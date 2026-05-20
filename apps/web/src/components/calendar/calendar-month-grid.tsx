import type { ReactNode } from "react";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/reui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ImageThumbnail } from "@/components/ui/image-thumbnail";

const MAX_THUMBS = 3;
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export interface CalendarDayBucket {
  /** ISO date string (YYYY-MM-DD) */
  readonly date: string;
  readonly thumbs: readonly {
    readonly key: string;
    readonly images: readonly string[];
    readonly title: string;
  }[];
}

interface CalendarMonthGridProps {
  readonly month: number;
  readonly year: number;
  readonly buckets: readonly CalendarDayBucket[];
  readonly isLoading?: boolean;
  readonly onDayClick?: (date: string) => void;
}

export function CalendarMonthGrid({
  month,
  year,
  buckets,
  isLoading = false,
  onDayClick,
}: CalendarMonthGridProps): ReactNode {
  const today = useMemo(() => {
    const date = new Date();
    const y = String(date.getFullYear()).padStart(4, "0");
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }, []);
  const grid = useMemo(() => {
    const firstOfMonth = new Date(year, month - 1, 1);
    const leadingDays = firstOfMonth.getDay();
    const gridStart = new Date(year, month - 1, 1 - leadingDays);

    const cells = Array.from({ length: 42 }, (_, idx) => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + idx);
      const y = String(date.getFullYear()).padStart(4, "0");
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const d = String(date.getDate()).padStart(2, "0");
      return {
        date: `${y}-${m}-${d}`,
        inMonth: date.getMonth() === month - 1,
      };
    });

    return { cells };
  }, [month, year]);
  const bucketByDate = useMemo(() => {
    const map = new Map<string, CalendarDayBucket>();
    for (const bucket of buckets) {
      map.set(bucket.date, bucket);
    }
    return map;
  }, [buckets]);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="grid grid-cols-7 border-b border-border bg-muted/30">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="px-2 py-1.5 text-center text-[0.625rem] font-medium uppercase tracking-wider text-muted-foreground select-none"
          >
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {grid.cells.map((cell) => {
          const bucket = bucketByDate.get(cell.date);
          const { date, inMonth } = cell;
          const isToday = date === today;
          const dayNumber = Number(date.slice(8, 10));
          const releaseCount = bucket?.thumbs.length ?? 0;
          const isClickable = !isLoading && releaseCount > 0 && onDayClick != null;
          const cellClassName = cn(
            "relative flex min-h-24 flex-col gap-1 border-b border-r border-border/60 p-1.5 text-left transition-colors duration-150 ease-out sm:min-h-28",
            "nth-[7n]:border-r-0",
            !inMonth && "bg-muted/20 text-muted-foreground/60",
            inMonth && "hover:bg-muted/30",
            isClickable &&
              "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          );

          const header = (
            <div className="flex items-center justify-between gap-1">
              {isLoading && inMonth ? (
                <Skeleton className="size-5 rounded-md" />
              ) : (
                <span
                  className={cn(
                    "inline-flex h-5 min-w-5 items-center justify-center rounded-full text-[0.6875rem] font-medium tabular-nums",
                    isToday && "bg-primary text-primary-foreground",
                    !isToday && inMonth && "text-foreground",
                    !isToday && !inMonth && "text-muted-foreground/60",
                  )}
                >
                  {dayNumber}
                </span>
              )}
              {releaseCount > 0 && (
                <Badge variant="secondary" size="xs" aria-label={`${releaseCount} releases`}>
                  {releaseCount}
                </Badge>
              )}
            </div>
          );

          let body: ReactNode = null;
          if (bucket != null && bucket.thumbs.length > 0) {
            const thumbs = bucket.thumbs;
            const hasOverflow = thumbs.length > MAX_THUMBS;
            const visibleCount = hasOverflow ? MAX_THUMBS - 1 : MAX_THUMBS;
            const visible = thumbs.slice(0, visibleCount);
            const overflow = thumbs.length - visible.length;

            body = (
              <div className="mt-auto flex items-center gap-1 overflow-hidden">
                {visible.map((thumb) => (
                  <ImageThumbnail
                    key={thumb.key}
                    images={thumb.images}
                    title={thumb.title}
                    fallbackIcon={null}
                    className="size-6 rounded-sm ring-1 ring-border/60"
                  />
                ))}
                {hasOverflow && (
                  <span className="inline-flex h-6 shrink-0 items-center rounded-sm bg-muted px-1.5 text-[0.625rem] font-medium tabular-nums text-muted-foreground">
                    +{overflow}
                  </span>
                )}
              </div>
            );
          }

          if (isClickable) {
            return (
              <button
                key={date}
                type="button"
                data-in-month={inMonth}
                data-today={isToday}
                onClick={() => onDayClick(date)}
                aria-label={`View ${releaseCount} ${releaseCount === 1 ? "release" : "releases"} on ${date}`}
                className={cellClassName}
              >
                {header}
                {body}
              </button>
            );
          }

          return (
            <div key={date} data-in-month={inMonth} data-today={isToday} className={cellClassName}>
              {header}
              {body}
            </div>
          );
        })}
      </div>
    </div>
  );
}
