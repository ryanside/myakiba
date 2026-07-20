import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { CollectionBreakdown } from "@/components/dashboard/collection-breakdown";
import OrderKanban from "@/components/dashboard/order-kanban";
import { OrdersBarChart } from "@/components/dashboard/orders-bar-chart";
import { ReleaseCalendar } from "@/components/dashboard/release-calendar";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KPICard } from "@/components/ui/kpi-card";
import type { DateFormat, Currency } from "@myakiba/contracts/shared/types";
import type { DashboardResponse } from "@/queries/dashboard";

interface OverviewTabProps {
  readonly data: DashboardResponse | undefined;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly error: Error | null;
  readonly currency: Currency;
  readonly locale: string;
  readonly dateFormat: DateFormat;
}

export function OverviewTab({
  data,
  isLoading,
  isError,
  error,
  currency,
  locale,
  dateFormat,
}: OverviewTabProps) {
  if (isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-destructive">Error</CardTitle>
          <CardDescription>Failed to load dashboard data: {error?.message}</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  const {
    collectionStats,
    categoriesOwned,
    orders,
    ordersSummary,
    unpaidOrderCount,
    unpaidCosts,
    monthlyOrders,
  } = data ?? {
    collectionStats: { totalItems: 0, totalSpent: 0 },
    categoriesOwned: [],
    orders: [],
    ordersSummary: {
      totalShippingAllTime: 0,
      totalTaxesAllTime: 0,
      totalDutiesAllTime: 0,
      totalTariffsAllTime: 0,
      totalMiscFeesAllTime: 0,
    },
    unpaidOrderCount: 0,
    unpaidCosts: 0,
    monthlyOrders: [],
  };

  const totalSpent =
    Number(collectionStats.totalSpent) +
    Number(ordersSummary.totalShippingAllTime) +
    Number(ordersSummary.totalTaxesAllTime) +
    Number(ordersSummary.totalDutiesAllTime) +
    Number(ordersSummary.totalTariffsAllTime) +
    Number(ordersSummary.totalMiscFeesAllTime);

  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="Total Items"
          subtitle="all collection items"
          value={collectionStats.totalItems}
          isLoading={isLoading}
        />
        <KPICard
          title="Total Spent"
          subtitle="based on paid collection & orders"
          value={formatCurrencyFromMinorUnits(totalSpent, currency, locale)}
          isLoading={isLoading}
        />
        <KPICard
          title="Active Orders"
          subtitle="orders not yet collected"
          value={ordersSummary.totalActiveOrderCount}
          subvalueTitle="unpaid"
          subvalue={unpaidOrderCount}
          isLoading={isLoading}
        />
        <KPICard
          title="Unpaid Costs"
          subtitle="costs with status 'Ordered'"
          value={formatCurrencyFromMinorUnits(unpaidCosts, currency, locale)}
          isLoading={isLoading}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <CollectionBreakdown
          data={categoriesOwned}
          currency={currency}
          locale={locale}
          isLoading={isLoading}
        />
        <OrdersBarChart data={monthlyOrders} isLoading={isLoading} />
        <ReleaseCalendar currency={currency} />
      </div>

      <OrderKanban
        orders={orders}
        isLoading={isLoading}
        currency={currency}
        dateFormat={dateFormat}
      />
    </>
  );
}
