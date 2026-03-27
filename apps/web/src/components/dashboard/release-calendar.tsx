import { useMemo, useState, useCallback } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  CryingIcon,
  Image01Icon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@/components/reui/frame";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/reui/badge";
import { ImageThumbnail } from "@/components/ui/image-thumbnail";
import type { Category, Currency } from "@myakiba/contracts/shared/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { app } from "@/lib/treaty-client";
import { Link } from "@tanstack/react-router";
import { getCategoryColor } from "@/lib/category-colors";
import { formatReleaseDate } from "@/lib/locale";
import Loader from "../loader";

interface ReleaseItem {
  readonly itemId: string;
  readonly title: string;
  readonly image: string | null;
  readonly category: string | null;
  readonly releaseDate: string;
  readonly price: number | null;
  readonly priceCurrency: string | null;
}

interface ReleaseCalendarProps {
  readonly className?: string;
  readonly currency: Currency;
  /** 1-12. When provided, the calendar is controlled by the parent. */
  readonly month?: number;
  /** Full year (e.g. 2026). Paired with `month`. */
  readonly year?: number;
  /** Hide the internal month label and navigation arrows. */
  readonly hideControls?: boolean;
}

const CALENDAR_MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
});

const RELEASE_DATE_GROUP_LABEL_FORMATTER = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  day: "numeric",
});

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

function ReleaseCalendar({
  className,
  currency,
  month: controlledMonth,
  year: controlledYear,
  hideControls = false,
}: ReleaseCalendarProps): React.ReactNode {
  const [internalMonth, setInternalMonth] = useState(new Date());
  const queryClient = useQueryClient();

  const isControlled = controlledMonth != null && controlledYear != null;
  const apiMonth = isControlled ? controlledMonth : internalMonth.getMonth() + 1;
  const apiYear = isControlled ? controlledYear : internalMonth.getFullYear();
  const displayDate = isControlled ? new Date(controlledYear, controlledMonth - 1) : internalMonth;

  async function fetchReleaseCalendar() {
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
    queryKey: ["releaseCalendar", apiMonth, apiYear],
    queryFn: fetchReleaseCalendar,
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  const releases = data?.releaseCalendar.releases ?? [];
  const grouped = useMemo(() => groupReleasesByReleaseDate(releases), [releases]);

  const goToPreviousMonth = useCallback((): void => {
    setInternalMonth((prev) => {
      const next = new Date(prev);
      next.setMonth(next.getMonth() - 1);
      return next;
    });
  }, []);

  const goToNextMonth = useCallback((): void => {
    setInternalMonth((prev) => {
      const next = new Date(prev);
      next.setMonth(next.getMonth() + 1);
      return next;
    });
  }, []);

  const refetch = useCallback((): void => {
    void queryClient.invalidateQueries({
      queryKey: ["releaseCalendar", apiMonth, apiYear],
    });
  }, [queryClient, apiMonth, apiYear]);

  return (
    <Frame
      className={cn("border-none ring-1 ring-foreground/10 shadow-xs! min-h-[320px]", className)}
    >
      <FrameHeader>
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-1.5">
            <FrameTitle className="text-base font-medium select-none">
              {CALENDAR_MONTH_LABEL_FORMATTER.format(displayDate)} Releases
            </FrameTitle>
            {isPending ? (
              <Badge variant="outline">
                <Skeleton className="size-2" />
              </Badge>
            ) : (
              <Badge variant="outline">{releases.length}</Badge>
            )}
          </div>

          {!hideControls && (
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
          )}
        </div>
      </FrameHeader>
      <FramePanel className="shadow-none!">
        {isPending ? (
          <Loader className="justify-center text-muted" />
        ) : isError ? (
          <ReleaseCalendarError message={error.message} onRetry={refetch} />
        ) : grouped.length > 0 ? (
          <div className="space-y-3">
            <div className="max-h-57 overflow-y-auto overflow-x-hidden">
              {grouped.map(([dateKey, items]) => (
                <DateGroup key={dateKey} dateKey={dateKey} items={items} currency={currency} />
              ))}
            </div>
          </div>
        ) : (
          <ReleaseCalendarEmpty />
        )}
      </FramePanel>
    </Frame>
  );
}

function DateGroup({
  dateKey,
  items,
  currency,
}: {
  readonly dateKey: string;
  readonly items: readonly ReleaseItem[];
  readonly currency: Currency;
}): React.ReactNode {
  return (
    <div>
      <div className="sticky top-0 z-10 flex items-center gap-2 bg-(--frame-panel-bg) pb-1">
        <span className="shrink-0 text-[0.6875rem] font-medium uppercase tracking-wider text-muted-foreground">
          {RELEASE_DATE_GROUP_LABEL_FORMATTER.format(new Date(dateKey))}
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>
      <div>
        {items.map((item) => (
          <ReleaseCard key={`${item.itemId}:${item.releaseDate}`} item={item} currency={currency} />
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
}): React.ReactNode {
  return (
    <div className="flex flex-col items-center justify-center gap-2.5 py-10 text-center">
      <p className="text-xs text-destructive">{message}</p>
      <Button variant="ghost" size="xs" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

function ReleaseCalendarEmpty(): React.ReactNode {
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
  readonly currency: Currency;
}): React.ReactNode {
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
          {item.price != null && item.price > 0 && item.priceCurrency?.trim() && (
            <>
              {item.category != null && <span aria-hidden>·</span>}
              <span className="shrink-0">
                {formatReleaseDate(item.price, item.priceCurrency, currency)}
              </span>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}

export { ReleaseCalendar, type ReleaseItem };
