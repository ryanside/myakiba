import type { Result } from "better-result";
import { call } from "@/data/api";
import type { ApiFailure } from "@/data/api";
import { app } from "@/lib/treaty-client";

type DashboardClient = typeof app.api.dashboard;

export type DashboardResponse = NonNullable<Awaited<ReturnType<DashboardClient["get"]>>["data"]>;
export type MonthlyData = NonNullable<
  Awaited<ReturnType<DashboardClient["monthly"]["get"]>>["data"]
>;
export type CostBreakdownData = MonthlyData["costBreakdown"];
export type ShopBreakdownEntry = MonthlyData["shopBreakdown"][number];
export type DashboardKanbanOrder = MonthlyData["orders"][number];
export type ReleaseCalendarData = NonNullable<
  Awaited<ReturnType<DashboardClient["release-calendar"]["get"]>>["data"]
>;
export type ReleaseItem = ReleaseCalendarData["releaseCalendar"]["releases"][number];

export function getDashboard(): Promise<Result<DashboardResponse, ApiFailure>> {
  return call(app.api.dashboard.get(), { fallback: "Failed to get dashboard" });
}

export function getMonthlyDashboard(
  month: number,
  year: number,
): Promise<Result<MonthlyData, ApiFailure>> {
  return call(
    app.api.dashboard["monthly"].get({
      query: { month, year },
    }),
    { fallback: "Failed to get monthly dashboard" },
  );
}

export function getReleaseCalendar(
  month: number,
  year: number,
): Promise<Result<ReleaseCalendarData, ApiFailure>> {
  return call(app.api.dashboard["release-calendar"].get({ query: { month, year } }), {
    fallback: "Failed to get release calendar",
    invalid: "Invalid month or year",
  });
}
