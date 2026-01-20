import * as React from "react";
import { ChevronLeftIcon, ChevronRightIcon, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@myakiba/utils";
import { useQuery } from "@tanstack/react-query";
import { app } from "@/lib/treaty-client";
import { Link } from "@tanstack/react-router";
import { Badge } from "../ui/badge";

interface ReleaseItem {
  itemId: number;
  title: string;
  image: string | null;
  category: string | null;
  releaseDate: string;
  price: string | null;
  priceCurrency: string | null;
}

interface ReleaseCalendarProps {
  className?: string;
  currency: string;
}

function ReleaseCalendar({
  className,
  currency,
}: ReleaseCalendarProps): React.ReactElement {
  const [currentMonth, setCurrentMonth] = React.useState(new Date());

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
    queryKey: [
      "releaseCalendar",
      currentMonth.getMonth(),
      currentMonth.getFullYear(),
    ],
    queryFn: getReleaseCalendar,
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

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

  const monthYearLabel = currentMonth.toLocaleString("default", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="icon"
          onClick={goToPreviousMonth}
          className="size-7"
          disabled={isPending}
        >
          <ChevronLeftIcon className="size-4" />
        </Button>

        <div className="text-sm font-light select-none flex items-center gap-2">
          {monthYearLabel}{" "}
          {data && (
            <Badge variant="outline">
              {data.releaseCalendar.releases.length}
            </Badge>
          )}
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={goToNextMonth}
          className="size-7"
          disabled={isPending}
        >
          <ChevronRightIcon className="size-4" />
        </Button>
      </div>

      <div className="space-y-2 overflow-y-auto">
        {isPending ? (
          <div className="py-6 text-sm flex items-center gap-2 justify-center">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : isError ? (
          <div className="text-center text-destructive py-6 text-sm">
            Failed to load releases: {error.message}
          </div>
        ) : data && data.releaseCalendar.releases.length > 0 ? (
          data.releaseCalendar.releases.map((item) => (
            <ReleaseCard
              key={item.itemId}
              item={item}
              currency={item.priceCurrency || currency}
            />
          ))
        ) : (
          <div className="text-center text-muted-foreground py-6 text-sm">
            No releases this month
          </div>
        )}
      </div>
    </div>
  );
}

function ReleaseCard({
  item,
  currency,
}: {
  item: ReleaseItem;
  currency: string;
}): React.ReactElement {
  return (
    <Link
      to="/items/$id"
      params={{ id: item.itemId.toString() }}
      className="flex items-center gap-3 p-2 border rounded-md bg-background hover:bg-accent transition-colors cursor-pointer"
    >
      {item.image ? (
        <img
          src={item.image}
          alt={item.title}
          className="w-12 h-12 object-cover object-top rounded shrink-0"
        />
      ) : (
        <div className="w-12 h-12 bg-muted rounded shrink-0 flex items-center justify-center">
          <span className="text-xs text-muted-foreground">No img</span>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <h4 className="font-medium text-sm truncate">{item.title}</h4>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{formatDate(item.releaseDate)}</span>
          {item.price && (
            <>
              <span>•</span>
              <span>{formatCurrency(item.price, currency)}</span>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}

export { ReleaseCalendar, type ReleaseItem };
