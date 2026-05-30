import { useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { calendarSearchSchema } from "@myakiba/contracts/calendar/schema";
import type { CalendarView } from "@myakiba/contracts/calendar/schema";
import { CalendarMonthGrid } from "@/components/calendar/calendar-month-grid";
import { CalendarReleasePanel } from "@/components/calendar/calendar-release-list";
import { CalendarToolbar } from "@/components/calendar/calendar-toolbar";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import { getCalendar } from "@/queries/calendar";

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
  const searchDays = search.days;
  const days = useMemo<readonly number[]>(() => searchDays ?? [], [searchDays]);

  const selectedDaysSet = useMemo<ReadonlySet<number>>(() => new Set(days), [days]);

  const updateSearch = useCallback(
    (patch: {
      readonly view?: CalendarView;
      readonly month?: number;
      readonly year?: number;
      readonly days?: readonly number[];
    }): void => {
      const nextView = patch.view ?? view;
      const nextMonth = patch.month ?? month;
      const nextYear = patch.year ?? year;
      const monthOrYearChanged =
        (patch.month != null && patch.month !== month) ||
        (patch.year != null && patch.year !== year);

      let nextDays: readonly number[];
      if (monthOrYearChanged) {
        nextDays = [];
      } else if (patch.days != null) {
        nextDays = patch.days;
      } else {
        nextDays = days;
      }

      navigate({
        search: {
          view: nextView === "items" ? undefined : nextView,
          month: nextMonth,
          year: nextYear,
          days: nextDays.length > 0 ? [...nextDays] : undefined,
        },
        resetScroll: false,
      });
    },
    [navigate, view, month, year, days],
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

  const toggleDay = useCallback(
    (day: number): void => {
      const next = selectedDaysSet.has(day)
        ? days.filter((d) => d !== day)
        : [...days, day].toSorted((a, b) => a - b);
      updateSearch({ days: next });
    },
    [updateSearch, days, selectedDaysSet],
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

  return (
    <div className="mx-auto flex w-full max-w-[88rem] flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="flex shrink-0 flex-col gap-2">
          <h1 className="text-2xl tracking-tight font-heading font-medium text-balance">
            Calendar
          </h1>
        </div>
        <div className="w-full min-w-0 lg:flex-1">
          <CalendarToolbar
            view={view}
            month={month}
            year={year}
            yearOptions={yearOptions}
            onShiftMonth={shiftMonth}
            onChangeMonth={(nextMonth) => updateSearch({ month: nextMonth })}
            onChangeYear={(nextYear) => updateSearch({ year: nextYear })}
            onChangeView={setView}
          />
        </div>
      </div>

      {isError && (
        <div className="animate-data-in rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Failed to load calendar: {error.message}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-3">
          <CalendarMonthGrid
            data={data}
            isLoading={isPending}
            month={month}
            year={year}
            selectedDays={selectedDaysSet}
            onToggleDay={toggleDay}
          />
        </div>
        <div className="flex min-w-0 flex-col xl:h-0 xl:min-h-full xl:overflow-hidden">
          <CalendarReleasePanel
            data={data}
            isPending={isPending}
            selectedDays={selectedDaysSet}
            currency={currency}
            locale={locale}
          />
        </div>
      </div>
    </div>
  );
}
