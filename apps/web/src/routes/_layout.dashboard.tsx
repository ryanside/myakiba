import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { client } from "@/lib/hono-client";
import { Suspense } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import Loader from "@/components/loader";
import {
  Package,
  ShoppingCart,
  DollarSign,
  Star,
  PiggyBank,
  Flame,
  Calendar,
  type LucideIcon,
  NotepadText,
} from "lucide-react";
import { ChartPieDonutText } from "@/components/pie-chart-donut-text";
import { ChartBarLabelCustom } from "@/components/chart-bar-label-custom";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_layout/dashboard")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="space-y-4">
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent />
      </Suspense>
    </div>
  );
}

function DashboardContent() {
  async function getDashboard() {
    const response = await client.api.dashboard.$get();

    if (!response.ok) {
      throw new Error("Failed to get dashboard");
    }
    const data = await response.json();
    return data;
  }

  const { isPending, isError, data, error } = useQuery({
    queryKey: ["dashboard"],
    queryFn: getDashboard,
    staleTime: Infinity,
    retry: false,
  });

  if (isPending) {
    return <DashboardSkeleton />;
  }

  if (isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-destructive">Error</CardTitle>
          <CardDescription>
            Failed to load dashboard data: {error.message}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const { dashboard } = data;
  const {
    collectionStats,
    categoriesOwned,
    orders,
    ordersSummary,
    budgetSummary,
    upcomingReleases,
    latestCollectionItems,
  } = dashboard;

  const chartBarData = {
    totalSpent: collectionStats[0].totalSpent,
    totalShipping: ordersSummary[0].totalShippingAllTime,
    totalTaxes: ordersSummary[0].totalTaxesAllTime,
    totalDuties: ordersSummary[0].totalDutiesAllTime,
    totalTariffs: ordersSummary[0].totalTariffsAllTime,
    totalMiscFees: ordersSummary[0].totalMiscFeesAllTime,
  };

  const chartBarThisMonthData = {
    totalSpent: collectionStats[0].totalSpentThisMonth,
    totalShipping: ordersSummary[0].thisMonthShipping,
    totalTaxes: ordersSummary[0].thisMonthTaxes,
    totalDuties: ordersSummary[0].thisMonthDuties,
    totalTariffs: ordersSummary[0].thisMonthTariffs,
    totalMiscFees: ordersSummary[0].thisMonthMiscFees,
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Total Items"
          value={collectionStats[0].totalItems || 0}
          subtitle="this month"
          subvalue={`+${collectionStats[0].itemsThisMonth || 0}`}
          icon={Star}
        />
        <StatsCard
          title="Total Spent"
          value={`$${(
            Number(collectionStats[0].totalSpent || 0) +
            Number(ordersSummary[0].totalShippingAllTime || 0) +
            Number(ordersSummary[0].totalTaxesAllTime || 0) +
            Number(ordersSummary[0].totalDutiesAllTime || 0) +
            Number(ordersSummary[0].totalTariffsAllTime || 0) +
            Number(ordersSummary[0].totalMiscFeesAllTime || 0)
          ).toFixed(2)}`}
          subtitle="this month"
          subvalue={`+$${Number(collectionStats[0].totalSpentThisMonth || 0).toFixed(2)}`}
          icon={DollarSign}
        />
        <StatsCard
          title="Orders"
          value={ordersSummary[0].totalActiveOrderCount || 0}
          subtitle="this month"
          subvalue={ordersSummary[0].thisMonthOrderCount || 0}
          icon={ShoppingCart}
        />
        <StatsCard
          title="Budget"
          value={budgetSummary[0]?.amount || "0.00"}
          subtitle={`this month`}
          subvalue={
            Number(budgetSummary[0]?.amount || 0) -
              Number(collectionStats[0].totalSpentThisMonth || 0) || "0.00"
          }
          icon={PiggyBank}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-3">
        <ChartPieDonutText data={categoriesOwned} />

        <ChartBarLabelCustom data={chartBarData} />

        <Card className="col-span-1">
          <CardHeader className="flex flex-row items-center space-y-0 gap-2">
            <NotepadText className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="font-medium">Orders Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between text-muted-foreground text-sm items-center">
                <span>Active Orders</span>
                <span>
                  {ordersSummary[0].totalActiveOrderCount || 0}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground text-sm items-center">
                <span>Orders This Month</span>
                <span>
                  {ordersSummary[0].thisMonthOrderCount || 0}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground text-sm items-center">
                <span>Total Item Costs</span>
                <span>
                  $
                  {Number(
                    collectionStats[0].totalActiveOrderPrice || 0
                  ).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground text-sm items-center">
                <span>Total Shipping</span>
                <span>
                  $
                  {Number(
                    ordersSummary[0].totalActiveOrderShipping || 0
                  ).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground text-sm items-center">
                <span>Total Taxes</span>
                <span>
                  $
                  {Number(ordersSummary[0].totalActiveOrderTaxes || 0).toFixed(
                    2
                  )}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground text-sm items-center">
                <span>Total Duties</span>
                <span>
                  $
                  {Number(ordersSummary[0].totalActiveOrderDuties || 0).toFixed(
                    2
                  )}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground text-sm items-center">
                <span>Total Tariffs</span>
                <span>
                  $
                  {Number(
                    ordersSummary[0].totalActiveOrderTariffs || 0
                  ).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground text-sm items-center">
                <span>Total Misc Fees</span>
                <span>
                  $
                  {Number(
                    ordersSummary[0].totalActiveOrderMiscFees || 0
                  ).toFixed(2)}
                </span>
              </div>
            </div>
          </CardContent>
          <div className="flex justify-between items-center mt-auto px-6 text-foreground font-medium text-sm">
            <span>Total</span>
            <span>
              $
              {(
                Number(collectionStats[0].totalActiveOrderPrice) +
                Number(ordersSummary[0].totalActiveOrderShipping) +
                Number(ordersSummary[0].totalActiveOrderTaxes) +
                Number(ordersSummary[0].totalActiveOrderDuties) +
                Number(ordersSummary[0].totalActiveOrderTariffs) +
                Number(ordersSummary[0].totalActiveOrderMiscFees)
              ).toFixed(2)}
            </span>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-3 lg:grid-rows-2">
        <Card className="lg:col-span-2 lg:row-span-2">
          <CardHeader className="flex flex-row items-center space-y-0 gap-2">
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="font-medium">Orders</CardTitle>
          </CardHeader>
          <CardContent className="flex-1">
            <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2">
              {orders.map((order) => (
                <Card key={order.orderId}>
                  <CardHeader className="">
                    <CardTitle className="text-pretty">{order.title}</CardTitle>
                    <CardDescription>
                      {order.shop ? `${order.shop} • ` : ""}{" "}
                      {order.releaseMonthYear} •{" "}
                      <span className="text-foreground font-medium">
                        ${order.total}
                      </span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="mt-auto">
                    {order.itemImages && order.itemImages.length > 0 && (
                      <div className="flex gap-2 mb-3">
                        {order.itemImages.slice(0, 3).map((image, idx) => (
                          <div
                            key={idx}
                            className="relative h-16 w-16 rounded-md overflow-hidden bg-muted"
                          >
                            <img
                              src={image}
                              alt="Item"
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          </div>
                        ))}
                        {order.itemImages.length > 3 && (
                          <div className="h-16 w-16 rounded-md bg-muted flex items-center justify-center text-xs text-muted-foreground">
                            +{order.itemImages.length - 3}
                          </div>
                        )}
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Package className="h-4 w-4" />
                      {order.itemIds.length || 0} items
                    </div>
                  </CardContent>
                </Card>
              ))}
              {orders.length === 0 && (
                <div className="col-span-full">
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No recent orders found
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        <Card className="lg:col-span-1 lg:row-span-1 flex flex-col">
          <CardHeader className="flex flex-row items-center space-y-0 gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="font-medium">Upcoming Releases</CardTitle>
          </CardHeader>
          <CardContent className="flex-1">
            <div className="space-y-3">
              {upcomingReleases && upcomingReleases.length > 0 ? (
                upcomingReleases.map((release) => (
                  <div
                    key={`${release.itemId}-${release.releaseDate}`}
                    className="flex items-center gap-3 p-2 rounded-md hover:bg-muted transition-colors"
                  >
                    {release.image && (
                      <div className="h-12 w-12 rounded-md overflow-hidden bg-muted flex-shrink-0">
                        <img
                          src={release.image}
                          alt={release.title}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {release.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {release.category}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-xs text-muted-foreground">
                          {release.releaseDate} <span>•</span>{" "}
                          {release.price && (
                            <span className="text-xs text-foreground font-medium">
                              {release.price}
                              {release.priceCurrency}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No upcoming releases found
                </p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card className="lg:col-span-1 lg:row-span-1 flex flex-col">
          <CardHeader className="flex flex-row items-center space-y-0 gap-2">
            <Flame className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="font-medium">Activity</CardTitle>
          </CardHeader>
          <CardContent className="flex-1">
            <div className="space-y-3">
              {latestCollectionItems && latestCollectionItems.length > 0 ? (
                latestCollectionItems.map((collectionItem) => (
                  <div
                    key={`${collectionItem.itemId}`}
                    className="flex items-center gap-3 p-2 rounded-md hover:bg-muted transition-colors"
                  >
                    {collectionItem.image && (
                      <div className="h-12 w-12 rounded-md overflow-hidden bg-muted flex-shrink-0">
                        <img
                          src={collectionItem.image}
                          alt={collectionItem.title}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    )}
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="text-sm font-medium truncate">
                        {collectionItem.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        <span
                          className={`${collectionItem.status === "Owned" ? "text-primary" : "text-secondary"} font-medium`}
                        >
                          {collectionItem.status}
                        </span>{" "}
                        <span>•</span> {collectionItem.category} <span>•</span>{" "}
                        {new Date(
                          collectionItem.createdAt
                        ).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No recent activity found
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatsCard({
  title,
  value,
  subtitle,
  subvalue,
  icon: Icon,
}: {
  title: string;
  value: string | number;
  subtitle: string;
  subvalue: string | number;
  icon: LucideIcon;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center space-y-0 gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-row items-baseline gap-2">
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-primary">
            {subvalue} {subtitle}
          </p>
        </div>

        {/* <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
        <p className="text-xs text-muted-foreground">{subValue}</p> */}
      </CardContent>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-4" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16 mb-2" />
              <Skeleton className="h-3 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[...Array(4)].map((_, j) => (
                  <div key={j} className="flex justify-between items-center">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-12" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-3">
        <Card className="lg:col-span-2 row-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <Skeleton className="h-6 w-24" />
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2">
              {[...Array(6)].map((_, i) => (
                <Card key={i} className="border-2">
                  <CardHeader className="pb-3">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-4 w-24" />
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex gap-2 mb-3">
                      {[...Array(3)].map((_, j) => (
                        <Skeleton key={j} className="h-16 w-16 rounded-md" />
                      ))}
                    </div>
                    <Skeleton className="h-4 w-20" />
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-1">
          <CardHeader>
            <Skeleton className="h-5 w-36" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-12 w-12 rounded-md" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-24 mb-1" />
                    <Skeleton className="h-3 w-16 mb-2" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-1">
          <CardHeader>
            <Skeleton className="h-5 w-20" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Skeleton className="h-4 w-32" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
