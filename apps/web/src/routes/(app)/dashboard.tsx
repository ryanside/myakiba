import { useMemo, useState } from "react";
import type { ReactElement } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { preload, preloadPage, useRead } from "@/data/client";
import { calendar, monthOf } from "@/data/resources/calendar";
import { dashboard } from "@/data/resources/dashboard";
import * as z from "zod";
import { MonthlyTab } from "@/components/dashboard/monthly-tab";
import { OverviewTab } from "@/components/dashboard/overview-tab";
import { Button } from "@/components/ui/button";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import { randomKaomoji } from "@/lib/kaomoji";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HugeiconsIcon } from "@hugeicons/react";
import { NextIcon, PreviousIcon } from "@/lib/icons";

function getCurrentVisibleMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

const dashboardSearchSchema = z.object({
  tab: z.enum(["overview", "monthly"]).optional(),
});

function activeTabOf(search: z.infer<typeof dashboardSearchSchema>) {
  return search.tab ?? "overview";
}

export const Route = createFileRoute("/(app)/dashboard")({
  validateSearch: dashboardSearchSchema,
  loaderDeps: ({ search }) => ({ tab: activeTabOf(search) }),
  loader: ({ context: { queryClient }, cause, deps }) =>
    preloadPage(cause, () => {
      const month = monthOf(new Date());
      return [
        deps.tab === "monthly"
          ? preload(queryClient, dashboard.monthly, month)
          : preload(queryClient, dashboard.overview),
        preload(queryClient, calendar.releases, month),
      ];
    }),
  component: RouteComponent,
  head: () => ({
    meta: [
      {
        name: "description",
        content: `your dashboard`,
      },
      {
        title: `Dashboard - myakiba`,
      },
    ],
  }),
});

function RouteComponent(): ReactElement {
  const navigate = useNavigate({ from: Route.fullPath });
  const { session } = Route.useRouteContext();
  const search = Route.useSearch();
  const { currency: userCurrency, locale: userLocale, dateFormat } = useUserPreferences();
  // eslint-disable-next-line react/hook-use-state -- Keep one kaomoji for this route instance (until 2027-04-16, approved by root, pending operator review)
  const [kaomoji] = useState(randomKaomoji);
  const activeTab = activeTabOf(search);
  const [visibleMonth, setVisibleMonth] = useState<Date>(getCurrentVisibleMonth);

  const monthYearLabel = useMemo(
    () => new Intl.DateTimeFormat(userLocale, { month: "short", year: "numeric" }),
    [userLocale],
  );

  const { month: selectedMonth, year: selectedYear } = monthOf(visibleMonth);

  function setActiveTab(nextTab: string): void {
    if (nextTab !== "overview" && nextTab !== "monthly") {
      return;
    }

    navigate({
      search:
        nextTab === "overview"
          ? {}
          : {
              tab: nextTab,
            },
    });
  }

  function shiftMonth(delta: number): void {
    setVisibleMonth((prev) => {
      const next = new Date(prev);
      next.setMonth(next.getMonth() + delta);
      return next;
    });
  }

  const { isPending, isError, data, error, dataUpdatedAt } = useRead(
    dashboard.overview,
    undefined,
    { enabled: activeTab === "overview" },
  );

  const {
    isPending: monthlyIsPending,
    isError: monthlyIsError,
    data: monthlyData,
    error: monthlyError,
    dataUpdatedAt: monthlyDataUpdatedAt,
  } = useRead(
    dashboard.monthly,
    { month: selectedMonth, year: selectedYear },
    { enabled: activeTab === "monthly" },
  );

  return (
    <Tabs
      value={activeTab}
      onValueChange={setActiveTab}
      className="mx-auto flex min-h-[calc(100dvh-6rem)] max-w-[88rem] flex-col gap-8 md:min-h-[calc(100dvh-7rem)]"
    >
      <div className="flex flex-col gap-2">
        <div className="flex flex-row flex-wrap items-center gap-4">
          {activeTab === "overview" ? (
            <h1 className="page-title">
              Welcome back
              <span className="hidden sm:inline">
                , {session?.user.username}{" "}
                <span className="text-[0.8em] font-normal text-muted-foreground">{kaomoji}</span>
              </span>
            </h1>
          ) : (
            <div
              className="inline-flex max-w-full items-center gap-1"
              role="group"
              aria-label="Select month"
            >
              <h1 className="min-w-28 shrink-0 text-left page-title tabular-nums">
                {monthYearLabel.format(visibleMonth)}
              </h1>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => shiftMonth(-1)}
                aria-label="Previous month"
              >
                <HugeiconsIcon icon={PreviousIcon} strokeWidth={2} className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => shiftMonth(1)}
                aria-label="Next month"
              >
                <HugeiconsIcon icon={NextIcon} strokeWidth={2} className="size-3.5" />
              </Button>
            </div>
          )}
          <TabsList className="ml-auto shrink-0">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="monthly">Monthly</TabsTrigger>
          </TabsList>
        </div>
      </div>
      <TabsContent value="overview" className="flex flex-col gap-8 text-base">
        {activeTab === "overview" && (
          <OverviewTab
            data={data}
            dataUpdatedAt={dataUpdatedAt}
            isLoading={isPending}
            isError={isError}
            error={error}
            currency={userCurrency}
            locale={userLocale}
            dateFormat={dateFormat}
          />
        )}
      </TabsContent>
      <TabsContent value="monthly" className="flex flex-col gap-8 text-base">
        {activeTab === "monthly" && (
          <MonthlyTab
            data={monthlyData}
            dataUpdatedAt={monthlyDataUpdatedAt}
            isLoading={monthlyIsPending}
            isError={monthlyIsError}
            error={monthlyError}
            currency={userCurrency}
            locale={userLocale}
            dateFormat={dateFormat}
            month={selectedMonth}
            year={selectedYear}
          />
        )}
      </TabsContent>
    </Tabs>
  );
}
