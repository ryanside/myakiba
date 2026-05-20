import type { ReactNode } from "react";
import { useCallback, useMemo } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { calendarSearchSchema } from "@myakiba/contracts/calendar/schema";
import type { CalendarView } from "@myakiba/contracts/calendar/schema";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarMonthGrid } from "@/components/calendar/calendar-month-grid";
import type { CalendarDayBucket } from "@/components/calendar/calendar-month-grid";
import {
  CALENDAR_DAY_SECTION_ATTR,
  CalendarReleaseList,
  CalendarReleaseListSkeleton,
} from "@/components/calendar/calendar-release-list";
import { CalendarItemRow } from "@/components/calendar/calendar-item-row";
import { CalendarOrderRow } from "@/components/calendar/calendar-order-row";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import { getCalendar } from "@/queries/calendar";
import type { CalendarItem, CalendarOrder, CalendarResponse } from "@/queries/calendar";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const CALENDAR_MIN_YEAR = 2000;
const YEAR_FORWARD_RANGE = 10;

export const Route = createFileRoute("/(app)/calendar")({
  validateSearch: calendarSearchSchema,
  component: RouteComponent,
  head: () => ({
    meta: [
      { name: "description", content: "your release calendar" },
      { title: "Calendar - myakiba" },
    ],
  }),
});

