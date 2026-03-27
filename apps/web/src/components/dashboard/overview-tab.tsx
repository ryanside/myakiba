import { Link } from "@tanstack/react-router";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { CollectionBreakdown } from "@/components/dashboard/collection-breakdown";
import OrderKanban from "@/components/dashboard/order-kanban";
import { OrdersBarChart } from "@/components/dashboard/orders-bar-chart";
import { ReleaseCalendar } from "@/components/dashboard/release-calendar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  const { collectionStats, categoriesOwned, orders, ordersSummary, unpaidOrders, monthlyOrders } =
    data ?? {
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
      unpaidOrders: [],
      monthlyOrders: [],
    };

  const totalSpent =
    Number(collectionStats.totalSpent) +
    Number(ordersSummary.totalShippingAllTime) +
    Number(ordersSummary.totalTaxesAllTime) +
    Number(ordersSummary.totalDutiesAllTime) +
    Number(ordersSummary.totalTariffsAllTime) +
    Number(ordersSummary.totalMiscFeesAllTime);

  const unpaidCosts = unpaidOrders.reduce((total, order) => total + Number(order.total), 0);

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
          subvalue={unpaidOrders.length}
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
      <Card className="h-dvh">
        <CardHeader className="flex flex-row items-center gap-2">
          <div className="flex flex-col items-start gap-1">
            <CardTitle className="text-base font-medium">Orders Board</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              quickly manage upcoming active orders
            </CardDescription>
          </div>
          <Link to="/orders" className="ml-auto">
            <Button variant="outline" className="rounded-md">
              View All
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="flex-1 min-h-0">
          <OrderKanban
            orders={orders}
            isLoading={isLoading}
            currency={currency}
            dateFormat={dateFormat}
          />
        </CardContent>
      </Card>
    </>
  );
}
