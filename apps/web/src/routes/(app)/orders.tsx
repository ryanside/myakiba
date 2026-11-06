import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import OrdersDataGrid from "@/components/orders/orders-data-grid";
import { searchSchema } from "@myakiba/contracts/orders/schema";
import { KPICard, KPIGroup } from "@/components/ui/kpi-card";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { useOrdersQuery } from "@/hooks/use-orders";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import { PageHeader } from "@/components/page-header";
import { OrdersQuickFilters } from "@/components/orders/orders-quick-filters";
import { LoadError } from "@/components/page-states";
import { DEFAULT_LIMIT } from "@myakiba/contracts/shared/constants";

export const Route = createFileRoute("/(app)/orders")({
  component: RouteComponent,
  validateSearch: searchSchema,
  search: {
    middlewares: [
      stripSearchParams({ limit: DEFAULT_LIMIT, offset: 0, sort: "createdAt", order: "desc" }),
    ],
  },
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
  const { isError, error, isPending, totalCount, totalSpent, activeOrders, unpaidCosts } =
    useOrdersQuery();

  if (isError) {
    return (
      <div className="mx-auto flex flex-col gap-8 max-w-[88rem]">
        <PageHeader title="Orders" />
        <LoadError title="Couldn't load your Orders" message={error?.message || undefined} />
      </div>
    );
  }

  return (
    <div className="mx-auto flex flex-col gap-8 max-w-[88rem]">
      <PageHeader title="Orders" />
      <KPIGroup>
        <KPICard
          title="Total Orders"
          value={isPending ? undefined : totalCount}
          isLoading={isPending}
        />
        <KPICard
          title="Order Spend"
          value={isPending ? undefined : formatCurrencyFromMinorUnits(totalSpent, currency, locale)}
          isLoading={isPending}
        />
        <KPICard
          title="Active Orders"
          value={isPending ? undefined : activeOrders}
          isLoading={isPending}
        />
        <KPICard
          title="Unpaid Costs"
          value={
            isPending ? undefined : formatCurrencyFromMinorUnits(unpaidCosts, currency, locale)
          }
          isLoading={isPending}
        />
      </KPIGroup>
      <OrdersQuickFilters />
      <OrdersDataGrid key="orders-data-grid" />
    </div>
  );
}
