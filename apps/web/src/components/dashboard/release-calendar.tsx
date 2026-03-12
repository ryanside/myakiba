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
import { formatCurrencyFromMinorUnits } from "@myakiba/utils";
import type { DateFormat } from "@myakiba/types";
import type { Category } from "@myakiba/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { app } from "@/lib/treaty-client";
import { Link } from "@tanstack/react-router";
import { Badge } from "../ui/badge";
import { ImageThumbnail } from "../ui/image-thumbnail";
import { getCategoryColor } from "@/lib/category-colors";

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

function formatMonthYear(date: Date): string {
  return date.toLocaleString("default", {
    month: "long",
    year: "numeric",
  });
}

function ReleaseCalendar({
  className,
  currency,
  dateFormat,
}: ReleaseCalendarProps): React.ReactElement {
  const [currentMonth, setCurrentMonth] = React.useState(new Date());
  const queryClient = useQueryClient();

  async function getReleaseCalendar() {
    const apiMonth = currentMonth.getMonth() + 1;
    const apiYear = currentMonth.getFullYear();

    const { data, error } = await app.api.dashboard["release-calendar"].get({
      query: {
        month: apiMonth,
        year: apiYear,
      },
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

  const monthYearLabel = formatMonthYear(currentMonth);

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={goToPreviousMonth}
          className="size-8 shrink-0"
          disabled={isPending}
          aria-label="Previous month"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
        </Button>

        <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
          <span className="truncate text-base font-normal tracking-tight select-none">
            {monthYearLabel}
          </span>
          {data !== undefined && (
            <Badge variant="outline" appearance="light" size="sm">
              {releases.length}
            </Badge>
          )}
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={goToNextMonth}
          className="size-8 shrink-0"
          disabled={isPending}
          aria-label="Next month"
        >
          <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
        </Button>
      </div>

      <div className="max-h-[240px] space-y-1.5 overflow-y-auto">
        {isPending ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm">
            <HugeiconsIcon icon={Loading03Icon} className="size-4 animate-spin" />
          </div>
        ) : isError ? (
          <ReleaseCalendarError message={error.message} onRetry={refetch} />
        ) : releases.length > 0 ? (
          releases.map((item, index) => (
            <ReleaseCard
              key={`${item.itemId}:${item.releaseDate}`}
              item={item}
              currency={item.priceCurrency || currency}
              dateFormat={dateFormat}
              index={index}
            />
          ))
        ) : (
          <ReleaseCalendarEmpty />
        )}
      </div>
    </div>
  );
}

function formatReleaseDay(releaseDate: string): string {
  const d = new Date(releaseDate);
  return d.toLocaleDateString("default", { weekday: "short", day: "numeric" });
}

function ReleaseCalendarError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}): React.ReactElement {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-6 text-center">
      <p className="text-sm text-destructive">Failed to load releases: {message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

function ReleaseCalendarEmpty(): React.ReactElement {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
      <HugeiconsIcon icon={CryingIcon} className="size-5 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">You have no releases for this month.</p>
    </div>
  );
}

function ReleaseCard({
  item,
  currency,
  index,
}: {
  item: ReleaseItem;
  currency: string;
  dateFormat: DateFormat;
  index: number;
}): React.ReactElement {
  const categoryColor = getCategoryColor((item.category as Category) ?? null);
  const releaseDay = formatReleaseDay(item.releaseDate);

  return (
    <Link
      to="/items/$id"
      params={{ id: item.itemId }}
      className={cn(
        "flex items-center gap-3 rounded-md border border-border/30 bg-background p-2.5 transition-colors hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer",
        "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-200",
      )}
      style={{
        animationDelay: `${Math.min(index * 40, 160)}ms`,
      }}
    >
      <ImageThumbnail
        images={item.image ? [item.image] : []}
        title={item.title}
        fallbackIcon={<HugeiconsIcon icon={Image01Icon} className="size-5 text-muted-foreground" />}
      />

      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Badge variant="outline" appearance="outline" size="sm">
          {releaseDay}
        </Badge>
        <div className="min-w-0 flex-1">
          <h4 className="truncate text-sm font-medium">{item.title}</h4>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {item.category !== null && item.category !== undefined && (
              <>
                <span
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: categoryColor }}
                  aria-hidden
                />
                <span className="truncate">{item.category}</span>
              </>
            )}
            {item.price !== null && item.price !== undefined && (
              <>
                {item.category !== null && item.category !== undefined && (
                  <span aria-hidden>·</span>
                )}
                <span>{formatCurrencyFromMinorUnits(item.price, currency)}</span>
              </>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

export { ReleaseCalendar, type ReleaseItem };
