import { type ReactElement, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import * as z from "zod";
import { MonthlyTab } from "@/components/dashboard/monthly-tab";
import { OverviewTab } from "@/components/dashboard/overview-tab";
import { Button } from "@/components/ui/button";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import { randomKaomoji } from "@/lib/kaomoji";
import { getDashboard, getMonthlyDashboard } from "@/queries/dashboard";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";

function getCurrentVisibleMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export const Route = createFileRoute("/(app)/dashboard")({
  validateSearch: z.object({
    tab: z.enum(["overview", "monthly"]).optional(),
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
  const { tab } = Route.useSearch();
  const { currency: userCurrency, locale: userLocale, dateFormat } = useUserPreferences();
  const [kaomoji] = useState(randomKaomoji);
  const activeTab = tab ?? "overview";
  const [visibleMonth, setVisibleMonth] = useState<Date>(getCurrentVisibleMonth);

  const monthYearLabel = useMemo(
    () => new Intl.DateTimeFormat(userLocale, { month: "short", year: "numeric" }),
    [userLocale],
  );

  const selectedMonth = visibleMonth.getMonth() + 1;
  const selectedYear = visibleMonth.getFullYear();

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

  const { isPending, isError, data, error } = useQuery({
    queryKey: ["dashboard"],
    queryFn: getDashboard,
    staleTime: 1000 * 60 * 5,
    retry: false,
    enabled: activeTab === "overview",
  });

  const {
    isPending: monthlyIsPending,
    isError: monthlyIsError,
    data: monthlyData,
    error: monthlyError,
  } = useQuery({
    queryKey: ["dashboard", "monthly", selectedMonth, selectedYear],
    queryFn: () => getMonthlyDashboard(selectedMonth, selectedYear),
    staleTime: 1000 * 60 * 5,
    retry: false,
    enabled: activeTab === "monthly",
  });

  return (
    <div className="flex flex-col gap-4 mx-auto">
      <div className="flex flex-col gap-2 mb-4">
        <div className="flex flex-row items-start gap-4">
          {activeTab === "overview" ? (
            <h1 className="text-2xl tracking-tight font-heading font-medium">
              Welcome
              <span className="hidden sm:inline">
                , {session?.user.username}. {kaomoji}
              </span>
            </h1>
          ) : (
            <div
              className="inline-flex max-w-full items-center gap-1"
              role="group"
              aria-label="Select month"
            >
              <h1 className="w-28 min-w-0 shrink-0 truncate text-left text-2xl tracking-tight font-heading font-medium tabular-nums">
                {monthYearLabel.format(visibleMonth)}
              </h1>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => shiftMonth(-1)}
                aria-label="Previous month"
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => shiftMonth(1)}
                aria-label="Next month"
              >
                <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="size-3.5" />
              </Button>
            </div>
          )}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="ml-auto shrink-0">
            <TabsList variant="line">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="monthly">Monthly</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <p className="text-muted-foreground text-sm font-normal">
          {activeTab === "overview"
            ? "Here's your collection and orders at a glance."
            : "Spending, releases, and orders for this month."}
        </p>
      </div>
      {activeTab === "overview" && (
        <OverviewTab
          data={data}
          isLoading={isPending}
          isError={isError}
          error={error}
          currency={userCurrency}
          locale={userLocale}
          dateFormat={dateFormat}
        />
      )}
      {activeTab === "monthly" && (
        <MonthlyTab
          data={monthlyData}
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
    </div>
  );
}
