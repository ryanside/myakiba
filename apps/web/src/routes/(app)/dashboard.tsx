import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { client } from "@/lib/hono-client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Link } from "@tanstack/react-router";
import { ChartPieDonutText } from "@/components/dashboard/pie-chart-donut-text";
import { ChartBarLabelCustom } from "@/components/dashboard/chart-bar-label-custom";
import { formatCurrency } from "@/lib/utils";
import { authClient } from "@/lib/auth-client";
import { DashboardSkeleton } from "@/components/skeletons/dashboard-skeleton";

export const Route = createFileRoute("/(app)/dashboard")({
  component: RouteComponent,
  head: ({ params }) => ({
    meta: [
      {
        name: "description",
        content: `your dashboard`,
      },
      {
        title: `Dashboard — myakiba`,
      },
    ],
    links: [
      {
        rel: "icon",
        href: "/favicon.ico",
      },
    ],
    scripts: [],
  }),
});

function RouteComponent() {
  return <DashboardContent />;
}

function DashboardContent() {
  const { data: session } = authClient.useSession();
  const userCurrency = session?.user.currency || "USD";

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
    staleTime: 1000 * 60 * 5,
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

  // const chartBarThisMonthData = {
  //   totalSpent: collectionStats[0].totalSpentThisMonth,
  //   totalShipping: ordersSummary[0].thisMonthShipping,
  //   totalTaxes: ordersSummary[0].thisMonthTaxes,
  //   totalDuties: ordersSummary[0].thisMonthDuties,
  //   totalTariffs: ordersSummary[0].thisMonthTariffs,
  //   totalMiscFees: ordersSummary[0].thisMonthMiscFees,
  // };

  return (
    <div className="space-y-4">
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
          value={formatCurrency(
            Number(collectionStats[0].totalSpent || 0) +
              Number(ordersSummary[0].totalShippingAllTime || 0) +
              Number(ordersSummary[0].totalTaxesAllTime || 0) +
              Number(ordersSummary[0].totalDutiesAllTime || 0) +
              Number(ordersSummary[0].totalTariffsAllTime || 0) +
              Number(ordersSummary[0].totalMiscFeesAllTime || 0),
            userCurrency
          )}
          subtitle="this month"
          subvalue={`+${formatCurrency(
            collectionStats[0].totalSpentThisMonth || 0,
            userCurrency
          )}`}
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
          title="Budget [coming soon]"
          value={formatCurrency(budgetSummary[0]?.amount || 0, userCurrency)}
          subtitle={`this month`}
          subvalue={0}
          icon={PiggyBank}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-3">
        <ChartPieDonutText
          data={categoriesOwned}
          className="h-[250px] -mt-5.5"
          innerRadius={75}
          currency={userCurrency}
        />

        <ChartBarLabelCustom data={chartBarData} currency={userCurrency} />

        <Card className="col-span-1">
          <CardHeader className="flex flex-row items-center gap-2">
            <NotepadText className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="font-medium">Orders Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between text-muted-foreground text-sm items-center">
                <span>Active Orders</span>
                <span className="text-foreground">
                  {ordersSummary[0].totalActiveOrderCount || 0}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground text-sm items-center">
                <span>Orders This Month</span>
                <span className="text-foreground">
                  {ordersSummary[0].thisMonthOrderCount || 0}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground text-sm items-center">
                <span>Total Item Costs</span>
                <span className="text-foreground">
                  {formatCurrency(
                    collectionStats[0].totalActiveOrderPrice || 0,
                    userCurrency
                  )}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground text-sm items-center">
                <span>Total Shipping</span>
                <span className="text-foreground">
                  {formatCurrency(
                    ordersSummary[0].totalActiveOrderShipping || 0,
                    userCurrency
                  )}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground text-sm items-center">
                <span>Total Taxes</span>
                <span className="text-foreground">
                  {formatCurrency(
                    ordersSummary[0].totalActiveOrderTaxes || 0,
                    userCurrency
                  )}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground text-sm items-center">
                <span>Total Duties</span>
                <span className="text-foreground">
                  {formatCurrency(
                    ordersSummary[0].totalActiveOrderDuties || 0,
                    userCurrency
                  )}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground text-sm items-center">
                <span>Total Tariffs</span>
                <span className="text-foreground">
                  {formatCurrency(
                    ordersSummary[0].totalActiveOrderTariffs || 0,
                    userCurrency
                  )}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground text-sm items-center">
                <span>Total Misc Fees</span>
                <span className="text-foreground">
                  {formatCurrency(
                    ordersSummary[0].totalActiveOrderMiscFees || 0,
                    userCurrency
                  )}
                </span>
              </div>
            </div>
          </CardContent>
          <div className="flex justify-between items-center mt-auto px-6 text-foreground font-medium text-sm">
            <span>Total</span>
            <span>
              {formatCurrency(
                Number(collectionStats[0].totalActiveOrderPrice || 0) +
                  Number(ordersSummary[0].totalActiveOrderShipping || 0) +
                  Number(ordersSummary[0].totalActiveOrderTaxes || 0) +
                  Number(ordersSummary[0].totalActiveOrderDuties || 0) +
                  Number(ordersSummary[0].totalActiveOrderTariffs || 0) +
                  Number(ordersSummary[0].totalActiveOrderMiscFees || 0),
                userCurrency
              )}
            </span>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-3 lg:grid-rows-2">
        <Card className="lg:col-span-2 lg:row-span-2">
          <CardHeader className="flex flex-row items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="font-medium">Orders</CardTitle>
          </CardHeader>
          <CardContent className="flex-1">
            <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2">
              {orders.map((order) => (
                <Link to={`/orders/$id`} params={{ id: order.orderId }}>
                  <Card key={order.orderId} className="h-[210px]">
                    <CardHeader className="">
                      <CardTitle className="truncate">{order.title}</CardTitle>
                      <CardDescription>
                        {order.shop ? `${order.shop} • ` : ""}{" "}
                        {order.releaseMonthYear
                          ? `${order.releaseMonthYear} • `
                          : ""}
                        <span className="text-foreground font-medium">
                          {formatCurrency(order.total, userCurrency)}
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
                                width="64"
                                height="64"
                                style={{ maxWidth: "64px", maxHeight: "64px" }}
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
                        {/* TODO: REFACTOR ORDER QUERY IN DASHBOARD, TEMP FIX */}
                        {order.itemIds[0] !== null ? order.itemIds.length : 0}{" "}
                        items
                      </div>
                    </CardContent>
                  </Card>
                </Link>
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
          <CardHeader className="flex flex-row items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="font-medium">Upcoming Releases</CardTitle>
          </CardHeader>
          <CardContent className="flex-1">
            <div className="space-y-3">
              {upcomingReleases && upcomingReleases.length > 0 ? (
                upcomingReleases.map((release) => (
                  <Link
                    key={`${release.itemId}-${release.releaseDate}`}
                    to={`/items/$id`}
                    params={{ id: release.itemId.toString() }}
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
                      <div className="flex items-center gap-4 mt-1">
                        <p className="text-xs text-muted-foreground">
                          {release.releaseDate} <span>•</span>{" "}
                          {release.price && release.priceCurrency && (
                            <span className="text-xs text-foreground font-medium">
                              {formatCurrency(
                                release.price,
                                release.priceCurrency
                              )}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  </Link>
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
          <CardHeader className="flex flex-row items-center gap-2">
            <Flame className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="font-medium">Activity</CardTitle>
          </CardHeader>
          <CardContent className="flex-1">
            <div className="space-y-3">
              {latestCollectionItems && latestCollectionItems.length > 0 ? (
                latestCollectionItems.map((collectionItem) => (
                  <Link
                    key={`${collectionItem.itemId}`}
                    to={`/items/$id`}
                    params={{ id: collectionItem.itemId.toString() }}
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
                    <div className="min-w-0 space-y-1">
                      <p className="text-sm font-medium truncate">
                        {collectionItem.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        <span className={`text-primary font-medium`}>
                          {collectionItem.status}
                        </span>{" "}
                        <span>•</span> {collectionItem.category} <span>•</span>{" "}
                        {new Date(
                          collectionItem.createdAt
                        ).toLocaleDateString()}
                      </p>
                    </div>
                  </Link>
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
      <CardHeader className="flex flex-row items-center gap-2">
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
