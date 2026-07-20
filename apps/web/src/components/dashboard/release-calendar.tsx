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
import type { Currency } from "@myakiba/contracts/shared/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { getCategoryColor } from "@/lib/category-colors";
import { formatReleaseDate } from "@/lib/locale";
import { getReleaseCalendar } from "@/queries/dashboard";
import type { ReleaseItem } from "@/queries/dashboard";
import { parseISO } from "date-fns";
import Loader from "../loader";

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
  month: "long",
  year: "numeric",
});

const RELEASE_DATE_GROUP_LABEL_FORMATTER = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  day: "numeric",
});

function groupReleasesByReleaseDate(
  releases: readonly ReleaseItem[],
): readonly (readonly [string, readonly ReleaseItem[]])[] {
  const groups = new Map<string, ReleaseItem[]>();
  for (const item of releases) {
    const existing = groups.get(item.releaseDate);
    if (existing) {
      existing.push(item);
    } else {
      groups.set(item.releaseDate, [item]);
    }
  }
  const grouped = [...groups.entries()].toSorted(
    ([a], [b]) => new Date(a).getTime() - new Date(b).getTime(),
  );

  return grouped;
}

function ReleaseCalendar({
  className,
  currency,
  month: controlledMonth,
  year: controlledYear,
  hideControls = false,
}: ReleaseCalendarProps): React.ReactNode {
  const [internalMonth, setInternalMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const queryClient = useQueryClient();

  const isControlled = controlledMonth != null && controlledYear != null;
  const apiMonth = isControlled ? controlledMonth : internalMonth.getMonth() + 1;
  const apiYear = isControlled ? controlledYear : internalMonth.getFullYear();
  const displayDate = isControlled ? new Date(controlledYear, controlledMonth - 1) : internalMonth;

  const { isPending, isError, data, error } = useQuery({
    queryKey: ["releaseCalendar", apiMonth, apiYear],
    queryFn: () => getReleaseCalendar(apiMonth, apiYear),
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  const releases = useMemo(() => data?.releaseCalendar.releases ?? [], [data]);
  const grouped = useMemo(() => groupReleasesByReleaseDate(releases), [releases]);

  const goToPreviousMonth = useCallback((): void => {
    setInternalMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  }, []);

  const goToNextMonth = useCallback((): void => {
    setInternalMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  }, []);

  const refetch = useCallback((): void => {
    void queryClient.invalidateQueries({
      queryKey: ["releaseCalendar", apiMonth, apiYear],
    });
  }, [queryClient, apiMonth, apiYear]);

  return (
    <Frame
      spacing="sm"
      className={cn("border-none ring-1 ring-foreground/10 shadow-xs! min-h-[320px]", className)}
    >
      <FrameHeader>
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-1.5">
            <FrameTitle className="text-base font-medium select-none">
              {CALENDAR_MONTH_LABEL_FORMATTER.format(displayDate)}
            </FrameTitle>
            {isPending ? (
              <Badge variant="outline">
                <Skeleton className="size-2" />
              </Badge>
            ) : (
              <Badge variant="outline" className="animate-data-in">
                {releases.length}
              </Badge>
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
      <FramePanel className="shadow-none! border-none m-1 mt-0">
        {(() => {
          if (isPending) return <Loader className="justify-center" />;
          if (isError) return <ReleaseCalendarError message={error.message} onRetry={refetch} />;
          if (grouped.length > 0) {
            return (
              <div className="scroll-fade overflow-y-auto animate-data-in -mx-(--frame-panel-p) max-h-56 pb-6 [--data-in-delay:60ms]">
                {grouped.map(([dateKey, items]) => (
                  <DateGroup key={dateKey} dateKey={dateKey} items={items} currency={currency} />
                ))}
              </div>
            );
          }
          return <ReleaseCalendarEmpty />;
        })()}
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
      <div className="sticky top-0 z-10 flex items-center gap-2 bg-(--frame-panel-bg) px-(--frame-panel-p) pb-1">
        <span className="shrink-0 text-xs font-medium text-muted-foreground">
          {RELEASE_DATE_GROUP_LABEL_FORMATTER.format(parseISO(dateKey))}
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>
      <div className="px-(--frame-panel-p)">
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
  const categoryColor = getCategoryColor(item.category);

  return (
    <Link
      {...(item.itemExternalId !== null
        ? ({
            to: "/item/$externalId",
            params: { externalId: item.itemExternalId },
          } as const)
        : ({ to: "/item/custom/$id", params: { id: item.itemId } } as const))}
      className="flex min-w-0 items-center gap-2.5 overflow-hidden rounded-md p-1.5 transition-colors hover:bg-accent duration-50"
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
            <span className="truncate" style={{ color: categoryColor }}>
              {item.category}
            </span>
          )}
          {item.price != null && item.price > 0 && item.priceCurrency?.trim() && (
            <span className="shrink-0">
              {formatReleaseDate(item.price, item.priceCurrency, currency)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

export { ReleaseCalendar };
