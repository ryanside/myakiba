import type { ReactNode } from "react";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { ImageThumbnail } from "@/components/ui/image-thumbnail";
import type { CalendarResponse } from "@/queries/calendar";

const MAX_THUMBS = 3;
const THUMB_STACK_SIZE = "size-9";
const THUMB_STACK_OVERLAP = "-ml-5";
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

interface CalendarDayBucket {
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
  readonly data: CalendarResponse | undefined;
  readonly isLoading?: boolean;
  readonly selectedDays?: ReadonlySet<number>;
  readonly onToggleDay?: (day: number) => void;
}

export function CalendarMonthGrid({
  month,
  year,
  data,
  isLoading = false,
  selectedDays,
  onToggleDay,
}: CalendarMonthGridProps): ReactNode {
  const buckets = useMemo<readonly CalendarDayBucket[]>(() => {
    if (!data) return [];
    if (data.view === "items") {
      return buildBuckets(data.items, (item) => ({
        date: item.releaseDate,
        thumb: {
          key: `${item.collectionId}:${item.releaseDate}`,
          images: item.image ? [item.image] : [],
          title: item.title,
        },
      }));
    }
    return buildBuckets(data.orders, (order) => ({
      date: order.releaseDate,
      thumb: { key: order.orderId, images: order.images, title: order.title },
    }));
  }, [data]);
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
            className="px-2 py-1.5 text-center text-xs font-medium text-muted-foreground select-none"
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
          const isSelected = inMonth && selectedDays?.has(dayNumber) === true;
          const isClickable = !isLoading && inMonth && onToggleDay != null;
          const cellClassName = cn(
            "group/cell relative flex min-h-24 flex-col gap-1 border-b border-r border-border/60 p-1.5 text-left transition-[background-color,box-shadow] duration-150 ease-out sm:min-h-28",
            "nth-[7n]:border-r-0",
            !inMonth && "bg-muted/20 text-muted-foreground/60",
            inMonth && !isSelected && "hover:bg-muted/30",
            isSelected && "bg-primary/8 hover:bg-primary/12",
            isClickable &&
              "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          );

          if (isClickable) {
            const releaseLabel = releaseCount === 1 ? "release" : "releases";
            const stateLabel = isSelected ? "selected" : "filter";
            return (
              <button
                key={date}
                type="button"
                data-in-month={inMonth}
                data-today={isToday}
                data-selected={isSelected}
                aria-pressed={isSelected}
                onClick={() => onToggleDay(dayNumber)}
                aria-label={`${stateLabel} ${date} (${releaseCount} ${releaseLabel})`}
                className={cellClassName}
              >
                <CalendarDayCellContent
                  dayNumber={dayNumber}
                  isToday={isToday}
                  inMonth={inMonth}
                  bucket={bucket}
                />
                {isSelected && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 rounded-none ring-1 ring-inset ring-primary/30"
                  />
                )}
              </button>
            );
          }

          return (
            <div key={date} data-in-month={inMonth} data-today={isToday} className={cellClassName}>
              <CalendarDayCellContent
                dayNumber={dayNumber}
                isToday={isToday}
                inMonth={inMonth}
                bucket={bucket}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CalendarDayCellContent({
  dayNumber,
  isToday,
  inMonth,
  bucket,
}: {
  readonly dayNumber: number;
  readonly isToday: boolean;
  readonly inMonth: boolean;
  readonly bucket: CalendarDayBucket | undefined;
}): ReactNode {
  return (
    <>
      <span
        className={cn(
          "inline-flex h-5 items-center self-start text-[0.6875rem] font-medium tabular-nums transition-colors duration-150 ease-out",
          isToday &&
            "min-w-5 justify-center rounded-full bg-primary px-1.5 text-primary-foreground",
          !isToday && inMonth && "text-foreground",
          !isToday && !inMonth && "text-muted-foreground/60",
        )}
      >
        {dayNumber}
      </span>
      {bucket != null && bucket.thumbs.length > 0 && (
        <CalendarDayThumbStack
          thumbs={bucket.thumbs}
          className="animate-data-in mt-auto [--data-in-delay:60ms]"
        />
      )}
    </>
  );
}

function CalendarDayThumbStack({
  thumbs,
  className,
}: {
  readonly thumbs: CalendarDayBucket["thumbs"];
  readonly className?: string;
}): ReactNode {
  const hasOverflow = thumbs.length > MAX_THUMBS;
  const visibleCount = hasOverflow ? MAX_THUMBS - 1 : MAX_THUMBS;
  const visible = thumbs.slice(0, visibleCount);
  const overflow = thumbs.length - visible.length;

  return (
    <div className={cn("flex min-w-0 max-w-full items-center overflow-hidden", className)}>
      <div className="flex min-w-0 items-center">
        {visible.map((thumb, index) => (
          <ImageThumbnail
            key={thumb.key}
            images={thumb.images}
            title={thumb.title}
            fallbackIcon={null}
            className={cn(
              "relative shrink-0 rounded-md shadow-sm border border-border",
              THUMB_STACK_SIZE,
              index > 0 && THUMB_STACK_OVERLAP,
            )}
          />
        ))}
        {hasOverflow && (
          <span
            className={cn(
              "relative inline-flex h-9 shrink-0 items-center rounded-md bg-muted px-1.5 text-[0.625rem] font-medium tabular-nums text-muted-foreground ring-2 ring-background",
              visible.length > 0 && THUMB_STACK_OVERLAP,
            )}
          >
            +{overflow}
          </span>
        )}
      </div>
    </div>
  );
}

function buildBuckets<TItem>(
  items: readonly TItem[],
  project: (item: TItem) => {
    readonly date: string | null;
    readonly thumb: CalendarDayBucket["thumbs"][number];
  },
): readonly CalendarDayBucket[] {
  const map = new Map<string, CalendarDayBucket["thumbs"][number][]>();
  for (const item of items) {
    const { date, thumb } = project(item);
    if (!date) continue;
    const existing = map.get(date);
    if (existing) {
      existing.push(thumb);
    } else {
      map.set(date, [thumb]);
    }
  }
  return [...map.entries()].map(([date, thumbs]) => ({ date, thumbs }));
}
