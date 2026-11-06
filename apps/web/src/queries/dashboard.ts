import { requireData } from "@/lib/api-response";
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

export async function getDashboard(): Promise<DashboardResponse> {
  return requireData(app.api.dashboard.get(), "Failed to get dashboard");
}

export async function getMonthlyDashboard(month: number, year: number): Promise<MonthlyData> {
  return requireData(
    app.api.dashboard.monthly.get({ query: { month, year } }),
    "Failed to get monthly dashboard",
  );
}

export async function getReleaseCalendar(
  month: number,
  year: number,
): Promise<ReleaseCalendarData> {
  return requireData(
    app.api.dashboard["release-calendar"].get({ query: { month, year } }),
    "Failed to get release calendar",
  );
}
