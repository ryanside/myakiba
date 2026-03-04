import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { app } from "@/lib/treaty-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@tanstack/react-router";
import { CollectionBreakdown } from "@/components/dashboard/collection-breakdown";
import { ReleaseCalendar } from "@/components/dashboard/release-calendar";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils";
import { Button } from "@/components/ui/button";
import OrderKanban from "@/components/dashboard/order-kanban";
import { ValueLineBarChart } from "@/components/ui/value-line-bar-chart";
import { KPICard } from "@/components/ui/kpi-card";
import Loader from "@/components/loader";
import type { DateFormat } from "@myakiba/types";

export const Route = createFileRoute("/(app)/dashboard")({
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

function RouteComponent() {
  return <DashboardContent />;
}

function DashboardContent() {
  const { session } = Route.useRouteContext();
  const userCurrency = session?.user.currency;
  const dateFormat = session?.user.dateFormat as DateFormat;

  async function getDashboard() {
    const { data, error } = await app.api.dashboard.get();

    if (error) {
      throw new Error(error.value || "Failed to get dashboard");
    }
    return data;
  }

  const { isPending, isError, data, error } = useQuery({
    queryKey: ["dashboard"],
    queryFn: getDashboard,
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  if (isPending) {
    return <Loader />;
  }

  if (isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-destructive">Error</CardTitle>
          <CardDescription>Failed to load dashboard data: {error.message}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const { collectionStats, categoriesOwned, orders, ordersSummary, unpaidOrders, monthlyOrders } =
    data;

  return (
    <div className="flex flex-col gap-4 mx-auto">
      <div className="flex flex-col gap-2 mb-6">
        <div className="flex flex-row items-start gap-4">
          <h1 className="text-2xl tracking-tight">
            Welcome, <span className="">{session?.user.username}.</span>
          </h1>
        </div>
        <p className="text-muted-foreground text-sm font-light text-balance ">
          You have {ordersSummary[0]?.totalActiveOrderCount ?? 0} active orders,{" "}
          {unpaidOrders.length} unpaid orders, and {ordersSummary[0]?.thisMonthOrderCount ?? 0}{" "}
          orders this month.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Total Items"
          subtitle="all collection items"
          value={collectionStats[0]?.totalItems ?? 0}
        />
        <KPICard
          title="Total Spent"
          subtitle="based on paid collection & orders"
          value={formatCurrencyFromMinorUnits(
            Number(collectionStats[0]?.totalSpent ?? 0) +
              Number(ordersSummary[0]?.totalShippingAllTime ?? 0) +
              Number(ordersSummary[0]?.totalTaxesAllTime ?? 0) +
              Number(ordersSummary[0]?.totalDutiesAllTime ?? 0) +
              Number(ordersSummary[0]?.totalTariffsAllTime ?? 0) +
              Number(ordersSummary[0]?.totalMiscFeesAllTime ?? 0),
            userCurrency,
          )}
        />
        <KPICard
          title="Active Orders"
          subtitle="orders not yet collected"
          value={ordersSummary[0]?.totalActiveOrderCount ?? 0}
          subvalueTitle="unpaid"
          subvalue={unpaidOrders.length}
        />
        <KPICard
          title="Unpaid Costs"
          subtitle="costs with status 'Ordered'"
          value={formatCurrencyFromMinorUnits(
            unpaidOrders.reduce((acc, order) => acc + Number(order.total), 0),
            userCurrency,
          )}
        />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <CollectionBreakdown data={categoriesOwned} currency={userCurrency} />
        <ValueLineBarChart data={monthlyOrders} />
        <Card className="min-h-[210px]">
          <CardHeader className="flex flex-row items-center gap-2">
            <CardTitle className="text-md font-medium">Release Calendar</CardTitle>
          </CardHeader>
          <CardContent>
            <ReleaseCalendar currency={userCurrency} dateFormat={dateFormat} />
          </CardContent>
        </Card>
      </div>
      <Card className="h-full">
        <CardHeader className="flex flex-row items-center gap-2">
          <div className="flex flex-col items-start gap-2">
            <CardTitle className="text-md font-medium">Orders Board</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Quickly manage upcoming active orders
            </CardDescription>
          </div>
          <Link to="/orders" className="ml-auto">
            <Button variant="outline" size="md" className="rounded-md">
              View All
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="h-full">
          <OrderKanban orders={orders} currency={userCurrency} dateFormat={dateFormat} />
        </CardContent>
      </Card>
    </div>
  );
}
