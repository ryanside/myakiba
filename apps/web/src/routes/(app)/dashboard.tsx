import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { app } from "@/lib/treaty-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { CollectionBreakdown } from "@/components/dashboard/collection-breakdown";
import { BudgetControlCard } from "@/components/dashboard/budget-control-card";
import { ReleaseCalendar } from "@/components/dashboard/release-calendar";
import { UnpaidOrders } from "@/components/dashboard/unpaid-orders";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils";
import { Button } from "@/components/ui/button";
import OrderKanban from "@/components/dashboard/order-kanban";
import { Badge } from "@/components/ui/badge";
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
  const navigate = useNavigate();
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

  const {
    collectionStats,
    categoriesOwned,
    orders,
    ordersSummary,
    budgetSummary,
    unpaidOrders,
    monthlyOrders,
  } = data;

  return (
    <div className="">
      <div className="flex flex-col lg:flex-row items-start mb-6 gap-4">
        <h1 className="text-2xl tracking-tight font-medium">
          Welcome,{" "}
          <span className="text-muted-foreground">{session?.user.username} (づ｡◕‿‿◕｡)づ</span>
        </h1>
        <div className="flex flex-row flex-wrap items-center gap-2 lg:ml-auto">
          <Button
            variant="outline"
            size="md"
            onClick={() => {
              navigate({
                to: "/sync/collection",
              });
            }}
          >
            <Plus className="h-4 w-4" />
            Add Collection Item
          </Button>
          <Button
            variant="outline"
            size="md"
            onClick={() => {
              navigate({
                to: "/sync/order",
              });
            }}
          >
            <Plus className="h-4 w-4" />
            Add Order
          </Button>
        </div>
      </div>
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-4">
        <div className="col-span-1 lg:col-span-3 border-dashed space-y-4 flex flex-col">
          <div className="grid gap-4 grid-cols-1 lg:grid-cols-3 border-dashed">
            <div className="col-span-1 lg:col-span-3 grid grid-cols-1 lg:grid-cols-3 gap-4">
              <CollectionBreakdown data={categoriesOwned} currency={userCurrency} />
              <ValueLineBarChart data={monthlyOrders} />
              <div className="flex flex-col gap-4 col-span-1 h-full">
                <KPICard
                  title="Total Spent"
                  subtitle="based on paid collection & order items"
                  value={formatCurrencyFromMinorUnits(
                    Number(collectionStats[0].totalSpent),
                    userCurrency,
                  )}
                  subvalueTitle="this month"
                  subvalue={formatCurrencyFromMinorUnits(
                    Number(collectionStats[0].totalSpentThisMonth) +
                      Number(ordersSummary[0].thisMonthShipping) +
                      Number(ordersSummary[0].thisMonthTaxes) +
                      Number(ordersSummary[0].thisMonthDuties) +
                      Number(ordersSummary[0].thisMonthTariffs) +
                      Number(ordersSummary[0].thisMonthMiscFees),
                    userCurrency,
                  )}
                />
                <KPICard
                  title="Active Orders"
                  subtitle="orders not yet collected"
                  value={ordersSummary[0].totalActiveOrderCount}
                  subvalueTitle="unpaid"
                  subvalue={unpaidOrders.length}
                />
              </div>
            </div>
          </div>
          <Card className="col-span-1 lg:col-span-3 h-full">
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
        <div className="col-span-1 space-y-4 flex flex-col">
          <BudgetControlCard
            currentSpent={
              budgetSummary.length > 0
                ? Number(collectionStats[0].totalSpentThisMonth) +
                  Number(ordersSummary[0].thisMonthShipping) +
                  Number(ordersSummary[0].thisMonthTaxes) +
                  Number(ordersSummary[0].thisMonthDuties) +
                  Number(ordersSummary[0].thisMonthTariffs) +
                  Number(ordersSummary[0].thisMonthMiscFees)
                : undefined
            }
            limit={budgetSummary.length > 0 ? budgetSummary[0].amount : undefined}
            currency={userCurrency}
            warningThreshold={75}
          />
          <Card className="min-h-[210px]">
            <CardHeader className="flex flex-row items-center gap-2">
              <CardTitle className="text-md font-medium">Release Calendar</CardTitle>
            </CardHeader>
            <CardContent>
              <ReleaseCalendar currency={userCurrency} dateFormat={dateFormat} />
            </CardContent>
          </Card>
          <Card className="flex-1">
            <CardHeader className="flex flex-row items-center gap-2">
              <CardTitle className="text-md font-medium">Unpaid Orders</CardTitle>
              <Badge variant="outline">{unpaidOrders.length}</Badge>
              <Badge variant="info" appearance="outline">
                {formatCurrencyFromMinorUnits(
                  unpaidOrders.reduce((acc, order) => acc + Number(order.total), 0),
                  userCurrency,
                )}
              </Badge>
            </CardHeader>
            <CardContent>
              <UnpaidOrders orders={unpaidOrders} currency={userCurrency} dateFormat={dateFormat} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
