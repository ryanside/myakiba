import { app, getErrorMessage } from "@/lib/treaty-client";

export interface CostBreakdownData {
  readonly items: number;
  readonly shipping: number;
  readonly taxes: number;
  readonly duties: number;
  readonly tariffs: number;
  readonly miscFees: number;
}

export interface ShopBreakdownEntry {
  readonly shopName: string;
  readonly orderCount: number;
  readonly totalAmount: number;
}

export interface DashboardKanbanOrder {
  readonly orderId: string;
  readonly title: string;
  readonly shop: string;
  readonly status: "Ordered" | "Paid" | "Shipped" | "Owned";
  readonly releaseDate: string | null;
  readonly orderDate?: string | null;
  readonly paymentDate?: string | null;
  readonly shippingDate?: string | null;
  readonly collectionDate?: string | null;
  readonly itemImages: readonly string[];
  readonly itemIds: readonly string[];
  readonly total: number;
}

export interface MonthlyData {
  readonly itemCount: number;
  readonly orderCount: number;
  readonly unpaidOrderCount: number;
  readonly paidAmount: number;
  readonly unpaidAmount: number;
  readonly shopBreakdown: ReadonlyArray<ShopBreakdownEntry>;
  readonly costBreakdown: CostBreakdownData;
  readonly orders: ReadonlyArray<DashboardKanbanOrder>;
}

export type DashboardResponse = NonNullable<
  Awaited<ReturnType<typeof app.api.dashboard.get>>["data"]
>;

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
