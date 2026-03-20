import { createFileRoute } from "@tanstack/react-router";
import OrdersDataGrid from "@/components/orders/orders-data-grid";
import { searchSchema } from "@myakiba/schemas/search";
import { KPICard } from "@/components/ui/kpi-card";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { useOrdersQuery, useOrderStatsQuery } from "@/hooks/use-orders";
import { useUserPreferences } from "@/hooks/use-collection";

export const Route = createFileRoute("/(app)/orders")({
  component: RouteComponent,
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      {
        name: "description",
        content: "your orders",
      },
      {
        title: "Orders - myakiba",
      },
    ],
  }),
});

function RouteComponent() {
  const { currency } = useUserPreferences();
  const { isError, status } = useOrdersQuery();
  const { orderStats, isStatsPending } = useOrderStatsQuery();

  if (isError) {
    return (
      <div className="w-full space-y-8">
        <div className="flex flex-col gap-2">
          <div className="flex flex-row items-start gap-4">
            <h1 className="text-2xl tracking-tight">Orders</h1>
          </div>
          <p className="text-muted-foreground text-sm font-normal">Manage and track your orders</p>
        </div>
        <div className="flex flex-col items-center justify-center h-64 gap-y-4">
          <div className="text-lg font-medium text-destructive">Error: {status}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 mx-auto w-full">
      <div className="flex flex-col gap-2 mb-4">
        <div className="flex flex-row items-start gap-4">
          <h1 className="text-2xl tracking-tight">Orders</h1>
        </div>
        <p className="text-muted-foreground text-sm font-normal">Manage and track your orders</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <KPICard
          title="Total Orders"
          subtitle="all time"
          value={orderStats?.totalOrders}
          isLoading={isStatsPending}
        />
        <KPICard
          title="Total Spent"
          subtitle="all time, including all fees"
          value={
            orderStats ? formatCurrencyFromMinorUnits(orderStats.totalSpent, currency) : undefined
          }
          isLoading={isStatsPending}
        />
        <KPICard
          title="Active Orders"
          subtitle="orders without status 'Owned'"
          value={orderStats?.activeOrders}
          isLoading={isStatsPending}
        />
        <KPICard
          title="Unpaid Costs"
          subtitle="costs with status 'Ordered'"
          value={
            orderStats ? formatCurrencyFromMinorUnits(orderStats.unpaidCosts, currency) : undefined
          }
          isLoading={isStatsPending}
        />
      </div>
      <OrdersDataGrid key="orders-data-grid" />
    </div>
  );
}
