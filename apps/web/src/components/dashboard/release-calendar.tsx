import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  CryingIcon,
  Image01Icon,
  Loading03Icon,
} from "@hugeicons/core-free-icons";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import type { DateFormat, Category } from "@myakiba/types/enums";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { app } from "@/lib/treaty-client";
import { Link } from "@tanstack/react-router";
import { ImageThumbnail } from "../ui/image-thumbnail";
import { getCategoryColor } from "@/lib/category-colors";
import { Badge } from "../reui/badge";
import { Skeleton } from "../ui/skeleton";

interface ReleaseItem {
  itemId: string;
  title: string;
  image: string | null;
  category: string | null;
  releaseDate: string;
  price: number | null;
  priceCurrency: string | null;
}

interface ReleaseCalendarProps {
  className?: string;
  currency: string;
  dateFormat: DateFormat;
}

const CALENDAR_MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: "long",
  year: "numeric",
});

const RELEASE_DATE_GROUP_LABEL_FORMATTER = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  day: "numeric",
});

function formatCalendarMonthLabel(date: Date): string {
  return CALENDAR_MONTH_LABEL_FORMATTER.format(date);
}

function formatReleaseDateGroupLabel(releaseDate: string): string {
  return RELEASE_DATE_GROUP_LABEL_FORMATTER.format(new Date(releaseDate));
}

function groupReleasesByReleaseDate(
  releases: readonly ReleaseItem[],
): ReadonlyArray<readonly [string, readonly ReleaseItem[]]> {
  const groups = new Map<string, ReleaseItem[]>();
  for (const item of releases) {
    const existing = groups.get(item.releaseDate);
    if (existing) {
      existing.push(item);
    } else {
      groups.set(item.releaseDate, [item]);
    }
  }
  return Array.from(groups.entries()).sort(
    ([a], [b]) => new Date(a).getTime() - new Date(b).getTime(),
  );
}

function ReleaseCalendar({ className, currency }: ReleaseCalendarProps): React.ReactElement {
  const [currentMonth, setCurrentMonth] = React.useState(new Date());
  const queryClient = useQueryClient();

  async function getReleaseCalendar() {
    const apiMonth = currentMonth.getMonth() + 1;
    const apiYear = currentMonth.getFullYear();

    const { data, error } = await app.api.dashboard["release-calendar"].get({
      query: { month: apiMonth, year: apiYear },
    });
    if (error) {
      if (error.status === 422) {
        throw new Error(error.value?.message || "Invalid month or year");
      }
      throw new Error(error.value || "Failed to get release calendar");
    }
    return data;
  }

  const { isPending, isError, data, error } = useQuery({
    queryKey: ["releaseCalendar", currentMonth.getMonth(), currentMonth.getFullYear()],
    queryFn: getReleaseCalendar,
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  const releases = data?.releaseCalendar.releases ?? [];
  const grouped = React.useMemo(() => groupReleasesByReleaseDate(releases), [releases]);

  const goToPreviousMonth = (): void => {
    const newDate = new Date(currentMonth);
    newDate.setMonth(newDate.getMonth() - 1);
    setCurrentMonth(newDate);
  };

  const goToNextMonth = (): void => {
    const newDate = new Date(currentMonth);
    newDate.setMonth(newDate.getMonth() + 1);
    setCurrentMonth(newDate);
  };

  const refetch = (): void => {
    void queryClient.invalidateQueries({
      queryKey: ["releaseCalendar", currentMonth.getMonth(), currentMonth.getFullYear()],
    });
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between">
        <div className="flex min-w-0 items-center justify-center gap-1.5">
          <span className="text-sm font-medium tracking-tight select-none">
            {formatCalendarMonthLabel(currentMonth)}
          </span>
          {isPending ? (
            <Badge variant="outline">
              <Skeleton className="size-2" />
            </Badge>
          ) : (
            <Badge variant="outline">{releases.length}</Badge>
          )}
        </div>

        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={goToPreviousMonth}
            disabled={isPending}
            aria-label="Previous month"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={goToNextMonth}
            disabled={isPending}
            aria-label="Next month"
          >
            <HugeiconsIcon icon={ArrowRight01Icon} className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="max-h-[272px] overflow-y-auto overflow-x-hidden">
        {isPending ? (
          <div className="flex items-center justify-center py-10">
            <HugeiconsIcon
              icon={Loading03Icon}
              className="size-4 animate-spin text-muted-foreground"
            />
          </div>
        ) : isError ? (
          <ReleaseCalendarError message={error.message} onRetry={refetch} />
        ) : grouped.length > 0 ? (
          <div className="space-y-3">
            {grouped.map(([dateKey, items]) => (
              <DateGroup key={dateKey} dateKey={dateKey} items={items} currency={currency} />
            ))}
          </div>
        ) : (
          <ReleaseCalendarEmpty />
        )}
      </div>
    </div>
  );
}

function DateGroup({
  dateKey,
  items,
  currency,
}: {
  readonly dateKey: string;
  readonly items: readonly ReleaseItem[];
  readonly currency: string;
}): React.ReactElement {
  return (
    <div>
      <div className="sticky top-0 z-10 flex items-center gap-2 bg-card pb-1">
        <span className="shrink-0 text-[0.6875rem] font-medium uppercase tracking-wider text-muted-foreground">
          {formatReleaseDateGroupLabel(dateKey)}
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>
      <div>
        {items.map((item) => (
          <ReleaseCard
            key={`${item.itemId}:${item.releaseDate}`}
            item={item}
            currency={item.priceCurrency || currency}
          />
        ))}
      </div>
    </div>
  );
}

function ReleaseCalendarError({
  message,
  onRetry,
}: {
  readonly message: string;
  readonly onRetry: () => void;
}): React.ReactElement {
  return (
    <div className="flex flex-col items-center justify-center gap-2.5 py-10 text-center">
      <p className="text-xs text-destructive">{message}</p>
      <Button variant="ghost" size="xs" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

function ReleaseCalendarEmpty(): React.ReactElement {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 py-10 text-center">
      <HugeiconsIcon icon={CryingIcon} className="size-5 text-muted-foreground/50" />
      <p className="text-xs text-muted-foreground">Nothing releasing this month</p>
    </div>
  );
}

function ReleaseCard({
  item,
  currency,
}: {
  readonly item: ReleaseItem;
  readonly currency: string;
}): React.ReactElement {
  const categoryColor = getCategoryColor((item.category as Category) ?? null);

  return (
    <Link
      to="/items/$id"
      params={{ id: item.itemId }}
      className="flex min-w-0 items-center gap-2.5 overflow-hidden rounded-md px-1.5 py-1.5 transition-colors hover:bg-accent"
    >
      <ImageThumbnail
        images={item.image ? [item.image] : []}
        title={item.title}
        fallbackIcon={<HugeiconsIcon icon={Image01Icon} className="size-4 text-muted-foreground" />}
        className="size-9"
      />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm leading-tight font-medium">{item.title}</p>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          {item.category != null && (
            <>
              <span
                className="size-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: categoryColor }}
                aria-hidden
              />
              <span className="truncate">{item.category}</span>
            </>
          )}
          {item.price != null && (
            <>
              {item.category != null && <span aria-hidden>·</span>}
              <span className="shrink-0">{formatCurrencyFromMinorUnits(item.price, currency)}</span>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}

export { ReleaseCalendar, type ReleaseItem };
