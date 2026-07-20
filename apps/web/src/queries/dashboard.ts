import { app, getErrorMessage } from "@/lib/treaty-client";

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
  const { data, error } = await app.api.dashboard.get();
  if (error) {
    throw new Error(error.value || "Failed to get dashboard");
  }

  return data;
}

export async function getMonthlyDashboard(month: number, year: number): Promise<MonthlyData> {
  const { data, error } = await app.api.dashboard["monthly"].get({
    query: { month, year },
  });
  if (error) {
    throw new Error(getErrorMessage(error, "Failed to get monthly dashboard"));
  }

  return data;
}

export async function getReleaseCalendar(
  month: number,
  year: number,
): Promise<ReleaseCalendarData> {
  const { data, error } = await app.api.dashboard["release-calendar"].get({
    query: { month, year },
  });
  if (error) {
    if (error.status === 422) {
      throw new Error(getErrorMessage(error, "Invalid month or year"));
    }
    throw new Error(getErrorMessage(error, "Failed to get release calendar"));
  }

  return data;
}