function RouteComponent(): ReactNode {
  const navigate = useNavigate({ from: Route.fullPath });
  const search = Route.useSearch();
  const { currency, locale } = useUserPreferences();

  const now = useMemo(() => new Date(), []);
  const view: CalendarView = search.view ?? "items";
  const month = search.month ?? now.getMonth() + 1;
  const year = search.year ?? now.getFullYear();

  const updateSearch = useCallback(
    (next: {
      readonly view?: CalendarView;
      readonly month?: number;
      readonly year?: number;
    }): void => {
      const resolvedView = next.view ?? view;
      navigate({
        search: {
          view: resolvedView === "items" ? undefined : resolvedView,
          month: next.month ?? month,
          year: next.year ?? year,
        },
        resetScroll: false,
      });
    },
    [navigate, view, month, year],
  );

  const setView = useCallback(
    (nextView: string): void => {
      if (nextView !== "items" && nextView !== "orders") return;
      updateSearch({ view: nextView });
    },
    [updateSearch],
  );

  const shiftMonth = useCallback(
    (delta: number): void => {
      const base = new Date(year, month - 1 + delta, 1);
      updateSearch({ month: base.getMonth() + 1, year: base.getFullYear() });
    },
    [updateSearch, month, year],
  );

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["calendar", view, month, year],
    queryFn: () => getCalendar({ view, month, year }),
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  const yearOptions = useMemo(() => {
    const currentYear = now.getFullYear();
    const start = CALENDAR_MIN_YEAR;
    const end = currentYear + YEAR_FORWARD_RANGE;
    const set = new Set<number>();
    for (let y = start; y <= end; y += 1) set.add(y);
    set.add(year);
    return [...set].toSorted((a, b) => a - b);
  }, [now, year]);

  const handleDayClick = useCallback((date: string): void => {
    const target = document.querySelector<HTMLElement>(`[${CALENDAR_DAY_SECTION_ATTR}="${date}"]`);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    target.focus({ preventScroll: true });
  }, []);

  let calendarContent: ReactNode = null;
  if (isPending) {
    calendarContent = (
      <div className="flex flex-col gap-6">
        <div className="-mx-6 overflow-x-auto">
          <div className="min-w-[896px] px-6">
            <CalendarMonthGrid month={month} year={year} buckets={[]} isLoading />
          </div>
        </div>
        <CalendarReleaseListSkeleton />
      </div>
    );
  } else if (data) {
    calendarContent = (
      <CalendarContent
        data={data}
        currency={currency}
        locale={locale}
        month={month}
        year={year}
        onDayClick={handleDayClick}
      />
    );
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 pb-64">
      <div className="mb-2 flex flex-col gap-2">
        <div className="flex flex-row items-start gap-4">
          <h1 className="text-2xl tracking-tight font-heading font-medium">Calendar</h1>
        </div>
        <p className="text-muted-foreground text-sm font-normal">{"[early development]"}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center" role="group" aria-label="Select month">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => shiftMonth(-1)}
            aria-label="Previous month"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} className="size-4" />
          </Button>
          <NativeSelect
            size="sm"
            aria-label="Month"
            value={month}
            onChange={(event) => updateSearch({ month: Number(event.target.value) })}
          >
            {MONTH_NAMES.map((name, idx) => (
              <NativeSelectOption key={name} value={idx + 1}>
                {name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <NativeSelect
            size="sm"
            aria-label="Year"
            value={year}
            onChange={(event) => updateSearch({ year: Number(event.target.value) })}
            className="ml-1"
          >
            {yearOptions.map((y) => (
              <NativeSelectOption key={y} value={y}>
                {y}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => shiftMonth(1)}
            aria-label="Next month"
          >
            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="size-4" />
          </Button>
        </div>

        <Tabs value={view} onValueChange={setView} className="ml-auto shrink-0">
          <TabsList variant="line">
            <TabsTrigger value="items">Items</TabsTrigger>
            <TabsTrigger value="orders">Orders</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {isError && (
        <div className="animate-data-in rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Failed to load calendar: {error.message}
        </div>
      )}

      {calendarContent}
    </div>
  );
}

interface CalendarContentProps {
  readonly data: CalendarResponse;
  readonly currency: ReturnType<typeof useUserPreferences>["currency"];
  readonly locale: ReturnType<typeof useUserPreferences>["locale"];
  readonly month: number;
  readonly year: number;
  readonly onDayClick: (date: string) => void;
}

function CalendarContent({
  data,
  currency,
  locale,
  month,
  year,
  onDayClick,
}: CalendarContentProps): ReactNode {
  if (data.view === "items") {
    return <ItemsView items={data.items} month={month} year={year} onDayClick={onDayClick} />;
  }
  return (
    <OrdersView
      orders={data.orders}
      month={month}
      year={year}
      currency={currency}
      locale={locale}
      onDayClick={onDayClick}
    />
  );
}

function ItemsView({
  items,
  month,
  year,
  onDayClick,
}: {
  readonly items: readonly CalendarItem[];
  readonly month: number;
  readonly year: number;
  readonly onDayClick: (date: string) => void;
}): ReactNode {
  const buckets = useMemo(
    () =>
      buildBuckets(items, (item) => ({
        date: item.releaseDate,
        thumb: {
          key: `${item.collectionId}:${item.releaseDate}`,
          images: item.image ? [item.image] : [],
          title: item.title,
        },
      })),
    [items],
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="-mx-6 overflow-x-auto">
        <div className="min-w-[896px] px-6">
          <CalendarMonthGrid month={month} year={year} buckets={buckets} onDayClick={onDayClick} />
        </div>
      </div>
      <CalendarReleaseList
        items={items}
        getDate={(item) => item.releaseDate}
        getKey={(item) => `${item.collectionId}:${item.releaseDate}`}
        renderRow={(item) => <CalendarItemRow item={item} />}
        emptyLabel="Nothing releasing this month"
      />
    </div>
  );
}

function OrdersView({
  orders,
  month,
  year,
  currency,
  locale,
  onDayClick,
}: {
  readonly orders: readonly CalendarOrder[];
  readonly month: number;
  readonly year: number;
  readonly currency: ReturnType<typeof useUserPreferences>["currency"];
  readonly locale: ReturnType<typeof useUserPreferences>["locale"];
  readonly onDayClick: (date: string) => void;
}): ReactNode {
  const buckets = useMemo(
    () =>
      buildBuckets(orders, (order) => ({
        date: order.releaseDate,
        thumb: { key: order.orderId, images: order.images, title: order.title },
      })),
    [orders],
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="-mx-6 overflow-x-auto">
        <div className="min-w-[896px] px-6">
          <CalendarMonthGrid month={month} year={year} buckets={buckets} onDayClick={onDayClick} />
        </div>
      </div>
      <CalendarReleaseList
        items={orders}
        getDate={(order) => order.releaseDate}
        getKey={(order) => order.orderId}
        renderRow={(order) => (
          <CalendarOrderRow order={order} currency={currency} locale={locale} />
        )}
        emptyLabel="No orders releasing this month"
      />
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
