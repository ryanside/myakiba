import { createFileRoute } from "@tanstack/react-router";
import OrdersDataGrid from "@/components/orders/orders-data-grid";
import { OrdersQuickFilters } from "@/components/orders/orders-quick-filters";
import { searchSchema } from "@myakiba/contracts/orders/schema";
import { KPICard } from "@/components/ui/kpi-card";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { useOrdersQuery } from "@/hooks/use-orders";
import { useUserPreferences } from "@/hooks/use-user-preferences";

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
  const { currency, locale } = useUserPreferences();
  const { isError, status, isPending, totalCount, totalSpent, activeOrders, unpaidCosts } =
    useOrdersQuery();

  if (isError) {
    return (
      <div className="flex flex-col gap-4 mx-auto max-w-[88rem]">
        <div className="flex flex-col gap-2">
          <div className="flex flex-row items-start gap-4">
            <h1 className="text-2xl tracking-tight font-heading font-medium">Orders</h1>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center h-64 gap-y-4">
          <div className="text-lg font-medium text-destructive">Error: {status}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 mx-auto max-w-[88rem]">
      <div className="flex flex-col gap-2 mb-2">
        <div className="flex flex-row items-start gap-4">
          <h1 className="text-2xl tracking-tight font-heading font-medium">Orders</h1>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <KPICard
          title="Total Orders"
          subtitle="across current filters"
          value={isPending ? undefined : totalCount}
          isLoading={isPending}
        />
        <KPICard
          title="Total Spent"
          subtitle="including all fees"
          value={isPending ? undefined : formatCurrencyFromMinorUnits(totalSpent, currency, locale)}
          isLoading={isPending}
        />
        <KPICard
          title="Active Orders"
          subtitle="orders without status 'Owned'"
          value={isPending ? undefined : activeOrders}
          isLoading={isPending}
        />
        <KPICard
          title="Unpaid Costs"
          subtitle="costs with status 'Ordered'"
          value={
            isPending ? undefined : formatCurrencyFromMinorUnits(unpaidCosts, currency, locale)
          }
          isLoading={isPending}
        />
      </div>
      <OrdersQuickFilters />
      <OrdersDataGrid key="orders-data-grid" />
    </div>
  );
}
